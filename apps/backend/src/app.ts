import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type {
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from '@mokshavoice/shared-types';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer<SocketClientToServerEvents, SocketServerToClientEvents>;
  }
}

import { prisma } from './lib/prisma.js';
import { env } from './lib/env.js';

import { authRoutes } from './routes/auth/index.js';
import { sessionRoutes } from './routes/sessions/index.js';
import { subscriptionRoutes } from './routes/subscriptions/index.js';
import { audioRoutes } from './routes/audio.js';
import { dreamsRoute } from './routes/dreams.js';
import { decoderRoutes } from './routes/decoder.js';
import { adminRoutes } from './routes/admin.js';
import { revenueCatWebhookRoute } from './routes/webhooks/revenuecat.js';
import { stripeWebhookRoute } from './routes/webhooks/stripe.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    trustProxy: true,
  });

  // ── Security ────────────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  });

  // ── Rate limiting ────────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    redis: new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD }),
  });

  // ── JWT ──────────────────────────────────────────────────────────────────────
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '15m' },
  });

  // ── Multipart (audio uploads) ────────────────────────────────────────────────
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max audio
  });

  // ── Routes (Stripe webhook MUST be registered before body parser) ────────────
  await app.register(stripeWebhookRoute, { prefix: '/v1/webhooks' });
  await app.register(revenueCatWebhookRoute, { prefix: '/v1/webhooks' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  // /v1/me/fcm-token alias expected by the mobile app layout
  await app.register(authRoutes, { prefix: '/v1/me' });
  await app.register(sessionRoutes, { prefix: '/v1/sessions' });
  await app.register(subscriptionRoutes, { prefix: '/v1' });
  await app.register(audioRoutes, { prefix: '/v1/audio' });
  await app.register(dreamsRoute, { prefix: '/v1/dreams' });
  await app.register(decoderRoutes, { prefix: '/v1/decoder' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // ── Global error handler ──────────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: statusCode >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  return app;
}

export async function buildSocketIO(
  app: FastifyInstance,
): Promise<SocketIOServer<SocketClientToServerEvents, SocketServerToClientEvents>> {
  const pubClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  });
  const subClient = pubClient.duplicate();

  const io = new SocketIOServer<SocketClientToServerEvents, SocketServerToClientEvents>(
    app.server,
    {
      cors: { origin: env.ALLOWED_ORIGINS.split(','), credentials: true },
      adapter: createAdapter(pubClient, subClient),
    },
  );

  // Make io accessible in route handlers via fastify.io
  app.decorate('io', io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth['token'] as string | undefined;
      if (!token) return next(new Error('Missing auth token'));
      const payload = app.jwt.verify<{ sub: string; role: string }>(token);
      socket.data['userId'] = payload.sub;
      socket.data['role'] = payload.role;
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data['userId'] as string;
    app.log.info(`Socket connected: ${socket.id} (user=${userId})`);

    socket.on('join:session', async ({ session_id }) => {
      const session = await prisma.session.findUnique({
        where: { id: session_id },
        include: { participants: true },
      });
      if (!session) return;

      const isMember =
        session.customerId === userId ||
        session.claimedBy === userId ||
        session.participants.some((p) => p.userId === userId);

      if (isMember) {
        await socket.join(session_id);
        app.log.info(`User ${userId} joined room ${session_id}`);
      }
    });

    socket.on('typing', ({ session_id, is_typing }) => {
      socket.to(session_id).emit('typing', {
        session_id,
        user_id: userId,
        is_typing,
      });
    });

    socket.on('disconnect', () => {
      app.log.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}
