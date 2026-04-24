import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/src/lib/api';

type Stats = {
  totalUsers: number;
  usersToday: number;
  totalDreams: number;
  pendingDreams: number;
  inProgressDreams: number;
  completedDreams: number;
  dreamsToday: number;
  totalDecoders: number;
};

type Customer = { id: string; phone: string };
type PendingSession = {
  id: string;
  status: string;
  priority: number;
  createdAt: string;
  customer: Customer;
};
type PendingResponse = { data: PendingSession[] };

type AdminUser = {
  id: string;
  phone: string;
  role: string;
  createdAt: string;
  subscription: { plan: string; status: string } | null;
};
type UsersResponse = { data: AdminUser[] };

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

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const statsQuery = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<Stats>('/v1/admin/stats'),
    refetchInterval: 60_000,
    onSuccess: () => setLastUpdated(new Date()),
  } as Parameters<typeof useQuery>[0]);

  const pendingQuery = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => api.get<PendingResponse>('/v1/admin/dreams?status=NEW&limit=5'),
    refetchInterval: 60_000,
  });

  const recentUsersQuery = useQuery({
    queryKey: ['admin-recent-users'],
    queryFn: () => api.get<UsersResponse>('/v1/admin/users?limit=5'),
    refetchInterval: 60_000,
  });

  const handleRefresh = useCallback(() => {
    statsQuery.refetch();
    pendingQuery.refetch();
    recentUsersQuery.refetch();
    setLastUpdated(new Date());
  }, [statsQuery, pendingQuery, recentUsersQuery]);

  const isRefreshing = statsQuery.isRefetching || pendingQuery.isRefetching;
  const stats = statsQuery.data;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.updated}>
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.push('/(app)/mode-select')}
            style={styles.recordBtn}
          >
            <Text style={styles.recordBtnText}>⊞ Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.refreshIcon}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#9B5DE5" />}
      >
        {/* Stats grid */}
        {statsQuery.isLoading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#9B5DE5" /></View>
        ) : stats ? (
          <>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Total Users" value={stats.totalUsers} sub={`+${stats.usersToday} today`} color="#9B5DE5" />
              <StatCard label="Dreams Submitted" value={stats.totalDreams} sub={`+${stats.dreamsToday} today`} color="#3B82F6" />
              <StatCard label="Pending Analysis" value={stats.pendingDreams} color="#F59E0B" />
              <StatCard label="In Progress" value={stats.inProgressDreams} color="#8B5CF6" />
              <StatCard label="Completed" value={stats.completedDreams} color="#10B981" />
              <StatCard label="Decoders" value={stats.totalDecoders} color="#EC4899" />
            </View>
          </>
        ) : null}

        {/* Pending dreams — needs attention */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Needs Attention</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/(admin)/dreams')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {pendingQuery.isLoading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#9B5DE5" size="small" /></View>
        ) : (pendingQuery.data?.data ?? []).length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>✓ No pending dreams</Text>
          </View>
        ) : (
          (pendingQuery.data?.data ?? []).map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.listRow}
              onPress={() => router.push(`/(app)/(decoder)/session/${s.id}`)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPhone}>{maskPhone(s.customer.phone)}</Text>
                <Text style={styles.rowSub}>Waiting {timeAgo(s.createdAt)}</Text>
              </View>
              {s.priority === 1 && (
                <View style={styles.premiumBadge}><Text style={styles.premiumText}>Premium</Text></View>
              )}
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          ))
        )}

        {/* Recent users */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>New Users</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/(admin)/users')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {recentUsersQuery.isLoading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#9B5DE5" size="small" /></View>
        ) : (
          (recentUsersQuery.data?.data ?? []).map((u) => (
            <View key={u.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPhone}>{maskPhone(u.phone)}</Text>
                <Text style={styles.rowSub}>Joined {timeAgo(u.createdAt)}</Text>
              </View>
              <View style={[styles.roleBadge, u.role !== 'CUSTOMER' && styles.roleBadgeSpecial]}>
                <Text style={[styles.roleText, u.role !== 'CUSTOMER' && styles.roleTextSpecial]}>{u.role}</Text>
              </View>
              {u.subscription?.plan === 'PREMIUM' && (
                <View style={styles.premiumBadge}><Text style={styles.premiumText}>PRO</Text></View>
              )}
            </View>
          ))
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(app)/(admin)/users')} activeOpacity={0.75}>
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionLabel}>All Users</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(app)/(admin)/dreams')} activeOpacity={0.75}>
            <Text style={styles.actionIcon}>🌙</Text>
            <Text style={styles.actionLabel}>All Dreams</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(app)/(admin)/users?role=DECODER')} activeOpacity={0.75}>
            <Text style={styles.actionIcon}>🔮</Text>
            <Text style={styles.actionLabel}>Decoders</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { color: '#FFF', fontSize: 26, fontWeight: '700' },
  updated: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  recordBtn: { backgroundColor: '#9B5DE5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  recordBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  refreshIcon: { color: '#9B5DE5', fontSize: 22 },
  scroll: { padding: 16, gap: 4, paddingBottom: 40 },
  loadingBox: { paddingVertical: 20, alignItems: 'center' },

  sectionTitle: { color: '#D1D5DB', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  seeAll: { color: '#9B5DE5', fontSize: 13 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47%',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    borderTopWidth: 3,
    gap: 2,
  },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { color: '#9CA3AF', fontSize: 12 },
  statSub: { color: '#6B7280', fontSize: 11 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    gap: 8,
  },
  rowPhone: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  rowSub: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  rowChevron: { color: '#4B5563', fontSize: 20 },
  emptyRow: { paddingVertical: 14, alignItems: 'center' },
  emptyText: { color: '#10B981', fontSize: 13 },

  roleBadge: { backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  roleBadgeSpecial: { backgroundColor: '#2D1B69' },
  roleText: { color: '#9CA3AF', fontSize: 10, fontWeight: '700' },
  roleTextSpecial: { color: '#C4B5FD' },
  premiumBadge: { backgroundColor: '#78350F22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  premiumText: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },

  actionsGrid: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: { flex: 1, backgroundColor: '#1A1A2E', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  actionIcon: { fontSize: 28 },
  actionLabel: { color: '#D1D5DB', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
