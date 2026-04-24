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
  NEW: '#F59E0B',
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
        <View style={styles.center}><ActivityIndicator color="#9B5DE5" size="large" /></View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor="#9B5DE5" />}
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color="#9B5DE5" style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No dreams found</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { paddingRight: 8 },
  backText: { color: '#9B5DE5', fontSize: 15 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#374151' },
  filterPillActive: { backgroundColor: '#2D1B69', borderColor: '#9B5DE5' },
  filterText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#C4B5FD' },
  list: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontSize: 14 },
  card: { backgroundColor: '#1A1A2E', borderRadius: 12, marginHorizontal: 16, marginVertical: 5, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dreamNum: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', gap: 8 },
  label: { color: '#6B7280', fontSize: 12, width: 60 },
  value: { color: '#D1D5DB', fontSize: 12, flex: 1 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  meta: { color: '#6B7280', fontSize: 11 },
  proBadge: { backgroundColor: '#78350F22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  proText: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
});
