import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { redis } from '../lib/redis.js';
import type { Role } from '@mokshavoice/shared-types';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  phone: string;
}

export class AuthService {
  // ── OTP ─────────────────────────────────────────────────────────────────────

  async sendOtp(phone: string): Promise<void> {
    // Firebase Phone Auth OTP is triggered client-side via the Firebase SDK.
    // This route exists so the backend can validate the phone format and
    // implement server-side rate limiting before the client calls Firebase.
    const e164 = /^\+[1-9]\d{6,14}$/.test(phone);
    if (!e164) {
      throw Object.assign(new Error('Invalid phone number format. Use E.164 (+14155551234)'), {
        statusCode: 400,
      });
    }

    // Rate limit: max 5 OTP attempts per phone per 10 minutes
    const key = `otp:rate:${phone}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 600);
    if (count > 5) {
      throw Object.assign(new Error('Too many OTP requests. Try again in 10 minutes.'), {
        statusCode: 429,
      });
    }
  }

  // ── Verify OTP & mint JWT ────────────────────────────────────────────────────

  async verifyOtp(
    phone: string,
    firebaseIdToken: string,
    fastifyJwt: { sign: (payload: object, opts?: object) => string },
  ): Promise<TokenPair & { user: Awaited<ReturnType<typeof this.getOrCreateUser>> }> {
    // 1. Verify the Firebase ID token — this is the authoritative OTP check
    let decoded: DecodedIdToken;
    try {
      decoded = await getAuth().verifyIdToken(firebaseIdToken);
    } catch {
      throw Object.assign(new Error('Invalid or expired Firebase ID token'), { statusCode: 401 });
    }

    if (decoded.phone_number !== phone) {
      throw Object.assign(new Error('Phone mismatch'), { statusCode: 400 });
    }

    const user = await this.getOrCreateUser(phone);
    const tokens = await this.mintTokenPair(user.id, user.role, user.phone, fastifyJwt);

    return { ...tokens, user };
  }

  // ── Token refresh ────────────────────────────────────────────────────────────

  async refreshTokens(
    refreshToken: string,
    fastifyJwt: {
      verify: <T>(token: string, opts?: object) => T;
      sign: (payload: object, opts?: object) => string;
    },
  ): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = fastifyJwt.verify<JwtPayload>(refreshToken, { secret: env.JWT_REFRESH_SECRET });
    } catch {
      throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
    }

    // Verify it hasn't been revoked
    const stored = await redis.get(`refresh:${payload.sub}`);
    if (stored !== refreshToken) {
      throw Object.assign(new Error('Refresh token revoked'), { statusCode: 401 });
    }

    return this.mintTokenPair(payload.sub, payload.role, payload.phone, fastifyJwt);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getOrCreateUser(phone: string) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      include: { subscription: true },
    });

    if (existing) return existing;

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { phone } });
      await tx.subscription.create({
        data: {
          userId: user.id,
          plan: 'FREE',
          status: 'ACTIVE',
          dreamsUsed: 0,
          cycleResetAt: new Date(),
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { subscription: true },
      });
    });
  }

  private async mintTokenPair(
    userId: string,
    role: Role,
    phone: string,
    fastifyJwt: { sign: (payload: object, opts?: object) => string },
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, role, phone };

    const accessToken = fastifyJwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = fastifyJwt.sign(payload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: '30d',
    });

    await redis.setex(`refresh:${userId}`, REFRESH_TOKEN_TTL_S, refreshToken);

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();
