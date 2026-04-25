import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '../../lib/prisma.js';
import { subscriptionService } from '../../services/SubscriptionService.js';
import { QuotaService } from '../../services/QuotaService.js';
import { env } from '../../lib/env.js';
import { requireAuth } from '../../plugins/requireAuth.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

const checkoutBody = z.object({
  priceId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify));

  // GET /me/subscription — source of truth for quota decisions
  fastify.get('/me/subscription', async (request, reply) => {
    const userId = request.user.sub;
    const sub = await prisma.subscription.findUnique({ where: { userId } });

    if (!sub) {
      return reply.send({
        plan: 'FREE',
        status: 'ACTIVE',
        dreamsUsed: 0,
        limit: QuotaService.FREE_LIMIT,
        cycleResetAt: new Date().toISOString(),
        currentPeriodEnd: null,
      });
    }

    return reply.send({
      plan: sub.plan,
      status: sub.status,
      dreamsUsed: sub.dreamsUsed,
      limit: QuotaService.limitForPlan(sub.plan),
      cycleResetAt: sub.cycleResetAt.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    });
  });

  // POST /subscriptions/sync-entitlement — belt-and-suspenders after RC purchase
  fastify.post('/subscriptions/sync-entitlement', async (request, reply) => {
    const userId = request.user.sub;
    const sub = await subscriptionService.syncEntitlementFromRC(userId);

    return reply.send({
      subscription: {
        plan: sub.plan,
        status: sub.status,
        dreamsUsed: sub.dreamsUsed,
        limit: QuotaService.limitForPlan(sub.plan),
        cycleResetAt: sub.cycleResetAt.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      },
    });
  });

  // POST /subscriptions/checkout — Stripe web-only flow
  fastify.post('/subscriptions/checkout', async (request, reply) => {
    const userId = request.user.sub;
    const { priceId, successUrl, cancelUrl } = checkoutBody.parse(request.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
    });

    return reply.send({ checkoutUrl: session.url });
  });
};
