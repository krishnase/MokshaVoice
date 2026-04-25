import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { audioService } from '../services/AudioService.js';

export const AUDIO_CLEANUP_QUEUE = 'audio-cleanup';

interface AudioCleanupJobData {
  sessionId: string;
  // Optionally pass explicit keys when the session has already been deleted
  // from the DB and we can't look them up. If omitted, AudioService will
  // list + delete the entire audio/{sessionId}/ prefix.
  keys?: string[];
}

let _queue: Queue<AudioCleanupJobData> | null = null;

export function getAudioCleanupQueue(): Queue<AudioCleanupJobData> {
  if (!_queue) {
    _queue = new Queue<AudioCleanupJobData>(AUDIO_CLEANUP_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

export async function enqueueSessionAudioCleanup(
  sessionId: string,
  keys?: string[],
): Promise<void> {
  await getAudioCleanupQueue().add(
    'delete-session-audio',
    { sessionId, ...(keys !== undefined && { keys }) },
    // Delay 30s — gives any in-flight presigned PUTs time to complete
    { delay: 30_000 },
  );
}

export function startAudioCleanupWorker(): Worker<AudioCleanupJobData> {
  const worker = new Worker<AudioCleanupJobData>(
    AUDIO_CLEANUP_QUEUE,
    async (job: Job<AudioCleanupJobData>) => {
      const { sessionId, keys } = job.data;

      if (keys && keys.length > 0) {
        // Delete specific known keys
        await Promise.all(keys.map((k) => audioService.deleteAudioFile(k)));
        console.info(`Audio cleanup: deleted ${keys.length} files for session ${sessionId}`);
      } else {
        // Delete entire session prefix
        const count = await audioService.deleteSessionAudio(sessionId);
        console.info(`Audio cleanup: deleted ${count} files for session ${sessionId}`);
      }
    },
    {
      connection: redis,
      concurrency: 10,
      // Each job should finish well within 5 minutes even for large sessions
      lockDuration: 300_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Audio cleanup job ${job?.id} failed:`, err.message);
  });

  return worker;
}
