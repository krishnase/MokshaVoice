import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { setUser, user } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = fullName.trim();
  const isValid = trimmed.length >= 2;

  async function handleSave() {
    if (!isValid || isSaving) return;

    setIsSaving(true);
    try {
      const { user: updated } = await api.put<{ user: typeof user }>('/v1/auth/profile', {
        fullName: trimmed,
      });
      if (updated) setUser(updated);
      router.replace('/(app)/(customer)/' as never);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Error', e.message ?? 'Could not save your name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.emoji}>🪷</Text>
            <Text style={styles.title}>Welcome to MokshaVoice</Text>
            <Text style={styles.subtitle}>
              What should we call you?
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Your full name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Arjuna Sharma"
              placeholderTextColor={Colors.gray4}
              value={fullName}
              onChangeText={setFullName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={100}
            />
            <Text style={styles.hint}>
              This helps your decoder greet you personally.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, (!isValid || isSaving) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Begin My Journey  ›</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(app)/(customer)/' as never)} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 48,
    gap: 32,
  },
  header: { alignItems: 'center', gap: 12 },
  emoji: { fontSize: 56 },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 26,
    color: Colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.gray3,
    textAlign: 'center',
    lineHeight: 24,
  },
  form: { gap: 8 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.gray3,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    color: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gold + '44',
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.gray4,
    marginTop: 6,
  },
  button: {
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonDisabled: { backgroundColor: Colors.gray4, shadowOpacity: 0 },
  buttonText: {
    fontFamily: 'Poppins_600SemiBold',
    color: Colors.white,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  skipBtn: { alignItems: 'center' },
  skipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.gray4,
    textDecorationLine: 'underline',
  },
});
