import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';

type SessionStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';
type Customer = { id: string; phone: string };
type Claimer = { id: string; phone: string; displayName: string | null } | null;
type AdminSession = {
  id: string;
  status: SessionStatus;
  priority: number;
  createdAt: string;
  completedAt: string | null;
  customer: Customer;
  claimer: Claimer;
  _count: { messages: number };
};
type SessionsPage = { data: AdminSession[]; nextCursor: string | null; hasMore: boolean };

const FILTERS = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'NEW' as SessionStatus },
  { label: 'In Progress', value: 'IN_PROGRESS' as SessionStatus },
  { label: 'Completed', value: 'COMPLETED' as SessionStatus },
];

const STATUS_COLOR: Record<SessionStatus, string> = {
  NEW: Colors.warning,
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
};
const STATUS_LABEL: Record<SessionStatus, string> = {
  NEW: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Done',
};

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 3) + ' ••••• ' + phone.slice(-4);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminDreams() {
  const router = useRouter();
  const [filter, setFilter] = useState<SessionStatus | undefined>(undefined);

  const query = useInfiniteQuery({
    queryKey: ['admin-dreams', filter],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: '20' });
      if (filter) p.set('status', filter);
      if (pageParam) p.set('cursor', pageParam);
      return api.get<SessionsPage>(`/v1/admin/dreams?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const sessions = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const renderItem = useCallback(({ item, index }: { item: AdminSession; index: number }) => {
    const statusColor = STATUS_COLOR[item.status];
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(app)/(decoder)/session/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <Text style={styles.dreamNum}>Dream #{index + 1}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.value}>{maskPhone(item.customer.phone)}</Text>
        </View>
        {item.claimer && (
          <View style={styles.cardRow}>
            <Text style={styles.label}>Decoder</Text>
            <Text style={styles.value}>{item.claimer.displayName ?? maskPhone(item.claimer.phone)}</Text>
          </View>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.meta}>Submitted {timeAgo(item.createdAt)}</Text>
          {item.completedAt && <Text style={styles.meta}>Completed {timeAgo(item.completedAt)}</Text>}
          <Text style={styles.meta}>{item._count.messages} msg{item._count.messages !== 1 ? 's' : ''}</Text>
          {item.priority === 1 && <View style={styles.proBadge}><Text style={styles.proText}>Premium</Text></View>}
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>All Dreams</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterPill, filter === f.value && styles.filterPillActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.orange} size="large" /></View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={Colors.orange} />}
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={Colors.orange} style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No dreams found</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { paddingRight: 8 },
  backText: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_500Medium' },
  title: { color: Colors.white, fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.gold + '33' },
  filterPillActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orange },
  filterText: { color: Colors.gray3, fontSize: 13, fontFamily: 'Inter_500Medium' },
  filterTextActive: { color: Colors.orangeLight },
  list: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_400Regular' },
  card: { backgroundColor: Colors.navyCard, borderRadius: 12, marginHorizontal: 16, marginVertical: 5, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.gold + '18' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dreamNum: { color: Colors.white, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardRow: { flexDirection: 'row', gap: 8 },
  label: { color: Colors.gray4, fontSize: 12, fontFamily: 'Inter_400Regular', width: 60 },
  value: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  meta: { color: Colors.gray4, fontSize: 11, fontFamily: 'Inter_400Regular' },
  proBadge: { backgroundColor: Colors.goldDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  proText: { color: Colors.gold, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});
