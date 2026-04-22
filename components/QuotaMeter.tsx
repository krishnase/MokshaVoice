import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Plan } from '@mokshavoice/shared-types';

interface QuotaMeterProps {
  used: number;
  limit: number;
  plan: 'free' | 'premium';
}

export function QuotaMeter({ used, limit, plan }: QuotaMeterProps) {
  const router = useRouter();
  const ratio = limit > 0 ? used / limit : 0;
  const clamped = Math.min(ratio, 1);

  const barColor =
    ratio >= 1 ? '#EF4444' : ratio >= 0.6 ? '#F59E0B' : '#10B981';

  const showUpgradeCta = (plan === 'free' && used >= 3) || used >= limit;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>
          {used}/{limit} dreams used this month
        </Text>
        {plan === 'premium' && <Text style={styles.badge}>Premium</Text>}
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: barColor }]} />
      </View>

      {showUpgradeCta && plan === 'free' && (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/(app)/(customer)/upgrade')}
        >
          <Text style={styles.ctaText}>Upgrade for more dreams</Text>
        </TouchableOpacity>
      )}

      {used >= limit && plan === 'premium' && (
        <Text style={styles.limitReached}>Monthly limit reached. Resets next cycle.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F1F33',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: { fontSize: 14, color: '#D1D5DB', fontWeight: '500' },
  badge: {
    backgroundColor: '#7C3AED',
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  track: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  ctaButton: {
    marginTop: 12,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  limitReached: { marginTop: 8, fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
});
