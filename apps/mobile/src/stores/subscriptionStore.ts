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
            limit: plan === 'PLATINUM' ? 999 : plan === 'GOLD' ? 30 : plan === 'SILVER' ? 15 : 5,
            callsAllowed: plan === 'PLATINUM' ? 999 : plan === 'GOLD' ? 2 : plan === 'SILVER' ? 1 : 0,
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
