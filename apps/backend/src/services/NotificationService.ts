import { getMessaging } from 'firebase-admin/messaging';
import { prisma } from '../lib/prisma.js';
import type { NotificationType } from '@mokshavoice/shared-types';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class NotificationService {
  static async sendPush(userId: string, payload: PushPayload): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) return;

    try {
      await getMessaging().send({
        token: user.fcmToken,
        notification: { title: payload.title, body: payload.body },
        ...(payload.data !== undefined && { data: payload.data }),
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        android: { priority: 'high', notification: { sound: 'default' } },
      });
    } catch (err) {
      // Token may be stale — log but do not throw
      console.warn(`FCM send failed for user ${userId}:`, err);
    }

    await NotificationService.persist(userId, (payload.data?.['type'] ?? 'GENERIC') as NotificationType, payload as unknown as Record<string, unknown>);
  }

  static async persist(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await prisma.notification.create({
      data: { userId, type, payload: payload as never, read: false },
    });
  }
}
