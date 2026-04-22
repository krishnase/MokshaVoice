import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env['EXPO_PUBLIC_FIREBASE_API_KEY']!,
  authDomain: process.env['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN']!,
  projectId: process.env['EXPO_PUBLIC_FIREBASE_PROJECT_ID']!,
  appId: process.env['EXPO_PUBLIC_FIREBASE_APP_ID']!,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export default app;
