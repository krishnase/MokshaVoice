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
import { Colors } from '@/src/theme';

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
        <ActivityIndicator color={Colors.orange} />
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
          <ActivityIndicator color={Colors.orange} size="large" />
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
              tintColor={Colors.orange}
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
            onPress={() => router.push('/(app)/(customer)/mentors')}
          >
            <Text style={styles.tabIcon}>🧘</Text>
            <Text style={styles.tabLabel}>Mentors</Text>
          </TouchableOpacity>
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
  safe: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: { minWidth: 60 },
  backText: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_500Medium' },
  title: { color: Colors.white, fontSize: 28, fontFamily: 'Poppins_700Bold', flex: 1, textAlign: 'center' },
  titleSmall: { fontSize: 20, textAlign: 'center' },
  notifBtn: { minWidth: 60, alignItems: 'flex-end', padding: 4 },
  notifIcon: { fontSize: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 100 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 40 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: Colors.white, fontSize: 22, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  emptySubtitle: { color: Colors.gray3, fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
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
  fabNonCustomer: { bottom: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabIcon: { color: Colors.white, fontSize: 28, lineHeight: 30 },
});
