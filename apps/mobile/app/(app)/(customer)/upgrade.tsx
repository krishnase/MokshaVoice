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
import { Colors } from '@/src/theme';

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
        <ActivityIndicator size="large" color={Colors.orange} style={styles.loader} />
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
          <ActivityIndicator size="small" color={Colors.orange} />
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
          <ActivityIndicator size="small" color={Colors.white} />
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
  container: { flex: 1, backgroundColor: Colors.navy },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold', color: Colors.white, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.gray3, textAlign: 'center', marginBottom: 24 },
  benefits: { marginVertical: 20 },
  benefit: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.gray3, marginBottom: 8 },
  loader: { marginVertical: 32 },
  plans: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  planCard: {
    flex: 1,
    backgroundColor: Colors.navyCard,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '33',
  },
  planCardFeatured: { borderColor: Colors.orange, backgroundColor: Colors.navyLight },
  badge: {
    backgroundColor: Colors.orange,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  planLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.gray3, marginBottom: 6 },
  planPrice: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: Colors.white, marginBottom: 16 },
  planPeriod: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.gray3 },
  upgradeButton: {
    backgroundColor: Colors.navyLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '33',
  },
  upgradeButtonFeatured: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  upgradeButtonText: { color: Colors.white, fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  restoreButton: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter_400Regular', textDecorationLine: 'underline' },
});
