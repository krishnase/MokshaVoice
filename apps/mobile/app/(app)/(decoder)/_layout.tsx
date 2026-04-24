import { Stack } from 'expo-router';

export default function DecoderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="queue" />
      <Stack.Screen name="session/[id]" />
    </Stack>
  );
}
