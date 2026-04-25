import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { QuotaService } from './QuotaService.js';
import { NotificationService } from './NotificationService.js';
import type { RCWebhookEvent, RCWebhookBody } from '@mokshavoice/shared-types';
import type { Subscription } from '@prisma/client';

const RC_API_BASE = 'https://api.revenuecat.com/v1';

export class SubscriptionService {
  // ── RevenueCat webhook dispatch ───────────────────────────────────────────

  verifyRCSignature(rawBody: string, signature: string | undefined): void {
    if (!signature) {
      throw Object.assign(new Error('Missing X-RevenueCat-Signature header'), { statusCode: 401 });
    }
    const expected = createHmac('sha256', env.RC_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
      throw Object.assign(new Error('Invalid RevenueCat signature'), { statusCode: 401 });
    }
  }

  async handleWebhook(body: RCWebhookBody): Promise<void> {
    const { event } = body;
    const userId = await this.resolveUserByRCId(event.app_user_id);
    if (!userId) {
      // User not found — could be a test event or unmapped user; log and skip
      console.warn(`RC webhook: unknown app_user_id ${event.app_user_id}`);
      return;
    }

    switch (event.type) {
      case 'INITIAL_PURCHASE':
        return this.onInitialPurchase(userId, event);
      case 'RENEWAL':
        return this.onRenewal(userId, event);
      case 'CANCELLATION':
        return this.onCancellation(userId, event);
      case 'EXPIRATION':
        return this.onExpiration(userId, event);
      case 'BILLING_ISSUE':
        return this.onBillingIssue(userId, event);
      case 'SUBSCRIBER_ALIAS':
        return this.onSubscriberAlias(event);
      case 'NON_RENEWING_PURCHASE':
        // Not applicable to this business model; handle gracefully
        console.info('RC webhook: NON_RENEWING_PURCHASE received — no action taken');
        return;
      default:
        console.info(`RC webhook: unhandled event type — no action taken`);
    }
  }

  // ── Belt-and-suspenders sync (called from mobile after RC purchase) ─────────

  async syncEntitlementFromRC(userId: string): Promise<Subscription> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rcUserId = user.rcAppUserId ?? userId;

    const response = await fetch(`${RC_API_BASE}/subscribers/${encodeURIComponent(rcUserId)}`, {
      headers: {
        Authorization: `Bearer ${env.RC_SECRET_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`RevenueCat API error: ${response.status} ${response.statusText}`),
        { statusCode: 502 },
      );
    }

    const data = (await response.json()) as {
      subscriber: {
        entitlements: Record<string, { expires_date: string | null; purchase_date: string }>;
        subscriptions: Record<string, { store: string; original_purchase_date: string }>;
      };
    };

    const premiumEntitlement = data.subscriber.entitlements['premium'];
    const isActive =
      premiumEntitlement !== undefined &&
      (premiumEntitlement.expires_date === null ||
        new Date(premiumEntitlement.expires_date) > new Date());

    if (!isActive) {
      return prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'FREE', status: 'ACTIVE' },
        update: { plan: 'FREE', status: 'EXPIRED' },
      });
    }

    const expiresDate = premiumEntitlement.expires_date
      ? new Date(premiumEntitlement.expires_date)
      : null;

    // Determine provider from subscription store info
    const subKey = Object.keys(data.subscriber.subscriptions)[0];
    const store = subKey ? data.subscriber.subscriptions[subKey]?.store : undefined;
    const provider =
      store === 'APP_STORE' ? 'APPLE' : store === 'PLAY_STORE' ? 'GOOGLE' : undefined;

    const cycleResetAt = new Date();
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    return prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: 'PREMIUM',
        status: 'ACTIVE',
        provider: provider ?? null,
        currentPeriodEnd: expiresDate,
        cycleResetAt,
      },
      update: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        provider: provider ?? null,
        currentPeriodEnd: expiresDate,
        cycleResetAt,
      },
    });
  }

  // ── Individual event handlers ─────────────────────────────────────────────

  private async onInitialPurchase(userId: string, event: RCWebhookEvent): Promise<void> {
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const cycleResetAt = new Date();
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    const provider = this.storeToProvider(event.store);

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: 'PREMIUM',
        status: 'ACTIVE',
        provider: provider ?? null,
        providerSubId: event.product_id ?? null,
        currentPeriodEnd: expiresAt,
        cycleResetAt,
      },
      update: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        provider: provider ?? null,
        providerSubId: event.product_id ?? null,
        currentPeriodEnd: expiresAt,
        cycleResetAt,
      },
    });

    // Reprioritize any queued sessions
    await prisma.session.updateMany({
      where: { customerId: userId, status: 'NEW', priority: 3 },
      data: { priority: 1 },
    });
  }

  private async onRenewal(userId: string, event: RCWebhookEvent): Promise<void> {
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const cycleResetAt = new Date();
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    await prisma.subscription.update({
      where: { userId },
      data: {
        status: 'ACTIVE',
        dreamsUsed: 0,
        currentPeriodEnd: expiresAt,
        cycleResetAt,
      },
    });

    await prisma.session.updateMany({
      where: { customerId: userId, status: 'NEW', priority: 3 },
      data: { priority: 1 },
    });
  }

  private async onCancellation(userId: string, event: RCWebhookEvent): Promise<void> {
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

    await prisma.subscription.update({
      where: { userId },
      data: { status: 'CANCELLED', currentPeriodEnd: expiresAt },
    });

    if (expiresAt) {
      await NotificationService.sendPush(userId, {
        title: 'Subscription Cancelled',
        body: `Your premium plan will end on ${expiresAt.toLocaleDateString()}.`,
        data: { type: 'expiry', expiresAt: expiresAt.toISOString() },
      });
    }
  }

  private async onExpiration(userId: string, _event: RCWebhookEvent): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });

    await prisma.subscription.update({
      where: { userId },
      data: { plan: 'FREE', status: 'EXPIRED', currentPeriodEnd: null },
    });

    // Tag excess sessions (beyond free limit of 5) as priority 3 (queued)
    if (sub && sub.dreamsUsed > QuotaService.FREE_LIMIT) {
      const excessSessions = await prisma.session.findMany({
        where: { customerId: userId, status: 'NEW' },
        orderBy: { createdAt: 'asc' },
        skip: QuotaService.FREE_LIMIT,
      });

      if (excessSessions.length > 0) {
        await prisma.session.updateMany({
          where: { id: { in: excessSessions.map((s) => s.id) } },
          data: { priority: 3 },
        });
      }
    }

    await NotificationService.sendPush(userId, {
      title: 'Premium Plan Expired',
      body: 'Your premium plan has expired. Upgrade to continue.',
      data: { type: 'expiry' },
    });
  }

  private async onBillingIssue(userId: string, _event: RCWebhookEvent): Promise<void> {
    await prisma.subscription.update({
      where: { userId },
      data: { status: 'BILLING_ISSUE' },
    });

    await NotificationService.sendPush(userId, {
      title: 'Payment Issue',
      body: 'Payment issue — please update your payment method.',
      data: { type: 'billing_issue' },
    });
  }

  private async onSubscriberAlias(event: RCWebhookEvent): Promise<void> {
    if (!event.aliases?.length) return;

    // When RC merges two user IDs, update our mapping
    for (const alias of event.aliases) {
      const user = await prisma.user.findFirst({ where: { rcAppUserId: alias } });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { rcAppUserId: event.app_user_id },
        });
        break;
      }
    }
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  private async resolveUserByRCId(rcAppUserId: string): Promise<string | null> {
    // RC App User ID is set to our DB UUID on login
    const byRCId = await prisma.user.findFirst({ where: { rcAppUserId } });
    if (byRCId) return byRCId.id;

    // Fallback: RC App User ID might equal our UUID directly
    const byId = await prisma.user.findUnique({ where: { id: rcAppUserId } });
    return byId?.id ?? null;
  }

  private storeToProvider(
    store: RCWebhookEvent['store'],
  ): 'APPLE' | 'GOOGLE' | 'STRIPE' | undefined {
    if (store === 'APP_STORE') return 'APPLE';
    if (store === 'PLAY_STORE') return 'GOOGLE';
    if (store === 'STRIPE') return 'STRIPE';
    return undefined;
  }
}

export const subscriptionService = new SubscriptionService();
