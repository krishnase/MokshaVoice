import { View, Text, TouchableOpacity, Alert, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';
import { Colors } from '@/src/theme';

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
      color: Colors.orange,
    },
    ...(isDecoder ? [{
      icon: '🔍',
      title: 'Decoder',
      subtitle: 'View and interpret the dream queue',
      route: '/(app)/(decoder)/queue',
      color: Colors.gold,
    }] : []),
    ...(isAdmin ? [{
      icon: '⚙️',
      title: 'Admin',
      subtitle: 'Manage users and platform settings',
      route: '/(app)/(admin)/dashboard',
      color: Colors.green,
    }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Image source={require('@/assets/icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.heading}>Moksha<Text style={styles.headingAccent}>Voice</Text></Text>
        <Text style={styles.sub}>Choose your path</Text>

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
  safe: { flex: 1, backgroundColor: Colors.navy },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12, alignItems: 'stretch' },
  logo: { width: 90, height: 90, borderRadius: 20, alignSelf: 'center', marginBottom: 4 },
  heading: { fontFamily: 'Poppins_700Bold', color: Colors.white, fontSize: 28, textAlign: 'center', marginBottom: 2 },
  headingAccent: { color: Colors.orange },
  sub: { fontFamily: 'Inter_400Regular', color: Colors.gold, fontSize: 13, textAlign: 'center', letterSpacing: 2, marginBottom: 16 },
  cards: { gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navyCard,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardIcon: { fontSize: 32 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 18 },
  cardSubtitle: { fontFamily: 'Inter_400Regular', color: Colors.gray3, fontSize: 13 },
  arrow: { fontSize: 28 },
  signOutBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Colors.navyCard,
    borderWidth: 1,
    borderColor: Colors.error + '33',
  },
  signOutText: { fontFamily: 'Inter_600SemiBold', color: Colors.error, fontSize: 15 },
});
