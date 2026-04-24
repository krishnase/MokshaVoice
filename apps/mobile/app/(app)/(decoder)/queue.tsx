import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { api } from '@/src/lib/api';

type Customer = { id: string; phone: string; displayName: string | null };
type SubmissionMessage = { type: string; content: string | null; audioDurationS: number | null };

type QueueSession = {
  id: string;
  status: 'NEW' | 'IN_PROGRESS' | 'COMPLETED';
  priority: number;
  createdAt: string;
  customer: Customer;
  claimer: Customer | null;
  messages: SubmissionMessage[];
  _count: { messages: number };
};

type QueueResponse = { data: QueueSession[]; hasMore: boolean };

const FILTERS = [
  { label: 'Pending', status: 'NEW' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Completed', status: 'COMPLETED' },
] as const;

type FilterStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';

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

function dreamType(messages: SubmissionMessage[]) {
  const hasVoice = messages.some((m) => m.type === 'VOICE');
  const hasText = messages.some((m) => m.type === 'TEXT');
  if (hasVoice && hasText) return 'Voice + Text';
  if (hasVoice) return 'Voice';
  return 'Text';
}

function totalDuration(messages: SubmissionMessage[]) {
  const secs = messages.reduce((s, m) => s + (m.audioDurationS ?? 0), 0);
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const STATUS_COLOR: Record<FilterStatus, string> = {
  NEW: '#F59E0B',
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
};

function QueueCard({ session, onPress }: { session: QueueSession; onPress: () => void }) {
  const type = dreamType(session.messages);
  const dur = totalDuration(session.messages);
  const statusColor = STATUS_COLOR[session.status];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <Text style={styles.phone}>{maskPhone(session.customer.phone)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {session.status === 'NEW' ? 'Pending' : session.status === 'IN_PROGRESS' ? 'In Progress' : 'Done'}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{type}</Text>
        </View>
        {dur && <Text style={styles.dur}>🎙 {dur}</Text>}
        {session.priority === 1 && (
          <View style={styles.priorityBadge}>
            <Text style={styles.priorityText}>Premium</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.time}>{timeAgo(session.createdAt)}</Text>
        <Text style={styles.msgCount}>{session._count.messages} msg{session._count.messages !== 1 ? 's' : ''}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DecoderQueue() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>('NEW');
  const [tab, setTab] = useState<'queue' | 'mine'>('queue');

  const queueQuery = useQuery({
    queryKey: ['decoder-queue', filter],
    queryFn: () => api.get<QueueResponse>(`/v1/decoder/queue?status=${filter}`),
    refetchInterval: 30_000,
  });

  const mineQuery = useQuery({
    queryKey: ['decoder-mine'],
    queryFn: () => api.get<QueueResponse>('/v1/decoder/my-sessions'),
    refetchInterval: 30_000,
    enabled: tab === 'mine',
  });

  const activeQuery = tab === 'queue' ? queueQuery : mineQuery;
  const sessions = activeQuery.data?.data ?? [];

  const handlePress = useCallback(
    (id: string) => router.push(`/(app)/(decoder)/session/${id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: QueueSession }) => (
      <QueueCard session={item} onPress={() => handlePress(item.id)} />
    ),
    [handlePress],
  );

  const pendingCount = queueQuery.data?.data.length ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dream Queue</Text>
          <Text style={styles.subtitle}>
            {queueQuery.isLoading ? '…' : `${pendingCount} pending`}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.push('/(app)/mode-select')}
            style={styles.recordBtn}
          >
            <Text style={styles.recordBtnText}>⊞ Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => activeQuery.refetch()}
            style={styles.refreshBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.refreshIcon}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'queue' && styles.tabActive]}
          onPress={() => setTab('queue')}
        >
          <Text style={[styles.tabLabel, tab === 'queue' && styles.tabLabelActive]}>Queue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'mine' && styles.tabActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabLabel, tab === 'mine' && styles.tabLabelActive]}>My Sessions</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter (queue tab only) */}
      {tab === 'queue' && (
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.status}
              style={[styles.filterPill, filter === f.status && styles.filterPillActive]}
              onPress={() => setFilter(f.status)}
            >
              <Text style={[styles.filterText, filter === f.status && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#9B5DE5" size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={sessions.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => activeQuery.refetch()}
              tintColor="#9B5DE5"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyTitle}>Queue is empty</Text>
              <Text style={styles.emptySubtitle}>No dreams waiting right now</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { color: '#FFF', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  recordBtn: { backgroundColor: '#9B5DE5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  recordBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  refreshBtn: { padding: 4 },
  refreshIcon: { color: '#9B5DE5', fontSize: 22 },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#9B5DE5' },
  tabLabel: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#FFF' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterPillActive: { backgroundColor: '#2D1B69', borderColor: '#9B5DE5' },
  filterText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#C4B5FD' },

  list: { paddingBottom: 40 },
  emptyContainer: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  emptyIcon: { fontSize: 48, color: '#10B981' },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  emptySubtitle: { color: '#6B7280', fontSize: 14, textAlign: 'center' },

  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 5,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phone: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  statusBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { color: '#D1D5DB', fontSize: 12 },
  dur: { color: '#9CA3AF', fontSize: 12 },
  priorityBadge: { backgroundColor: '#78350F22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { color: '#F59E0B', fontSize: 11, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: '#6B7280', fontSize: 12 },
  msgCount: { color: '#6B7280', fontSize: 12 },
});
