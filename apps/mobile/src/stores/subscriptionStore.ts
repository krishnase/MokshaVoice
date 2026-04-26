import { create } from 'zustand';
import type { Plan, SubscriptionInfo } from '@mokshavoice/shared-types';

interface SubscriptionState {
  subscription: SubscriptionInfo | null;
  setPlan: (plan: Plan) => void;
  setSubscription: (sub: SubscriptionInfo) => void;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,

  setPlan(plan) {
    set((state) => ({
      subscription: state.subscription
        ? {
            ...state.subscription,
            plan,
            limit: plan === 'PREMIUM' ? 999 : plan === 'GROWTH' ? 30 : 5,
          }
        : null,
    }));
  },

  setSubscription(sub) {
    set({ subscription: sub });
  },

  clear() {
    set({ subscription: null });
  },
}));
