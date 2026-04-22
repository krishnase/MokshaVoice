import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import Purchases from 'react-native-purchases';
import type { UserProfile } from '@mokshavoice/shared-types';

const storage = new MMKV({ id: 'auth' });

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserProfile) => void;
  logout: () => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: storage.getString('accessToken') ?? null,
  refreshToken: storage.getString('refreshToken') ?? null,
  isHydrated: false,

  setTokens(accessToken, refreshToken) {
    storage.set('accessToken', accessToken);
    storage.set('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },

  setUser(user) {
    storage.set('user', JSON.stringify(user));
    set({ user });
  },

  async logout() {
    try {
      await Purchases.logOut();
    } catch {
      // ignore RC errors on logout
    }
    storage.delete('accessToken');
    storage.delete('refreshToken');
    storage.delete('user');
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hydrate() {
    // Idempotent — safe to call from multiple layout components
    const userJson = storage.getString('user');
    const user = userJson ? (JSON.parse(userJson) as UserProfile) : null;
    set({ user, isHydrated: true });
  },
}));
