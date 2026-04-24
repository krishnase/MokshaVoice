import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/requireAuth.js';

const listQuery = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'COMPLETED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const decoderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify, ['DECODER', 'MENTOR', 'ADMIN']));

  // GET /v1/decoder/queue?status=NEW
  fastify.get('/queue', async (request, reply) => {
    const q = listQuery.parse(request.query);
    const status = q.status ?? 'NEW';

    const sessions = await prisma.session.findMany({
      where: { status },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { id: true, phone: true, displayName: true } },
        claimer: { select: { id: true, phone: true, displayName: true } },
        _count: { select: { messages: true } },
        messages: {
          where: { isDreamSubmission: true },
          orderBy: { createdAt: 'asc' },
          select: { type: true, content: true, audioDurationS: true },
        },
      },
    });

    return reply.send({
      data: sessions,
      nextCursor: sessions.length === q.limit ? sessions[sessions.length - 1]?.id : null,
      hasMore: sessions.length === q.limit,
    });
  });

  // GET /v1/decoder/team — list of decoders/mentors/admins for assignment picker
  fastify.get('/team', async (_request, reply) => {
    const members = await prisma.user.findMany({
      where: { role: { in: ['DECODER', 'MENTOR', 'ADMIN'] } },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, phone: true, displayName: true, role: true },
    });
    return reply.send(members);
  });

  // GET /v1/decoder/my-sessions
  fastify.get('/my-sessions', async (request, reply) => {
    const decoderId = request.user.sub;
    const q = listQuery.parse(request.query);

    const sessions = await prisma.session.findMany({
      where: { claimedBy: decoderId },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { id: true, phone: true, displayName: true } },
        _count: { select: { messages: true } },
        messages: {
          where: { isDreamSubmission: true },
          select: { type: true, content: true, audioDurationS: true },
          take: 3,
        },
      },
    });

    return reply.send({
      data: sessions,
      nextCursor: sessions.length === q.limit ? sessions[sessions.length - 1]?.id : null,
      hasMore: sessions.length === q.limit,
    });
  });
};
