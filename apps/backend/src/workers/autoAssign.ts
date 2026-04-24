import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';

const QUEUE_NAME = 'auto-assign';

interface AutoAssignJobData {
  sessionId: string;
  customerId: string;
}

let _queue: Queue<AutoAssignJobData> | null = null;

export function getAutoAssignQueue(): Queue<AutoAssignJobData> {
  if (!_queue) {
    _queue = new Queue<AutoAssignJobData>(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _queue;
}

export async function enqueueAutoAssign(sessionId: string, customerId: string): Promise<void> {
  await getAutoAssignQueue().add('check-session', { sessionId, customerId });
}

async function tryAutoAssign(sessionId: string, customerId: string): Promise<boolean> {
  // Find the decoder most recently assigned to any of this customer's sessions
  const previous = await prisma.session.findFirst({
    where: {
      customerId,
      claimedBy: { not: null },
      id: { not: sessionId },
    },
    orderBy: [{ claimedAt: 'desc' }, { createdAt: 'desc' }],
    select: { claimedBy: true },
  });

  if (!previous?.claimedBy) return false;

  // Verify the decoder still has an eligible role
  const decoder = await prisma.user.findUnique({
    where: { id: previous.claimedBy },
    select: { role: true },
  });
  if (!decoder || !['DECODER', 'MENTOR', 'ADMIN'].includes(decoder.role)) return false;

  try {
    await prisma.session.update({
      where: { id: sessionId, status: 'NEW' },
      data: {
        claimedBy: previous.claimedBy,
        status: 'IN_PROGRESS',
        claimedAt: new Date(),
        participants: {
          upsert: {
            where: { sessionId_userId: { sessionId, userId: previous.claimedBy } },
            create: { userId: previous.claimedBy, roleInSession: 'DECODER' },
            update: {},
          },
        },
      },
    });
    console.info(`[auto-assign] Session ${sessionId} → decoder ${previous.claimedBy}`);
    return true;
  } catch {
    // Session already claimed or completed — fine
    return false;
  }
}

// Sweep all NEW sessions and auto-assign where possible.
// Called on a schedule as a safety net.
export async function runAutoAssignSweep(): Promise<void> {
  const pending = await prisma.session.findMany({
    where: { status: 'NEW' },
    select: { id: true, customerId: true },
  });

  let assigned = 0;
  for (const s of pending) {
    if (await tryAutoAssign(s.id, s.customerId)) assigned++;
  }

  if (pending.length > 0) {
    console.info(`[auto-assign] Sweep: checked ${pending.length}, auto-assigned ${assigned}`);
  }
}

export function startAutoAssignWorker(): Worker<AutoAssignJobData> {
  const worker = new Worker<AutoAssignJobData>(
    QUEUE_NAME,
    async (job) => {
      const { sessionId, customerId } = job.data;
      await tryAutoAssign(sessionId, customerId);
    },
    { connection: redis, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[auto-assign] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
