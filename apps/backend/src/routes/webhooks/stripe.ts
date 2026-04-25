import type { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { NotificationService } from '../../services/NotificationService.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

export const stripeWebhookRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/stripe',
    {
      config: { rawBody: true },
      schema: {},
    },
    async (request, reply) => {
      const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
      const sig = request.headers['stripe-signature'];

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig as string, env.STRIPE_WEBHOOK_SECRET);
      } catch {
        return reply.status(400).send({ error: 'Invalid Stripe signature' });
      }

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata['userId'];
          if (!userId) break;

          const isActive = sub.status === 'active' || sub.status === 'trialing';
          const periodEnd = new Date(sub.current_period_end * 1000);
          const cycleResetAt = new Date(sub.current_period_end * 1000);

          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              plan: isActive ? 'PREMIUM' : 'FREE',
              status: isActive ? 'ACTIVE' : 'EXPIRED',
              provider: 'STRIPE',
              providerSubId: sub.id,
              currentPeriodEnd: periodEnd,
              cycleResetAt,
            },
            update: {
              plan: isActive ? 'PREMIUM' : 'FREE',
              status: isActive ? 'ACTIVE' : 'EXPIRED',
              provider: 'STRIPE',
              providerSubId: sub.id,
              currentPeriodEnd: periodEnd,
              cycleResetAt,
            },
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata['userId'];
          if (!userId) break;

          await prisma.subscription.update({
            where: { userId },
            data: { plan: 'FREE', status: 'EXPIRED', currentPeriodEnd: null },
          });

          await NotificationService.sendPush(userId, {
            title: 'Premium Plan Expired',
            body: 'Your premium plan has expired. Upgrade to continue.',
            data: { type: 'expiry' },
          });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const userId = (invoice.subscription_details?.metadata ?? {})['userId'];
          if (!userId) break;

          await prisma.subscription.update({
            where: { userId },
            data: { status: 'BILLING_ISSUE' },
          });

          await NotificationService.sendPush(userId, {
            title: 'Payment Issue',
            body: 'Payment issue — please update your payment method.',
            data: { type: 'billing_issue' },
          });
          break;
        }

        default:
          break;
      }

      return reply.status(200).send({ received: true });
    },
  );
};
