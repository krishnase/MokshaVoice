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
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';

type Role = 'CUSTOMER' | 'DECODER' | 'MENTOR' | 'ADMIN';
type AssignedMentor = { id: string; name: string };
type AdminUser = {
  id: string;
  phone: string;
  fullName: string | null;
  role: Role;
  displayName: string | null;
  createdAt: string;
  subscription: { plan: string; status: string; dreamsUsed: number } | null;
  assignedMentor: AssignedMentor | null;
  _count: { sessions: number };
};
type UsersPage = { data: AdminUser[]; nextCursor: string | null; hasMore: boolean };
type MentorListItem = { id: string; name: string; active: boolean };

const ROLES: Role[] = ['CUSTOMER', 'DECODER', 'MENTOR', 'ADMIN'];
const ROLE_FILTERS = [{ label: 'All', value: undefined }, ...ROLES.map((r) => ({ label: r, value: r }))] as const;

const ROLE_COLOR: Record<Role, string> = {
  CUSTOMER: Colors.gray3,
  DECODER: Colors.gold,
  MENTOR: '#3B82F6',
  ADMIN: Colors.error,
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

  const mentorsQuery = useQuery({
    queryKey: ['admin-mentors-list'],
    queryFn: () => api.get<{ mentors: MentorListItem[] }>('/v1/admin/mentors'),
  });

  const users = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const activeMentors = useMemo(
    () => (mentorsQuery.data?.mentors ?? []).filter((m) => m.active),
    [mentorsQuery.data],
  );

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

  const assignMentor = useCallback(async (user: AdminUser) => {
    if (activeMentors.length === 0) {
      Alert.alert('No active mentors', 'Add mentors first from the Mentors screen.');
      return;
    }

    const options = activeMentors.map((m) => m.name);
    const withUnassign = user.assignedMentor ? ['Remove mentor', ...options] : options;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...withUnassign, 'Cancel'],
          cancelButtonIndex: withUnassign.length,
          title: `Assign mentor to ${user.fullName ?? maskPhone(user.phone)}`,
        },
        async (index) => {
          if (index >= withUnassign.length) return;
          const label = withUnassign[index]!;
          if (label === 'Remove mentor') {
            await applyMentorChange(user.id, null);
          } else {
            const mentor = activeMentors.find((m) => m.name === label);
            if (mentor) await applyMentorChange(user.id, mentor.id);
          }
        },
      );
    } else {
      Alert.alert(
        `Assign mentor to ${user.fullName ?? maskPhone(user.phone)}`,
        user.assignedMentor ? `Currently: ${user.assignedMentor.name}` : 'No mentor assigned',
        [
          ...(user.assignedMentor
            ? [{ text: 'Remove mentor', onPress: () => applyMentorChange(user.id, null), style: 'destructive' as const }]
            : []),
          ...activeMentors.map((m) => ({ text: m.name, onPress: () => applyMentorChange(user.id, m.id) })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  }, [activeMentors]);

  const applyMentorChange = async (userId: string, mentorId: string | null) => {
    setUpdatingId(userId);
    try {
      await api.patch(`/v1/admin/users/${userId}/mentor`, { mentorId });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: unknown) {
      Alert.alert('Error', (err as { message?: string }).message ?? 'Could not assign mentor.');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = useCallback(({ item }: { item: AdminUser }) => {
    const roleColor = ROLE_COLOR[item.role];
    const isUpdating = updatingId === item.id;
    const label = item.fullName ?? item.displayName ?? maskPhone(item.phone);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.displayName}>{label}</Text>
            {(item.fullName || item.displayName) && (
              <Text style={styles.phone}>{maskPhone(item.phone)}</Text>
            )}
            <Text style={styles.meta}>
              Joined {timeAgo(item.createdAt)} · {item._count.sessions} dream{item._count.sessions !== 1 ? 's' : ''}
            </Text>
            {/* Assigned mentor chip */}
            {item.role === 'CUSTOMER' && (
              <View style={styles.mentorChipRow}>
                <Text style={styles.mentorChipLabel}>Mentor: </Text>
                <Text style={[styles.mentorChipValue, !item.assignedMentor && styles.mentorChipNone]}>
                  {item.assignedMentor ? item.assignedMentor.name : 'Not assigned'}
                </Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.roleBadge, { borderColor: roleColor, backgroundColor: roleColor + '18' }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{item.role}</Text>
            </View>
            {item.subscription && item.subscription.plan !== 'FREE' && (
              <View style={styles.planBadge}>
                <Text style={styles.planText}>{item.subscription.plan}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, isUpdating && styles.btnDisabled]}
            onPress={() => changeRole(item)}
            disabled={isUpdating}
          >
            {isUpdating
              ? <ActivityIndicator color={Colors.orange} size="small" />
              : <Text style={styles.actionBtnText}>Change Role</Text>
            }
          </TouchableOpacity>

          {item.role === 'CUSTOMER' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.mentorBtn, isUpdating && styles.btnDisabled]}
              onPress={() => assignMentor(item)}
              disabled={isUpdating}
            >
              <Text style={styles.mentorBtnText}>
                {item.assignedMentor ? 'Reassign Mentor' : 'Assign Mentor'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [updatingId, changeRole, assignMentor]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Users</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone…"
          placeholderTextColor={Colors.gray4}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

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
        <View style={styles.center}><ActivityIndicator color={Colors.orange} size="large" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={Colors.orange} />}
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={Colors.orange} style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No users found</Text></View>}
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
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: { backgroundColor: Colors.navyCard, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: Colors.white, fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: Colors.gold + '22' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.gold + '33' },
  filterPillActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orange },
  filterText: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_500Medium' },
  filterTextActive: { color: Colors.orangeLight },
  list: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_400Regular' },

  card: { backgroundColor: Colors.navyCard, borderRadius: 12, marginHorizontal: 16, marginVertical: 5, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.gold + '18' },
  cardTop: { flexDirection: 'row', gap: 8 },
  displayName: { color: Colors.white, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  phone: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  meta: { color: Colors.gray4, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  mentorChipRow: { flexDirection: 'row', marginTop: 5, alignItems: 'center' },
  mentorChipLabel: { color: Colors.gray4, fontSize: 12, fontFamily: 'Inter_400Regular' },
  mentorChipValue: { color: Colors.gold, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  mentorChipNone: { color: Colors.gray4, fontFamily: 'Inter_400Regular' },
  roleBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  planBadge: { backgroundColor: Colors.orangeDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  planText: { color: Colors.orange, fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: Colors.orange + '44', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  mentorBtn: { borderColor: Colors.gold + '66', flex: 1.3 },
  btnDisabled: { opacity: 0.5 },
  actionBtnText: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  mentorBtnText: { color: Colors.gold, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
