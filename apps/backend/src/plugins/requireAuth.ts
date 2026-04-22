import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import type { Role } from '@mokshavoice/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    user: { sub: string; role: Role; phone: string };
  }
}

export function requireAuth(fastify: FastifyInstance, requiredRoles?: Role[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
    done?: HookHandlerDoneFunction,
  ) => {
    try {
      await request.jwtVerify();
      const payload = request.user as unknown as { sub: string; role: Role; phone: string };
      request.user = payload;

      if (requiredRoles && !requiredRoles.includes(payload.role)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  };
}
