import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { Colors } from '@/src/theme';
import type { Mentor } from '@mokshavoice/shared-types';

const CALLS_ALLOWED: Record<string, number> = {
  FREE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 999,
};

export default function MentorsScreen() {
  const router = useRouter();
  const subscription = useSubscriptionStore((s) => s.subscription);

  const plan = subscription?.plan ?? 'FREE';
  const callsAllowed = CALLS_ALLOWED[plan] ?? 0;
  const callsUsed = subscription?.callsUsed ?? 0;
  const callsLeft = Math.max(0, callsAllowed - callsUsed);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-mentor'],
    queryFn: () => api.get<{ mentor: Mentor | null }>('/v1/mentors/me'),
  });

  const mentor = data?.mentor ?? null;

  async function handleBook() {
    if (!mentor) return;

    if (callsAllowed === 0) {
      router.push('/(app)/(customer)/upgrade');
      return;
    }

    if (callsLeft === 0) {
      Alert.alert(
        'No calls remaining',
        `You've used all ${callsAllowed} call(s) for this period. Upgrade to get more.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/(app)/(customer)/upgrade') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    Alert.alert(
      `Book with ${mentor.name}`,
      `You have ${callsLeft} call${callsLeft !== 1 ? 's' : ''} remaining this period.\n\nThis will open ${mentor.name}'s booking page.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Booking Page',
          onPress: async () => {
            try {
              await api.post('/v1/mentors/book', {});
              await Linking.openURL(mentor.calendlyUrl);
            } catch (err: unknown) {
              const e = err as { message?: string };
              Alert.alert('Error', e.message ?? 'Could not open booking page.');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Mentor</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/(customer)/consultations')}>
          <Text style={styles.myCallsLink}>My Calls</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.orange} />}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.orange} size="large" />
          </View>
        ) : mentor ? (
          <>
            {/* Mentor card */}
            <View style={styles.mentorCard}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>{mentor.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.mentorName}>{mentor.name}</Text>
              {mentor.bio ? (
                <Text style={styles.mentorBio}>{mentor.bio}</Text>
              ) : null}
            </View>

            {/* Quota info */}
            <View style={[styles.quotaCard, callsLeft === 0 && styles.quotaCardLow]}>
              {callsAllowed === 0 ? (
                <>
                  <Text style={styles.quotaTitle}>Upgrade to book calls</Text>
                  <Text style={styles.quotaSub}>Your current plan doesn't include consultation calls.</Text>
                  <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/(app)/(customer)/upgrade')}>
                    <Text style={styles.upgradeBtnText}>View Plans</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.quotaTitle}>
                    {callsLeft} of {callsAllowed} call{callsAllowed !== 1 ? 's' : ''} remaining
                  </Text>
                  <Text style={styles.quotaSub}>Resets at the start of your next billing cycle.</Text>
                </>
              )}
            </View>

            {/* Book button */}
            <TouchableOpacity
              style={[styles.bookBtn, (callsAllowed === 0 || callsLeft === 0) && styles.bookBtnDisabled]}
              onPress={handleBook}
            >
              <Text style={styles.bookBtnText}>
                {callsAllowed === 0 ? 'Upgrade to Book' : callsLeft === 0 ? 'No Calls Remaining' : 'Book a Call  ›'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          /* No mentor assigned yet */
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧘</Text>
            <Text style={styles.emptyTitle}>No mentor assigned yet</Text>
            <Text style={styles.emptySub}>
              Our team will assign a mentor to you shortly after you subscribe. Check back soon.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: Colors.orange, fontSize: 16, fontFamily: 'Inter_500Medium' },
  title: { color: Colors.white, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  myCallsLink: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  scroll: { padding: 20, gap: 16, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },

  mentorCard: {
    backgroundColor: Colors.navyCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gold + '33',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.orangeDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 34, fontFamily: 'Poppins_700Bold', color: Colors.orange },
  mentorName: { color: Colors.white, fontSize: 22, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  mentorBio: { color: Colors.gray3, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 21, textAlign: 'center' },

  quotaCard: {
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '33',
    padding: 16,
    gap: 6,
    alignItems: 'center',
  },
  quotaCardLow: { borderColor: Colors.orange + '55', backgroundColor: Colors.orangeDim },
  quotaTitle: { color: Colors.white, fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  quotaSub: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  upgradeBtn: { marginTop: 8, backgroundColor: Colors.orange, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  upgradeBtnText: { color: Colors.white, fontSize: 14, fontFamily: 'Poppins_600SemiBold' },

  bookBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bookBtnDisabled: { backgroundColor: Colors.gray4, shadowOpacity: 0 },
  bookBtnText: { color: Colors.white, fontSize: 16, fontFamily: 'Poppins_600SemiBold' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingTop: 60 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: Colors.white, fontSize: 20, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  emptySub: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21 },
});
