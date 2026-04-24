import { create } from 'zustand';
import Purchases from 'react-native-purchases';
import { authStorage } from '../lib/storage';
import type { UserProfile } from '@mokshavoice/shared-types';

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
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  setTokens(accessToken, refreshToken) {
    authStorage.set('accessToken', accessToken);
    authStorage.set('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },

  setUser(user) {
    authStorage.set('user', JSON.stringify(user));
    set({ user });
  },

  async logout() {
    try {
      await Purchases.logOut();
    } catch {
      // ignore RC errors on logout
    }
    authStorage.delete('accessToken');
    authStorage.delete('refreshToken');
    authStorage.delete('user');
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hydrate() {
    const userJson = authStorage.getString('user');
    const user = userJson ? (JSON.parse(userJson) as UserProfile) : null;
    const accessToken = authStorage.getString('accessToken') ?? null;
    const refreshToken = authStorage.getString('refreshToken') ?? null;
    set({ user, accessToken, refreshToken, isHydrated: true });
  },
}));
