import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/api';

type Role = 'CUSTOMER' | 'DECODER' | 'MENTOR' | 'ADMIN';
type AdminUser = {
  id: string;
  phone: string;
  role: Role;
  displayName: string | null;
  createdAt: string;
  subscription: { plan: string; status: string; dreamsUsed: number } | null;
  _count: { sessions: number };
};
type UsersPage = { data: AdminUser[]; nextCursor: string | null; hasMore: boolean };

const ROLES: Role[] = ['CUSTOMER', 'DECODER', 'MENTOR', 'ADMIN'];
const ROLE_FILTERS = [{ label: 'All', value: undefined }, ...ROLES.map((r) => ({ label: r, value: r }))] as const;

const ROLE_COLOR: Record<Role, string> = {
  CUSTOMER: '#6B7280',
  DECODER: '#9B5DE5',
  MENTOR: '#3B82F6',
  ADMIN: '#EF4444',
};

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 3) + ' ••••• ' + phone.slice(-4);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function AdminUsers() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<Role | undefined>(params.role as Role | undefined);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['admin-users', roleFilter, search],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: '20' });
      if (roleFilter) p.set('role', roleFilter);
      if (search.trim().length >= 2) p.set('search', search.trim());
      if (pageParam) p.set('cursor', pageParam);
      return api.get<UsersPage>(`/v1/admin/users?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const users = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const changeRole = useCallback(async (user: AdminUser) => {
    const options = ROLES.filter((r) => r !== user.role);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, 'Cancel'], cancelButtonIndex: options.length, title: `Change role for ${maskPhone(user.phone)}` },
        async (index) => {
          if (index >= options.length) return;
          await applyRoleChange(user.id, options[index]!);
        },
      );
    } else {
      Alert.alert(
        `Change role for ${maskPhone(user.phone)}`,
        `Current: ${user.role}`,
        [
          ...options.map((r) => ({ text: r, onPress: () => applyRoleChange(user.id, r) })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }, []);

  const applyRoleChange = async (userId: string, role: Role) => {
    setUpdatingId(userId);
    try {
      await api.patch(`/v1/admin/users/${userId}/role`, { role });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (err: unknown) {
      Alert.alert('Error', (err as { message?: string }).message ?? 'Could not update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = useCallback(({ item }: { item: AdminUser }) => {
    const roleColor = ROLE_COLOR[item.role];
    const isUpdating = updatingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            {item.displayName
              ? <>
                  <Text style={styles.displayName}>{item.displayName}</Text>
                  <Text style={styles.phone}>{maskPhone(item.phone)}</Text>
                </>
              : <Text style={styles.phone}>{maskPhone(item.phone)}</Text>
            }
            <Text style={styles.meta}>
              Joined {timeAgo(item.createdAt)} · {item._count.sessions} dream{item._count.sessions !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.roleBadge, { borderColor: roleColor, backgroundColor: roleColor + '18' }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{item.role}</Text>
            </View>
            {item.subscription?.plan === 'PREMIUM' && (
              <View style={styles.proBadge}><Text style={styles.proText}>PRO</Text></View>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.changeRoleBtn, isUpdating && styles.btnDisabled]}
          onPress={() => changeRole(item)}
          disabled={isUpdating}
        >
          {isUpdating
            ? <ActivityIndicator color="#9B5DE5" size="small" />
            : <Text style={styles.changeRoleText}>Change Role</Text>
          }
        </TouchableOpacity>
      </View>
    );
  }, [updatingId, changeRole]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Users</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone…"
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {/* Role filter */}
      <View style={styles.filterRow}>
        {ROLE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterPill, roleFilter === f.value && styles.filterPillActive]}
            onPress={() => setRoleFilter(f.value)}
          >
            <Text style={[styles.filterText, roleFilter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#9B5DE5" size="large" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor="#9B5DE5" />}
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color="#9B5DE5" style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No users found</Text></View>}
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
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: { backgroundColor: '#1A1A2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 14 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#374151' },
  filterPillActive: { backgroundColor: '#2D1B69', borderColor: '#9B5DE5' },
  filterText: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: '#C4B5FD' },
  list: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontSize: 14 },
  card: { backgroundColor: '#1A1A2E', borderRadius: 12, marginHorizontal: 16, marginVertical: 5, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 8 },
  displayName: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  phone: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  meta: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  roleBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 10, fontWeight: '700' },
  proBadge: { backgroundColor: '#78350F22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  proText: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
  changeRoleBtn: { borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  changeRoleText: { color: '#9B5DE5', fontSize: 13, fontWeight: '600' },
});
