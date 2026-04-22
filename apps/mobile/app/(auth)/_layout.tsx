import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import type { Role } from '@mokshavoice/shared-types';

function roleHomePath(role: Role): string {
  switch (role) {
    case 'DECODER':
    case 'MENTOR':
      return '/(app)/(decoder)/queue';
    case 'ADMIN':
      return '/(app)/(admin)/dashboard';
    default:
      return '/(app)/(customer)/';
  }
}

export default function AuthLayout() {
  const { user, isHydrated } = useAuthStore();

  if (!isHydrated) return null;

  if (user) return <Redirect href={roleHomePath(user.role) as never} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
