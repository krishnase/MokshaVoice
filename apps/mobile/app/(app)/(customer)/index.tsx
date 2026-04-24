import { useCallback, useMemo } from 'react';
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
import { SessionCard } from '@/src/components/SessionCard';
import { useSessions } from '@/src/hooks/useSessions';
import { useAuthStore } from '@/src/stores/authStore';
import type { SessionWithMeta } from '@mokshavoice/shared-types';

export default function DreamList() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isNonCustomer = user?.role !== 'CUSTOMER';
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useSessions();

  const sessions = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const handlePress = useCallback(
    (id: string, title: string) =>
      router.push(`/(app)/(customer)/session/${id}?sessionTitle=${encodeURIComponent(title)}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SessionWithMeta; index: number }) => (
      <SessionCard session={item} dreamNumber={index + 1} onPress={handlePress} />
    ),
    [handlePress],
  );

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color="#9B5DE5" />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🌙</Text>
        <Text style={styles.emptyTitle}>No dreams yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the button below to submit your first dream
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {isNonCustomer ? (
          <TouchableOpacity onPress={() => router.push('/(app)/mode-select')} style={styles.backBtn}>
            <Text style={styles.backText}>← Mode</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.title, isNonCustomer && styles.titleSmall]}>My Dreams</Text>
        {!isNonCustomer ? (
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => router.push('/(app)/notifications')}
          >
            <Text style={styles.notifIcon}>🔔</Text>
          </TouchableOpacity>
        ) : <View style={styles.notifBtn} />}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#9B5DE5" size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#9B5DE5"
            />
          }
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={sessions.length === 0 ? styles.emptyContainer : styles.list}
        />
      )}

      {/* Bottom tab bar — customers only */}
      {!isNonCustomer && (
        <View style={styles.tabBar}>
          <View style={styles.tabActive}>
            <Text style={styles.tabIconActive}>🌙</Text>
            <Text style={styles.tabLabelActive}>Dreams</Text>
          </View>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => router.push('/(app)/(customer)/profile')}
          >
            <Text style={styles.tabIcon}>👤</Text>
            <Text style={styles.tabLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FAB — record new dream */}
      <TouchableOpacity
        style={[styles.fab, isNonCustomer && styles.fabNonCustomer]}
        onPress={() => router.push('/(app)/(customer)/submit')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: { minWidth: 60 },
  backText: { color: '#9B5DE5', fontSize: 15 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '700', flex: 1, textAlign: 'center' },
  titleSmall: { fontSize: 20, textAlign: 'center' },
  notifBtn: { minWidth: 60, alignItems: 'flex-end', padding: 4 },
  notifIcon: { fontSize: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 100 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
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
  fabNonCustomer: { bottom: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#9B5DE5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9B5DE5',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabIcon: { color: '#FFF', fontSize: 28, lineHeight: 30 },
});
