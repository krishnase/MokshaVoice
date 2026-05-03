import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/requireAuth.js';

const listQuery = z.object({
  status: z.enum(['NEW', 'ANALYZER_REVIEW', 'PENDING_DECODER', 'IN_PROGRESS', 'COMPLETED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const analyzerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify, ['ANALYZER', 'MENTOR', 'ADMIN']));

  // GET /v1/analyzer/queue?status=NEW
  fastify.get('/queue', async (request, reply) => {
    const q = listQuery.parse(request.query);
    const status = q.status ?? 'NEW';

    const sessions = await prisma.session.findMany({
      where: { status },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        customer: {
          select: {
            id: true,
            phone: true,
            fullName: true,
            displayName: true,
            subscription: { select: { plan: true } },
          },
        },
        analyzer: { select: { id: true, phone: true, displayName: true } },
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

  // GET /v1/analyzer/my-sessions
  fastify.get('/my-sessions', async (request, reply) => {
    const analyzerId = request.user.sub;
    const q = listQuery.parse(request.query);

    const sessions = await prisma.session.findMany({
      where: { analyzerId },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { id: true, phone: true, displayName: true, fullName: true } },
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

  // GET /v1/analyzer/decoders — list of decoders to assign to after analysis
  fastify.get('/decoders', async (_request, reply) => {
    const members = await prisma.user.findMany({
      where: { role: { in: ['DECODER', 'MENTOR', 'ADMIN'] } },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, phone: true, displayName: true, role: true },
    });
    return reply.send(members);
  });

  // GET /v1/analyzer/analyzers — list of analyzers to assign dreams to
  fastify.get('/analyzers', async (_request, reply) => {
    const members = await prisma.user.findMany({
      where: { role: { in: ['ANALYZER', 'MENTOR', 'ADMIN'] } },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, phone: true, displayName: true, fullName: true, role: true },
    });
    return reply.send(members);
  });
};
