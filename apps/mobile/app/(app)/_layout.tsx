import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { useAuthStore } from '@/src/stores/authStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { connectSocket, disconnectSocket } from '@/src/lib/socket';
import { api } from '@/src/lib/api';
import type { SubscriptionInfo } from '@mokshavoice/shared-types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const RC_API_KEY = Platform.select({
  ios: process.env['EXPO_PUBLIC_RC_IOS_KEY']!,
  android: process.env['EXPO_PUBLIC_RC_ANDROID_KEY']!,
  default: process.env['EXPO_PUBLIC_RC_IOS_KEY']!,
});

const NON_CUSTOMER_VALID_SEGMENTS = ['(customer)', '(decoder)', '(analyzer)', '(admin)', 'notifications', 'mode-select'];

export default function AppLayout() {
  const { user, isHydrated } = useAuthStore();
  const { setSubscription } = useSubscriptionStore();
  const router = useRouter();
  const segments = useSegments();

  // Redirect to the correct home screen when role is known
  useEffect(() => {
    if (!isHydrated || !user) return;

    if (user.role === 'CUSTOMER') {
      const onCustomer = segments.includes('(customer)' as never);
      const onShared = segments.includes('notifications' as never);
      if (!onCustomer && !onShared) {
        router.replace('/(app)/(customer)' as never);
      }
    } else {
      // Non-customers pick their mode from the hub; any valid segment is fine
      const onValidSegment = NON_CUSTOMER_VALID_SEGMENTS.some((s) => segments.includes(s as never));
      if (!onValidSegment) {
        router.replace('/(app)/mode-select' as never);
      }
    }
  }, [isHydrated, user?.role]);
  // hydrate() is called in the root _layout.tsx — no need to repeat it here

  // RevenueCat initialization — runs once, identifies user after login
  useEffect(() => {
    if (!isHydrated) return;

    Purchases.setLogLevel(
      process.env['NODE_ENV'] === 'production' ? LOG_LEVEL.ERROR : LOG_LEVEL.DEBUG,
    );
    Purchases.configure({ apiKey: RC_API_KEY });

    if (user?.id) {
      Purchases.logIn(user.id).catch((err) =>
        console.warn('RC logIn failed:', err),
      );
    }
  }, [isHydrated, user?.id]);

  // Socket.io — connect when authenticated, disconnect on logout
  useEffect(() => {
    if (!isHydrated) return;
    if (user) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [isHydrated, user?.id]);

  // Push notification permission + FCM token registration
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      // Register token with backend so we can send push notifications
      await api
        .post('/v1/me/fcm-token', { token: tokenData.data })
        .catch((err) => console.warn('FCM token register failed:', err));
    })();
  }, [user?.id]);

  // Fetch current subscription from backend (authoritative source)
  useEffect(() => {
    if (!user) return;

    api
      .get<SubscriptionInfo>('/v1/me/subscription')
      .then((sub) => setSubscription(sub))
      .catch((err) => console.warn('Subscription fetch failed:', err));
  }, [user?.id]);

  if (!isHydrated) return null; // Splash screen is still visible during hydration

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="mode-select" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(decoder)" />
      <Stack.Screen name="(analyzer)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
