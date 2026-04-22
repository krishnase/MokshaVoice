import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { audioService, ALLOWED_AUDIO_CONTENT_TYPES } from '../services/AudioService.js';
import { requireAuth } from '../plugins/requireAuth.js';

const presignedUploadBody = z.object({
  sessionId: z.string().uuid(),
  contentType: z
    .string()
    .refine((v) => ALLOWED_AUDIO_CONTENT_TYPES.has(v), {
      message: 'Unsupported audio content type',
    })
    .default('audio/m4a'),
  durationS: z.number().int().min(1).max(600).optional(),
});

export const audioRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify));

  /**
   * POST /v1/audio/presigned-upload
   *
   * Returns a one-time S3 presigned PUT URL.
   * Client uploads directly to S3 — backend never sees the audio bytes.
   * After upload succeeds, client POSTs to /sessions/:id/messages with the
   * returned key and messageId to persist the message record.
   *
   * Response:
   *   messageId   — use as the Prisma Message.id when creating the message
   *   key         — S3 object key; store as Message.audioUrl in DB
   *   uploadUrl   — PUT this URL directly from the mobile client (expires 15 min)
   *   playbackUrl — CloudFront signed URL for immediate post-upload preview (15 min)
   */
  fastify.post('/presigned-upload', async (request, reply) => {
    const userId = request.user.sub;
    const { sessionId, contentType, durationS } = presignedUploadBody.parse(request.body);

    // Verify caller has access to this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { customerId: true, claimedBy: true, status: true, participants: true },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const isMember =
      session.customerId === userId ||
      session.claimedBy === userId ||
      session.participants.some((p) => p.userId === userId);

    if (!isMember) {
      return reply.status(403).send({ error: 'Not a participant of this session' });
    }

    if (session.status === 'COMPLETED') {
      return reply.status(409).send({ error: 'Cannot upload audio to a completed session' });
    }

    const result = await audioService.getPresignedUploadUrl(sessionId, contentType);

    return reply.status(200).send({
      ...result,
      durationS: durationS ?? null,
      expiresInSeconds: 900,
    });
  });
};
