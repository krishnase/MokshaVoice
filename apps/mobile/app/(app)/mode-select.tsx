import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';

type ModeCard = {
  icon: string;
  title: string;
  subtitle: string;
  route: string;
  color: string;
};

export default function ModeSelect() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const isDecoder = user?.role === 'DECODER' || user?.role === 'MENTOR' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  const cards: ModeCard[] = [
    {
      icon: '🌙',
      title: 'Customer',
      subtitle: 'Submit and track your own dreams',
      route: '/(app)/(customer)',
      color: '#9B5DE5',
    },
    ...(isDecoder ? [{
      icon: '🔍',
      title: 'Decoder',
      subtitle: 'View and interpret the dream queue',
      route: '/(app)/(decoder)/queue',
      color: '#3B82F6',
    }] : []),
    ...(isAdmin ? [{
      icon: '⚙️',
      title: 'Admin',
      subtitle: 'Manage users and platform settings',
      route: '/(app)/(admin)/dashboard',
      color: '#10B981',
    }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>Choose your mode</Text>
        <Text style={styles.sub}>You can switch between modes at any time</Text>

        <View style={styles.cards}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.route}
              style={[styles.card, { borderColor: card.color + '55' }]}
              onPress={() => router.push(card.route as never)}
              activeOpacity={0.75}
            >
              <Text style={styles.cardIcon}>{card.icon}</Text>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: card.color }]}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Text style={[styles.arrow, { color: card.color }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  heading: { color: '#FFF', fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  sub: { color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  cards: { gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardIcon: { fontSize: 32 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardSubtitle: { color: '#9CA3AF', fontSize: 13 },
  arrow: { fontSize: 28, fontWeight: '300' },
  signOutBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1A1A2E',
  },
  signOutText: { color: '#EF476F', fontSize: 15, fontWeight: '600' },
});
