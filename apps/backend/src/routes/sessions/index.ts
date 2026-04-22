import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { quotaService } from '../../services/QuotaService.js';
import { audioService } from '../../services/AudioService.js';
import { requireAuth } from '../../plugins/requireAuth.js';

const sessionQuerySchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'COMPLETED']).optional(),
  sort: z.enum(['priority', 'createdAt']).default('priority'),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const messageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(30).default(30),
});

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify));

  // POST /sessions — create new dream session
  fastify.post('/', async (request, reply) => {
    const userId = request.user.sub;
    const { session, quota } = await createSessionForUser(userId);
    return reply.status(201).send({ session, quota });
  });

  // GET /sessions
  fastify.get('/', async (request, reply) => {
    const userId = request.user.sub;
    const role = request.user.role;
    const q = sessionQuerySchema.parse(request.query);

    const where =
      role === 'CUSTOMER'
        ? { customerId: userId, ...(q.status ? { status: q.status } : {}) }
        : { ...(q.status ? { status: q.status } : {}) };

    const sessions = await prisma.session.findMany({
      where,
      orderBy: q.sort === 'priority' ? [{ priority: 'asc' }, { createdAt: 'asc' }] : [{ createdAt: 'desc' }],
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { type: true, content: true, createdAt: true },
        },
      },
    });

    return reply.send({
      data: sessions.map(({ messages, _count, ...s }) => ({
        ...s,
        messageCount: _count.messages,
        lastMessage: messages[0] ?? null,
      })),
      nextCursor: sessions.length === q.limit ? sessions[sessions.length - 1]?.id : null,
      hasMore: sessions.length === q.limit,
    });
  });

  // GET /sessions/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const session = await prisma.session.findUnique({
      where: { id },
      include: { participants: true, _count: { select: { messages: true } } },
    });
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return reply.send(session);
  });

  // PATCH /sessions/:id/claim
  fastify.patch('/:id/claim', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const decoderId = request.user.sub;

    const session = await prisma.session.update({
      where: { id, status: 'NEW' },
      data: {
        claimedBy: decoderId,
        status: 'IN_PROGRESS',
        participants: {
          upsert: {
            where: { sessionId_userId: { sessionId: id, userId: decoderId } },
            create: { userId: decoderId, roleInSession: 'DECODER' },
            update: {},
          },
        },
      },
    });

    return reply.send(session);
  });

  // PATCH /sessions/:id/complete
  fastify.patch('/:id/complete', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const session = await prisma.session.update({
      where: { id, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return reply.send(session);
  });

  // GET /sessions/:id/messages
  fastify.get('/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = messageQuerySchema.parse(request.query);

    const messages = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, displayName: true, role: true } } },
    });

    // audioUrl in DB holds the raw S3 key — sign each voice message for delivery
    const signed = audioService.signMessageAudioUrls(messages.reverse());

    return reply.send({
      data: signed,
      nextCursor: messages.length === q.limit ? messages[0]?.id : null,
      hasMore: messages.length === q.limit,
    });
  });

  // POST /sessions/:id/messages
  fastify.post('/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const senderId = request.user.sub;

    const rawBody = request.body as Record<string, unknown>;
    const msgType = rawBody['type'];

    if (msgType === 'VOICE') {
      // Two-step presigned-URL flow:
      //   1. Client called POST /audio/presigned-upload → got messageId + key
      //   2. Client PUT audio directly to S3
      //   3. Now client registers the message record here
      const voiceBody = z
        .object({
          type: z.literal('VOICE'),
          messageId: z.string().uuid(),   // pre-issued by /audio/presigned-upload
          audioKey: z
            .string()
            .regex(/^audio\/[^/]+\/[^/]+\.m4a$/, 'Invalid audio key format'),
          audioDurationS: z.number().int().min(1).max(600),
          isDreamSubmission: z.boolean().default(false),
        })
        .parse(rawBody);

      // Validate key belongs to this session and matches the declared messageId
      const expectedKey = audioService.buildKey(id, voiceBody.messageId);
      if (voiceBody.audioKey !== expectedKey) {
        return reply.status(400).send({
          error: 'audioKey does not match sessionId / messageId combination',
        });
      }

      const message = await prisma.message.create({
        data: {
          id: voiceBody.messageId,          // pin DB id to audio filename id
          sessionId: id,
          senderId,
          type: 'VOICE',
          audioUrl: voiceBody.audioKey,     // store raw S3 key — signed on read
          audioDurationS: voiceBody.audioDurationS,
          isDreamSubmission: voiceBody.isDreamSubmission,
        },
        include: { sender: { select: { id: true, displayName: true, role: true } } },
      });

      // Serve with a fresh signed URL in the response
      return reply.status(201).send({
        ...message,
        audioUrl: audioService.getPlaybackUrl(message.audioUrl!),
      });
    }

    // TEXT message
    const textBody = z
      .object({ type: z.literal('TEXT'), content: z.string().min(1).max(4000) })
      .parse(rawBody);

    const message = await prisma.message.create({
      data: { sessionId: id, senderId, type: 'TEXT', content: textBody.content },
      include: { sender: { select: { id: true, displayName: true, role: true } } },
    });

    return reply.status(201).send(message);
  });
};

async function createSessionForUser(userId: string) {
  const { status, used, limit, subscription } = await quotaService.checkQuota(userId);

  const priority =
    status === 'queued' ? 3 : subscription.plan === 'PREMIUM' ? 1 : 2;

  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.session.create({
      data: {
        customerId: userId,
        priority,
        participants: {
          create: { userId, roleInSession: 'CUSTOMER' },
        },
      },
    });
    await tx.subscription.update({
      where: { userId },
      data: { dreamsUsed: { increment: 1 } },
    });
    return s;
  });

  return { session, quota: { allowed: true, status, used: used + 1, limit } };
}
