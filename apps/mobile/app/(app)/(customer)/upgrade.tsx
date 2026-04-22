import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { api } from '@/src/lib/api';
import { QuotaMeter } from '@/src/components/QuotaMeter';
import type { SubscriptionInfo } from '@mokshavoice/shared-types';

export default function UpgradeScreen() {
  const router = useRouter();
  const { subscription, setSubscription, setPlan } = useSubscriptionStore();
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const { data: offerings, isLoading: offeringsLoading } = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 5 * 60_000,
  });

  const monthlyPkg = offerings?.current?.monthly ?? null;
  const annualPkg = offerings?.current?.annual ?? null;

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasingPackageId(pkg.identifier);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active['premium']) {
        const sub = await api.post<{ subscription: SubscriptionInfo }>(
          '/v1/subscriptions/sync-entitlement',
        );
        setSubscription(sub.subscription);
        setPlan('PREMIUM');
        router.replace('/(app)/(customer)/');
      }
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) {
        Alert.alert('Purchase failed', err.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setPurchasingPackageId(null);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    try {
      const customerInfo = await Purchases.restoreCustomerInfo();
      if (customerInfo.entitlements.active['premium']) {
        const sub = await api.post<{ subscription: SubscriptionInfo }>(
          '/v1/subscriptions/sync-entitlement',
        );
        setSubscription(sub.subscription);
        setPlan('PREMIUM');
        Alert.alert('Restored', 'Your premium subscription has been restored.');
        router.replace('/(app)/(customer)/');
      } else {
        Alert.alert('Nothing to restore', 'No active premium subscription found.');
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert('Restore failed', err.message ?? 'An unexpected error occurred.');
    } finally {
      setIsRestoring(false);
    }
  }

  const isAnyPurchasing = purchasingPackageId !== null || isRestoring;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Upgrade to Premium</Text>
      <Text style={styles.subtitle}>Unlock deeper dream analysis</Text>

      {subscription && (
        <QuotaMeter
          used={subscription.dreamsUsed}
          limit={subscription.limit}
          plan={subscription.plan}
        />
      )}

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <Text key={b} style={styles.benefit}>
            • {b}
          </Text>
        ))}
      </View>

      {offeringsLoading ? (
        <ActivityIndicator size="large" color="#7C3AED" style={styles.loader} />
      ) : (
        <View style={styles.plans}>
          {monthlyPkg && (
            <PlanCard
              label="Monthly"
              price={monthlyPkg.product.priceString}
              period="/month"
              isBestValue={false}
              onPress={() => handlePurchase(monthlyPkg)}
              loading={purchasingPackageId === monthlyPkg.identifier}
              disabled={isAnyPurchasing}
            />
          )}
          {annualPkg && (
            <PlanCard
              label="Yearly"
              price={annualPkg.product.priceString}
              period="/year"
              isBestValue
              badge="Save 15%"
              onPress={() => handlePurchase(annualPkg)}
              loading={purchasingPackageId === annualPkg.identifier}
              disabled={isAnyPurchasing}
            />
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={handleRestore}
        disabled={isAnyPurchasing}
        style={styles.restoreButton}
      >
        {isRestoring ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : (
          <Text style={styles.restoreText}>Restore Purchases</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

interface PlanCardProps {
  label: string;
  price: string;
  period: string;
  isBestValue: boolean;
  badge?: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}

function PlanCard({
  label,
  price,
  period,
  isBestValue,
  badge,
  onPress,
  loading,
  disabled,
}: PlanCardProps) {
  return (
    <View style={[styles.planCard, isBestValue && styles.planCardFeatured]}>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text style={styles.planLabel}>{label}</Text>
      <Text style={styles.planPrice}>
        {price}
        <Text style={styles.planPeriod}>{period}</Text>
      </Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[styles.upgradeButton, isBestValue && styles.upgradeButtonFeatured]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.upgradeButtonText}>Upgrade</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const BENEFITS = [
  '15 dream analyses per month',
  'Priority decoding queue',
  'Faster response times',
  'Detailed spiritual insights',
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '700', color: '#F3F4F6', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#9CA3AF', textAlign: 'center', marginBottom: 24 },
  benefits: { marginVertical: 20 },
  benefit: { fontSize: 15, color: '#D1D5DB', marginBottom: 8 },
  loader: { marginVertical: 32 },
  plans: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  planCard: {
    flex: 1,
    backgroundColor: '#1F1F33',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  planCardFeatured: { borderColor: '#7C3AED', backgroundColor: '#1E1040' },
  badge: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  planLabel: { fontSize: 14, color: '#9CA3AF', marginBottom: 6, fontWeight: '600' },
  planPrice: { fontSize: 24, fontWeight: '700', color: '#F3F4F6', marginBottom: 16 },
  planPeriod: { fontSize: 14, fontWeight: '400', color: '#9CA3AF' },
  upgradeButton: {
    backgroundColor: '#4B5563',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  upgradeButtonFeatured: { backgroundColor: '#7C3AED' },
  upgradeButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  restoreButton: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { color: '#7C3AED', fontSize: 14, textDecorationLine: 'underline' },
});
