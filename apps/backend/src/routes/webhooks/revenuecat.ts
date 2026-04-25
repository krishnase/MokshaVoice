import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { subscriptionService } from '../../services/SubscriptionService.js';
import type { RCWebhookBody } from '@mokshavoice/shared-types';

const rcEventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    aliases: z.array(z.string()).optional(),
    expiration_at_ms: z.number().optional(),
    period_type: z.string().optional(),
    purchased_at_ms: z.number().optional(),
    product_id: z.string().optional(),
    store: z.enum(['APP_STORE', 'PLAY_STORE', 'STRIPE']).optional(),
  }),
  api_version: z.string(),
});

export const revenueCatWebhookRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/revenuecat',
    {
      config: { rawBody: true },
      schema: {},
    },
    async (request, reply) => {
      const rawBody = (request as unknown as { rawBody: string }).rawBody;
      const signature = request.headers['x-revenuecat-signature'] as string | undefined;

      try {
        subscriptionService.verifyRCSignature(rawBody, signature);
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        return reply.status(e.statusCode ?? 401).send({ error: e.message });
      }

      const parsed = rcEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      try {
        await subscriptionService.handleWebhook(parsed.data as RCWebhookBody);
      } catch (err) {
        fastify.log.error(err, 'RevenueCat webhook handler error');
        // Return 200 so RC does not keep retrying for application-level errors
        return reply.status(200).send({ received: true, error: 'Handler error logged' });
      }

      return reply.status(200).send({ received: true });
    },
  );
};
