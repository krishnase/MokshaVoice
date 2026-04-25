import { Redis } from 'ioredis';
import { env } from './env.js';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on('error', (err: Error) => console.error('Redis error:', err));
