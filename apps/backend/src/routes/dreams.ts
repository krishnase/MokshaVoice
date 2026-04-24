import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { audioService } from '../services/AudioService.js';
import { quotaService } from '../services/QuotaService.js';
import { requireAuth } from '../plugins/requireAuth.js';

export const dreamsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify));

  // POST /v1/dreams
  // Accepts multipart/form-data with:
  //   audio      (file, repeatable)   — one entry per recording clip
  //   durationS  (field, repeatable)  — paired by index with each audio entry
  //   text       (field, repeatable)  — one entry per text note
  // At least one audio or text entry is required.
  fastify.post('/', async (request, reply) => {
    const userId = request.user.sub;

    const audioBuffers: Array<{ buffer: Buffer; mimeType: string }> = [];
    const durationValues: number[] = [];
    const textEntries: string[] = [];

    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'audio') {
        audioBuffers.push({
          buffer: await part.toBuffer(),
          mimeType: part.mimetype || 'audio/m4a',
        });
      } else if (part.type === 'field') {
        if (part.fieldname === 'durationS') {
          durationValues.push(parseInt(part.value as string, 10) || 1);
        } else if (part.fieldname === 'text') {
          const v = (part.value as string).trim();
          if (v) textEntries.push(v);
        }
      }
    }

    if (audioBuffers.length === 0 && textEntries.length === 0) {
      return reply
        .status(400)
        .send({ error: 'Provide at least one audio recording or text note' });
    }

    const { status, used, limit, subscription } = await quotaService.checkQuota(userId);
    const priority = status === 'queued' ? 3 : subscription.plan === 'PREMIUM' ? 1 : 2;

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          customerId: userId,
          priority,
          participants: { create: { userId, roleInSession: 'CUSTOMER' } },
        },
      });
      await tx.subscription.update({
        where: { userId },
        data: { dreamsUsed: { increment: 1 } },
      });
      return s;
    });

    // Upload all audio clips and create VOICE messages sequentially
    // (sequential to keep S3 errors visible and avoid overwhelming the upload pipe)
    for (let i = 0; i < audioBuffers.length; i++) {
      const { buffer, mimeType } = audioBuffers[i]!;
      const messageId = randomUUID();
      const key = audioService.buildKey(session.id, messageId);
      await audioService.uploadBuffer(key, buffer, mimeType);
      await prisma.message.create({
        data: {
          id: messageId,
          sessionId: session.id,
          senderId: userId,
          type: 'VOICE',
          audioUrl: key,
          audioDurationS: durationValues[i] ?? null,
          isDreamSubmission: true,
        },
      });
    }

    // Create TEXT messages
    for (const content of textEntries) {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          senderId: userId,
          type: 'TEXT',
          content,
          isDreamSubmission: audioBuffers.length === 0,
        },
      });
    }

    return reply.status(201).send({
      session,
      quota: { allowed: true, status, used: used + 1, limit },
    });
  });
};
