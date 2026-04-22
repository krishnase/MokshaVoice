import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QuotaMeter } from '@/src/components/QuotaMeter';
import { useAuthStore } from '@/src/stores/authStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Profile() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { subscription } = useSubscriptionStore();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.displayName ?? user?.phone ?? 'U')[0]?.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>
            {user?.displayName ?? 'Anonymous'}
          </Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>

        {/* Subscription card */}
        {subscription && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Subscription</Text>
              <View style={[
                styles.planBadge,
                subscription.plan === 'PREMIUM' ? styles.premiumBadge : styles.freeBadge,
              ]}>
                <Text style={styles.planBadgeText}>{subscription.plan}</Text>
              </View>
            </View>

            <QuotaMeter
              used={subscription.dreamsUsed}
              limit={subscription.limit}
              plan={subscription.plan}
            />

            <View style={styles.meta}>
              <Text style={styles.metaLabel}>Resets on</Text>
              <Text style={styles.metaValue}>{formatDate(subscription.cycleResetAt)}</Text>
            </View>

            {subscription.currentPeriodEnd && (
              <View style={styles.meta}>
                <Text style={styles.metaLabel}>Next billing</Text>
                <Text style={styles.metaValue}>{formatDate(subscription.currentPeriodEnd)}</Text>
              </View>
            )}

            {subscription.plan === 'FREE' ? (
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => router.push('/(app)/(customer)/upgrade')}
              >
                <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={() => router.push('/(app)/(customer)/upgrade')}
              >
                <Text style={styles.manageBtnText}>Manage subscription</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => router.replace('/(app)/(customer)/')}
        >
          <Text style={styles.tabIcon}>🌙</Text>
          <Text style={styles.tabLabel}>Dreams</Text>
        </TouchableOpacity>
        <View style={styles.tabActive}>
          <Text style={styles.tabIconActive}>👤</Text>
          <Text style={styles.tabLabelActive}>Profile</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { color: '#9B5DE5', fontSize: 15 },
  heading: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  placeholder: { width: 60 },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#9B5DE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 32, fontWeight: '700' },
  displayName: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  phone: { color: '#888', fontSize: 14 },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeBadge: { backgroundColor: '#333' },
  premiumBadge: { backgroundColor: '#9B5DE5' },
  planBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: { color: '#888', fontSize: 13 },
  metaValue: { color: '#CCC', fontSize: 13 },
  upgradeBtn: {
    backgroundColor: '#9B5DE5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  upgradeBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  manageBtn: {
    backgroundColor: '#2A2A40',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  manageBtnText: { color: '#9B5DE5', fontSize: 15, fontWeight: '600' },
  logoutBtn: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#EF476F', fontSize: 15, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabActive: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabIcon: { fontSize: 22 },
  tabIconActive: { fontSize: 22 },
  tabLabel: { color: '#555', fontSize: 11 },
  tabLabelActive: { color: '#9B5DE5', fontSize: 11, fontWeight: '600' },
});
