import { prisma } from '../lib/prisma.js';
import type { QuotaResult } from '@mokshavoice/shared-types';
import type { Subscription } from '@prisma/client';

export class QuotaService {
  static readonly FREE_LIMIT     = 5;
  static readonly SILVER_LIMIT   = 15;
  static readonly GOLD_LIMIT     = 30;
  static readonly PLATINUM_LIMIT = 999; // effectively unlimited

  static limitForPlan(plan: Subscription['plan']): number {
    if (plan === 'PLATINUM') return QuotaService.PLATINUM_LIMIT;
    if (plan === 'GOLD')     return QuotaService.GOLD_LIMIT;
    if (plan === 'SILVER')   return QuotaService.SILVER_LIMIT;
    return QuotaService.FREE_LIMIT;
  }

  async checkQuota(userId: string): Promise<QuotaResult & { subscription: Subscription }> {
    const sub = await this.getOrCreateSubscription(userId);
    const limit = QuotaService.limitForPlan(sub.plan);
    const allowed = true; // always allow; over-limit = queued
    const status = sub.dreamsUsed < limit ? 'active' : 'queued';

    return { allowed, status, used: sub.dreamsUsed, limit, subscription: sub };
  }

  async incrementDreamsUsed(userId: string): Promise<Subscription> {
    return prisma.subscription.update({
      where: { userId },
      data: { dreamsUsed: { increment: 1 } },
    });
  }

  async resetCycle(userId: string): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);
    const limit = QuotaService.limitForPlan(sub.plan);

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { userId },
        data: {
          dreamsUsed: 0,
          cycleResetAt: new Date(),
        },
      });

      // Re-prioritize any queued sessions
      const newPriority = sub.plan === 'PLATINUM' || sub.plan === 'GOLD' || sub.plan === 'SILVER' ? 1 : 2;
      await tx.session.updateMany({
        where: { customerId: userId, status: 'NEW', priority: 3 },
        data: { priority: newPriority },
      });

      // Tag excess sessions as queued again if plan reverted to starter/free
      if (sub.plan === 'FREE') {
        const sessions = await tx.session.findMany({
          where: { customerId: userId, status: 'NEW' },
          orderBy: { createdAt: 'asc' },
          skip: limit,
        });
        if (sessions.length > 0) {
          await tx.session.updateMany({
            where: { id: { in: sessions.map((s) => s.id) } },
            data: { priority: 3 },
          });
        }
      }
    });
  }

  private async getOrCreateSubscription(userId: string): Promise<Subscription> {
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    if (existing) return existing;

    return prisma.subscription.create({
      data: {
        userId,
        plan: 'FREE',
        status: 'ACTIVE',
        dreamsUsed: 0,
        cycleResetAt: new Date(),
      },
    });
  }
}

export const quotaService = new QuotaService();
