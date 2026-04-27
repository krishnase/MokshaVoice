import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { QuotaService } from '../services/QuotaService.js';
import { startAudioCleanupWorker } from './audioCleanup.js';
import { startAutoAssignWorker, runAutoAssignSweep } from './autoAssign.js';

const QUOTA_RESET_QUEUE = 'quota-reset';

export async function startWorkers(): Promise<void> {
  const quotaResetQueue = new Queue(QUOTA_RESET_QUEUE, { connection: redis });

  // Schedule monthly reset as fallback (primary is RC RENEWAL webhook)
  await quotaResetQueue.upsertJobScheduler(
    'monthly-reset-cron',
    { pattern: '0 0 1 * *' }, // 1st of each month at midnight UTC
    { name: 'monthly-reset', data: {} },
  );

  new Worker(
    QUOTA_RESET_QUEUE,
    async () => {
      const now = new Date();
      const subs = await prisma.subscription.findMany({
        where: { cycleResetAt: { lte: now } },
      });

      for (const sub of subs) {
        const newPriority = sub.plan === 'GOLD' || sub.plan === 'SILVER' || sub.plan === 'PLATINUM' ? 1 : 2;
        const nextReset = new Date(sub.cycleResetAt);
        nextReset.setMonth(nextReset.getMonth() + 1);

        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { dreamsUsed: 0, cycleResetAt: nextReset },
          });

          await tx.session.updateMany({
            where: { customerId: sub.userId, status: 'NEW', priority: 3 },
            data: { priority: newPriority },
          });
        });

        console.info(`Quota reset for user ${sub.userId}`);
      }
    },
    { connection: redis, concurrency: 5 },
  );

  startAudioCleanupWorker();
  startAutoAssignWorker();

  // Sweep every 2 minutes as a safety net for any sessions that slipped through
  void runAutoAssignSweep();
  setInterval(() => void runAutoAssignSweep(), 2 * 60 * 1000);

  console.info('BullMQ workers started');
}
