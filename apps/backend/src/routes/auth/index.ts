import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authService } from '../../services/AuthService.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../plugins/requireAuth.js';

const sendOtpBody = z.object({ phone: z.string() });
const verifyOtpBody = z.object({ phone: z.string(), firebaseIdToken: z.string() });
const refreshBody = z.object({ refreshToken: z.string() });
const fcmTokenBody = z.object({ token: z.string().min(1) });
const updateProfileBody = z.object({ fullName: z.string().trim().min(1).max(100) });

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/send-otp', async (request, reply) => {
    const { phone } = sendOtpBody.parse(request.body);
    await authService.sendOtp(phone);
    return reply.status(200).send({ message: 'OTP triggered via Firebase client SDK' });
  });

  fastify.post('/verify-otp', async (request, reply) => {
    const { phone, firebaseIdToken } = verifyOtpBody.parse(request.body);
    const result = await authService.verifyOtp(phone, firebaseIdToken, fastify.jwt);
    return reply.status(200).send(result);
  });

  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshBody.parse(request.body);
    const tokens = await authService.refreshTokens(refreshToken, fastify.jwt);
    return reply.status(200).send(tokens);
  });

  // POST /auth/fcm-token  (also accessible as /me/fcm-token via app layout)
  fastify.post('/fcm-token', { onRequest: [requireAuth(fastify)] }, async (request, reply) => {
    const { token } = fcmTokenBody.parse(request.body);
    await prisma.user.update({
      where: { id: request.user.sub },
      data: { fcmToken: token },
    });
    return reply.status(200).send({ ok: true });
  });

  // PUT /auth/profile — set full name after first login
  fastify.put('/profile', { onRequest: [requireAuth(fastify)] }, async (request, reply) => {
    const { fullName } = updateProfileBody.parse(request.body);
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: { fullName },
      include: { subscription: true },
    });
    return reply.status(200).send({ user });
  });
};
