import { useQuery } from '@tanstack/react-query';
import Purchases from 'react-native-purchases';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { api } from '../lib/api';
import type { SubscriptionInfo } from '@mokshavoice/shared-types';

export function useSubscription() {
  const { setSubscription } = useSubscriptionStore();

  // Server-side subscription — always authoritative for quota decisions
  const serverQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const sub = await api.get<SubscriptionInfo>('/v1/me/subscription');
      setSubscription(sub);
      return sub;
    },
    staleTime: 60_000,
  });

  // RC customerInfo — used for UI display only (fast, cached)
  const rcQuery = useQuery({
    queryKey: ['rc-customer-info'],
    queryFn: async () => {
      const info = await Purchases.getCustomerInfo();
      const premiumEntitlement = info.entitlements.active['premium'];
      return {
        isPremium: premiumEntitlement !== undefined,
        expirationDate: premiumEntitlement?.expirationDate ?? null,
      };
    },
    staleTime: 5 * 60_000,
  });

  return {
    subscription: serverQuery.data,
    isLoading: serverQuery.isLoading,
    rcStatus: rcQuery.data,
    refetch: serverQuery.refetch,
  };
}
