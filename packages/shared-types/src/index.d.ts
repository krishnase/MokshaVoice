export type Role = 'CUSTOMER' | 'DECODER' | 'MENTOR' | 'ADMIN';
export type Plan = 'FREE' | 'PREMIUM';
export type Provider = 'APPLE' | 'GOOGLE' | 'STRIPE';
export type SubStatus = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'BILLING_ISSUE';
export type SessionStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';
export type MessageType = 'VOICE' | 'TEXT' | 'SYSTEM';
export interface User {
    id: string;
    phone: string;
    role: Role;
    displayName: string | null;
    fcmToken: string | null;
    rcAppUserId: string | null;
    createdAt: string;
}
export interface UserProfile extends User {
    subscription: SubscriptionInfo;
}
export interface SubscriptionInfo {
    plan: Plan;
    status: SubStatus;
    dreamsUsed: number;
    limit: 5 | 15;
    cycleResetAt: string;
    currentPeriodEnd: string | null;
}
export interface SubscriptionRecord extends SubscriptionInfo {
    id: string;
    userId: string;
    provider: Provider | null;
    providerSubId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface QuotaResult {
    allowed: boolean;
    status: 'active' | 'queued';
    used: number;
    limit: 5 | 15;
}
export interface Session {
    id: string;
    customerId: string;
    claimedBy: string | null;
    status: SessionStatus;
    priority: 1 | 2 | 3;
    title: string | null;
    createdAt: string;
    completedAt: string | null;
}
export interface SessionLastMessage {
    type: MessageType;
    content: string | null;
    createdAt: string;
}
export interface SessionWithMeta extends Session {
    messageCount: number;
    lastMessageAt: string | null;
    lastMessage: SessionLastMessage | null;
    customer?: Pick<User, 'id' | 'displayName' | 'phone'>;
}
export interface CreateSessionRequest {
}
export interface CreateSessionResponse {
    session: Session;
    quota: QuotaResult;
}
export interface Message {
    id: string;
    sessionId: string;
    senderId: string;
    type: MessageType;
    content: string | null;
    audioUrl: string | null;
    audioDurationS: number | null;
    isDreamSubmission: boolean;
    createdAt: string;
}
export interface MessageWithSender extends Message {
    sender: Pick<User, 'id' | 'displayName' | 'role'>;
}
export interface SendTextMessageRequest {
    type: 'TEXT';
    content: string;
}
export interface SendVoiceMessageRequest {
    type: 'VOICE';
    audioDurationS: number;
    isDreamSubmission?: boolean;
}
export interface SendOtpRequest {
    phone: string;
}
export interface SendOtpResponse {
    message: string;
}
export interface VerifyOtpRequest {
    phone: string;
    firebaseIdToken: string;
}
export interface VerifyOtpResponse {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
}
export interface RefreshTokenRequest {
    refreshToken: string;
}
export interface RefreshTokenResponse {
    accessToken: string;
    refreshToken: string;
}
export interface SyncEntitlementResponse {
    subscription: SubscriptionInfo;
}
export interface StripeCheckoutRequest {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
}
export interface StripeCheckoutResponse {
    checkoutUrl: string;
}
export interface JoinSessionPayload {
    session_id: string;
}
export interface TypingPayload {
    session_id: string;
    is_typing: boolean;
}
export interface MessageNewPayload {
    message: MessageWithSender;
}
export interface SessionStatusPayload {
    session_id: string;
    status: SessionStatus;
    claimed_by: string | null;
}
export interface TypingBroadcastPayload {
    session_id: string;
    user_id: string;
    is_typing: boolean;
}
export interface SocketClientToServerEvents {
    'join:session': (payload: JoinSessionPayload) => void;
    typing: (payload: TypingPayload) => void;
}
export interface SocketServerToClientEvents {
    'message:new': (payload: MessageNewPayload) => void;
    'session:status': (payload: SessionStatusPayload) => void;
    typing: (payload: TypingBroadcastPayload) => void;
}
export interface CursorPage<T> {
    data: T[];
    nextCursor: string | null;
    hasMore: boolean;
}
export type NotificationType = 'new_dream' | 'response' | 'limit_reached' | 'renewal' | 'expiry' | 'billing_issue';
export interface NotificationRecord {
    id: string;
    userId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    read: boolean;
    createdAt: string;
}
export type RCEventType = 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' | 'BILLING_ISSUE' | 'NON_RENEWING_PURCHASE' | 'SUBSCRIBER_ALIAS';
export interface RCWebhookEvent {
    type: RCEventType;
    app_user_id: string;
    aliases?: string[];
    expiration_at_ms?: number;
    period_type?: string;
    purchased_at_ms?: number;
    product_id?: string;
    store?: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE';
}
export interface RCWebhookBody {
    event: RCWebhookEvent;
    api_version: string;
}
export interface ApiError {
    statusCode: number;
    error: string;
    message: string;
}
//# sourceMappingURL=index.d.ts.map