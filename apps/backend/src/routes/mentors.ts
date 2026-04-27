import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/requireAuth.js';

const CALLS_ALLOWED: Record<string, number> = {
  FREE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 999,
};

const bookBody = z.object({
  scheduledAt: z.string().datetime().optional(),
  calendlyEventId: z.string().optional(),
});

export const mentorsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify));

  // GET /v1/mentors/me — customer's assigned mentor
  fastify.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { assignedMentor: { select: { id: true, name: true, bio: true, calendlyUrl: true } } },
    });
    return reply.send({ mentor: user?.assignedMentor ?? null });
  });

  // POST /v1/mentors/book — book with assigned mentor
  fastify.post('/book', async (request, reply) => {
    const { scheduledAt, calendlyEventId } = bookBody.parse(request.body);
    const userId = request.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        assignedMentorId: true,
        assignedMentor: { select: { id: true, name: true, bio: true, active: true } },
        subscription: { select: { plan: true, callsUsed: true } },
      },
    });

    if (!user?.assignedMentorId || !user.assignedMentor?.active) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'No mentor has been assigned to you yet. Please contact support.',
      });
    }

    const plan = user.subscription?.plan ?? 'FREE';
    const allowed = CALLS_ALLOWED[plan] ?? 0;

    if (allowed === 0) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Upgrade your plan to book a consultation call.',
        upgradeRequired: true,
      });
    }

    const callsUsed = user.subscription?.callsUsed ?? 0;
    if (callsUsed >= allowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `You have used all ${allowed} consultation call(s) for this period.`,
        upgradeRequired: true,
      });
    }

    const [consultation] = await prisma.$transaction([
      prisma.consultation.create({
        data: {
          userId,
          mentorId: user.assignedMentorId,
          calendlyEventId: calendlyEventId ?? null,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          status: 'SCHEDULED',
        },
        include: { mentor: { select: { id: true, name: true, bio: true } } },
      }),
      prisma.subscription.update({
        where: { userId },
        data: { callsUsed: { increment: 1 } },
      }),
    ]);

    return reply.status(201).send({ consultation });
  });

  // GET /v1/mentors/consultations — my consultation history
  fastify.get('/consultations', async (request, reply) => {
    const userId = request.user.sub;
    const consultations = await prisma.consultation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { mentor: { select: { id: true, name: true, bio: true, calendlyUrl: true } } },
    });
    return reply.send({ consultations });
  });
};
