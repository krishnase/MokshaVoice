import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Plan } from '@mokshavoice/shared-types';
import { Colors } from '@/src/theme';

interface Props {
  used: number;
  limit: number;
  plan: Plan;
}

export function QuotaMeter({ used, limit, plan }: Props) {
  const router = useRouter();
  const ratio = Math.min(used / limit, 1);
  const barColor = ratio >= 1 ? Colors.error : ratio >= 0.6 ? Colors.warning : Colors.success;
  const showUpgrade = plan === 'FREE' && (used >= 3 || used >= limit);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>
          Dreams this month: <Text style={styles.count}>{used}/{limit}</Text>
        </Text>
        <Text style={[styles.badge, plan === 'PREMIUM' ? styles.premiumBadge : styles.freeBadge]}>
          {plan}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${ratio * 100}%`, backgroundColor: barColor }]} />
      </View>
      {showUpgrade && (
        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => router.push('/(app)/(customer)/upgrade')}
        >
          <Text style={styles.upgradeBtnText}>Upgrade to Premium →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { color: Colors.gray3, fontSize: 13 },
  count: { color: Colors.white, fontWeight: '600' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  freeBadge: { backgroundColor: Colors.navyLight, color: Colors.gray3 },
  premiumBadge: { backgroundColor: Colors.orange, color: Colors.white },
  track: {
    height: 6,
    backgroundColor: Colors.navyLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: 3 },
  upgradeBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  upgradeBtnText: { color: Colors.orange, fontSize: 13, fontWeight: '600' },
});
