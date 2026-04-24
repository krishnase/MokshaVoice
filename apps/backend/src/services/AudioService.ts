import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCFSignedUrl } from '@aws-sdk/cloudfront-signer';
import { env } from '../lib/env.js';

// Upload window: 15 min. Client must complete PUT before this expires.
const UPLOAD_PRESIGN_TTL_S = 900;
// Playback URL TTL: 15 min. Fresh URL generated on every message fetch.
const PLAYBACK_TTL_S = 900;

// Allowed MIME types for audio uploads
export const ALLOWED_AUDIO_CONTENT_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
]);

export interface PresignedUploadResult {
  messageId: string;
  key: string;
  uploadUrl: string;       // S3 presigned PUT — use once, expires UPLOAD_PRESIGN_TTL_S
  playbackUrl: string;     // CloudFront signed URL — for immediate post-upload preview
}

export class AudioService {
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  // ── Key helpers ───────────────────────────────────────────────────────────

  buildKey(sessionId: string, messageId: string): string {
    return `audio/${sessionId}/${messageId}.m4a`;
  }

  messageIdFromKey(key: string): string {
    // "audio/{sessionId}/{messageId}.m4a" → messageId
    const filename = key.split('/').pop() ?? '';
    return filename.replace(/\.m4a$/, '');
  }

  isAudioKey(value: string): boolean {
    return value.startsWith('audio/') && value.endsWith('.m4a');
  }

  // ── Presigned upload URL (S3 PUT) ─────────────────────────────────────────

  async getPresignedUploadUrl(
    sessionId: string,
    contentType = 'audio/m4a',
  ): Promise<PresignedUploadResult> {
    if (!ALLOWED_AUDIO_CONTENT_TYPES.has(contentType)) {
      throw Object.assign(new Error(`Unsupported content type: ${contentType}`), {
        statusCode: 400,
      });
    }

    const messageId = randomUUID();
    const key = this.buildKey(sessionId, messageId);

    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // Prevent overwrite by requiring exactly this Content-Type from the client
      Metadata: {
        sessionId,
        messageId,
      },
    });

    const uploadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: UPLOAD_PRESIGN_TTL_S,
    });

    const playbackUrl = this.getPlaybackUrl(key);

    return { messageId, key, uploadUrl, playbackUrl };
  }

  // ── CloudFront signed playback URL (synchronous crypto, no network) ───────

  getPlaybackUrl(key: string): string {
    const privateKey = env.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n');
    const url = `${env.CLOUDFRONT_DOMAIN.replace(/\/$/, '')}/${key}`;

    return getCFSignedUrl({
      url,
      keyPairId: env.CLOUDFRONT_KEY_PAIR_ID,
      privateKey,
      dateLessThan: new Date(Date.now() + PLAYBACK_TTL_S * 1000).toISOString(),
    });
  }

  // Sign a batch of messages in one pass — avoids N separate calls in message list handler
  signMessageAudioUrls<T extends { type: string; audioUrl: string | null }>(
    messages: T[],
  ): T[] {
    return messages.map((m) => {
      if (m.type !== 'VOICE' || !m.audioUrl || !this.isAudioKey(m.audioUrl)) return m;
      return { ...m, audioUrl: this.getPlaybackUrl(m.audioUrl) };
    });
  }

  // ── Direct buffer upload (used by POST /v1/dreams) ───────────────────────

  async uploadBuffer(key: string, buffer: Buffer, contentType = 'audio/m4a'): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  // ── S3 deletion helpers ───────────────────────────────────────────────────

  async deleteAudioFile(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key }),
    );
  }

  async deleteSessionAudio(sessionId: string): Promise<number> {
    const prefix = `audio/${sessionId}/`;
    let deleted = 0;
    let continuationToken: string | undefined;

    // S3 ListObjectsV2 returns max 1000 objects per page — loop to handle large sessions
    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listed.Contents ?? [];
      if (objects.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: env.S3_BUCKET_NAME,
            Delete: {
              Objects: objects.map((o) => ({ Key: o.Key! })),
              Quiet: true,
            },
          }),
        );
        deleted += objects.length;
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    return deleted;
  }
}

export const audioService = new AudioService();
