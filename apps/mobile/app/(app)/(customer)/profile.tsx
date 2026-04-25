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
import { Colors } from '@/src/theme';

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
  safe: { flex: 1, backgroundColor: Colors.navy },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_500Medium' },
  heading: { color: Colors.white, fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  placeholder: { width: 60 },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  avatarText: { color: Colors.white, fontSize: 32, fontFamily: 'Poppins_700Bold' },
  displayName: { color: Colors.white, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  phone: { color: Colors.gray3, fontSize: 14, fontFamily: 'Inter_400Regular' },
  card: {
    backgroundColor: Colors.navyCard,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { color: Colors.white, fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeBadge: { backgroundColor: Colors.navyLight },
  premiumBadge: { backgroundColor: Colors.orange },
  planBadgeText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: { color: Colors.gray3, fontSize: 13, fontFamily: 'Inter_400Regular' },
  metaValue: { color: Colors.gray3, fontSize: 13, fontFamily: 'Inter_400Regular' },
  upgradeBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  upgradeBtnText: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  manageBtn: {
    backgroundColor: Colors.navyLight,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.orange + '44',
  },
  manageBtnText: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  logoutBtn: {
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '33',
  },
  logoutText: { color: Colors.error, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.navyCard,
    borderTopWidth: 1,
    borderTopColor: Colors.gold + '22',
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabActive: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabIcon: { fontSize: 22 },
  tabIconActive: { fontSize: 22 },
  tabLabel: { color: Colors.gray4, fontSize: 11, fontFamily: 'Inter_400Regular' },
  tabLabelActive: { color: Colors.orange, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
