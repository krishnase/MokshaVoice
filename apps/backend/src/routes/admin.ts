import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/requireAuth.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAuth(fastify, ['ADMIN']));

  // GET /v1/admin/stats
  fastify.get('/stats', async (_request, reply) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      usersToday,
      totalDreams,
      pendingDreams,
      inProgressDreams,
      completedDreams,
      dreamsToday,
      totalDecoders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.session.count(),
      prisma.session.count({ where: { status: 'NEW' } }),
      prisma.session.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.session.count({ where: { status: 'COMPLETED' } }),
      prisma.session.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.user.count({ where: { role: { in: ['DECODER', 'MENTOR'] } } }),
    ]);

    return reply.send({
      totalUsers,
      usersToday,
      totalDreams,
      pendingDreams,
      inProgressDreams,
      completedDreams,
      dreamsToday,
      totalDecoders,
    });
  });

  // GET /v1/admin/users?role=&search=&cursor=&limit=
  fastify.get('/users', async (request, reply) => {
    const q = z.object({
      role: z.enum(['CUSTOMER', 'DECODER', 'MENTOR', 'ADMIN']).optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(20),
    }).parse(request.query);

    const where = {
      ...(q.role ? { role: q.role as never } : {}),
      ...(q.search ? {
        OR: [
          { phone: { contains: q.search } },
          { displayName: { contains: q.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        phone: true,
        role: true,
        fullName: true,
        displayName: true,
        createdAt: true,
        subscription: { select: { plan: true, status: true, dreamsUsed: true } },
        assignedMentor: { select: { id: true, name: true } },
        _count: { select: { sessions: true } },
      },
    });

    return reply.send({
      data: users,
      nextCursor: users.length === q.limit ? users[users.length - 1]?.id : null,
      hasMore: users.length === q.limit,
    });
  });

  // PATCH /v1/admin/users/:id/role
  fastify.patch('/users/:id/role', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { role } = z.object({
      role: z.enum(['CUSTOMER', 'DECODER', 'MENTOR', 'ADMIN']),
    }).parse(request.body);

    const user = await prisma.user.update({
      where: { id },
      data: { role: role as never },
      select: { id: true, phone: true, role: true },
    });

    return reply.send(user);
  });

  // PATCH /v1/admin/users/:id/mentor — assign (or unassign) a mentor
  fastify.patch('/users/:id/mentor', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { mentorId } = z.object({
      mentorId: z.string().uuid().nullable(),
    }).parse(request.body);

    if (mentorId) {
      const mentor = await prisma.mentor.findUnique({ where: { id: mentorId } });
      if (!mentor) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Mentor not found.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { assignedMentorId: mentorId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        assignedMentor: { select: { id: true, name: true } },
      },
    });
    return reply.send(user);
  });

  // ── Mentor management ─────────────────────────────────────────────────────────

  const mentorBody = z.object({
    name: z.string().min(2).max(100),
    bio: z.string().max(500).optional(),
    calendlyUrl: z.string().url(),
    active: z.boolean().optional(),
  });

  // GET /v1/admin/mentors
  fastify.get('/mentors', async (_request, reply) => {
    const mentors = await prisma.mentor.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { consultations: true } } },
    });
    return reply.send({ mentors });
  });

  // POST /v1/admin/mentors
  fastify.post('/mentors', async (request, reply) => {
    const parsed = mentorBody.parse(request.body);
    const mentor = await prisma.mentor.create({
      data: {
        name: parsed.name,
        calendlyUrl: parsed.calendlyUrl,
        bio: parsed.bio ?? null,
        ...(parsed.active !== undefined ? { active: parsed.active } : {}),
      } as never,
    });
    return reply.status(201).send({ mentor });
  });

  // PATCH /v1/admin/mentors/:id
  fastify.patch('/mentors/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = mentorBody.partial().parse(request.body);
    const updateData: Record<string, unknown> = {};
    if (parsed.name !== undefined) updateData['name'] = parsed.name;
    if (parsed.calendlyUrl !== undefined) updateData['calendlyUrl'] = parsed.calendlyUrl;
    if (parsed.bio !== undefined) updateData['bio'] = parsed.bio ?? null;
    if (parsed.active !== undefined) updateData['active'] = parsed.active;
    const mentor = await prisma.mentor.update({ where: { id }, data: updateData as never });
    return reply.send({ mentor });
  });

  // DELETE /v1/admin/mentors/:id (soft-delete via active=false)
  fastify.delete('/mentors/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.mentor.update({ where: { id }, data: { active: false } });
    return reply.send({ ok: true });
  });

  // GET /v1/admin/dreams?status=&cursor=&limit=
  fastify.get('/dreams', async (request, reply) => {
    const q = z.object({
      status: z.enum(['NEW', 'IN_PROGRESS', 'COMPLETED']).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(20),
    }).parse(request.query);

    const sessions = await prisma.session.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { id: true, phone: true } },
        claimer: { select: { id: true, phone: true, displayName: true } },
        _count: { select: { messages: true } },
      },
    });

    return reply.send({
      data: sessions,
      nextCursor: sessions.length === q.limit ? sessions[sessions.length - 1]?.id : null,
      hasMore: sessions.length === q.limit,
    });
  });
};
