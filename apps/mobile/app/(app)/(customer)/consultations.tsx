import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';
import type { Consultation, ConsultationListResponse, ConsultationStatus } from '@mokshavoice/shared-types';

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  PENDING: 'Pending',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<ConsultationStatus, string> = {
  PENDING: Colors.warning ?? '#F59E0B',
  SCHEDULED: '#3B82F6',
  COMPLETED: '#10B981',
  CANCELLED: Colors.gray4,
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ConsultationCard({ item }: { item: Consultation }) {
  const color = STATUS_COLOR[item.status];
  const label = STATUS_LABEL[item.status];
  const dateStr = formatDate(item.scheduledAt ?? item.createdAt);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{item.mentor.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.mentorName}>{item.mentor.name}</Text>
          {dateStr ? <Text style={styles.date}>{dateStr}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[styles.badgeText, { color }]}>{label}</Text>
        </View>
      </View>
      {item.mentor.bio ? (
        <Text style={styles.bio} numberOfLines={2}>{item.mentor.bio}</Text>
      ) : null}
    </View>
  );
}

export default function ConsultationsScreen() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['my-consultations'],
    queryFn: () => api.get<ConsultationListResponse>('/v1/mentors/consultations'),
  });

  const consultations = data?.consultations ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Consultations</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      ) : (
        <FlatList
          data={consultations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConsultationCard item={item} />}
          contentContainerStyle={consultations.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyTitle}>No consultations yet</Text>
              <Text style={styles.emptySub}>Book a call with one of our mentors</Text>
              <TouchableOpacity
                style={styles.findBtn}
                onPress={() => router.replace('/(app)/(customer)/mentors')}
              >
                <Text style={styles.findBtnText}>Find a Mentor</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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

  list: { paddingBottom: 40, paddingHorizontal: 16, gap: 12 },
  emptyContainer: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 40 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: Colors.white, fontSize: 20, fontFamily: 'Poppins_700Bold' },
  emptySub: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  findBtn: {
    marginTop: 8,
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  findBtnText: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },

  card: {
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.orangeDim,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontFamily: 'Poppins_700Bold', color: Colors.orange },
  cardInfo: { flex: 1 },
  mentorName: { color: Colors.white, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  date: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  bio: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, paddingLeft: 56 },
});
