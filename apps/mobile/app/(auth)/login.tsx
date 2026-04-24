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
import auth from '@react-native-firebase/auth';
import { phoneAuthStore } from '@/src/stores/phoneAuthStore';

// Country code options — extend as needed
const COUNTRY_CODES = [
  { code: '+1', flag: '🇺🇸', label: 'US' },
  { code: '+91', flag: '🇮🇳', label: 'IN' },
  { code: '+44', flag: '🇬🇧', label: 'GB' },
  { code: '+61', flag: '🇦🇺', label: 'AU' },
];

export default function LoginScreen() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const fullPhone = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;
  const isValidPhone = /^\+[1-9]\d{6,14}$/.test(fullPhone);

  async function handleSendOtp() {
    if (!isValidPhone) {
      Alert.alert('Invalid number', 'Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    try {
      // Trigger Firebase phone auth (sends SMS)
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);

      phoneAuthStore.setConfirmation(confirmation, fullPhone);
      router.push('/(auth)/verify');
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e.code === 'auth/too-many-requests') {
        Alert.alert('Too many attempts', 'Please wait a few minutes before trying again.');
      } else if (e.code === 'auth/invalid-phone-number') {
        Alert.alert('Invalid number', 'Please check the phone number and try again.');
      } else {
        Alert.alert('Error', e.message ?? 'Could not send OTP. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function formatDisplay(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>🌙</Text>
            <Text style={styles.appName}>MokshaVoice</Text>
            <Text style={styles.tagline}>Dream Analysis & Spiritual Guidance</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Enter your phone number</Text>
            <Text style={styles.sublabel}>
              We'll send a one-time code to verify your number
            </Text>

            <View style={styles.phoneRow}>
              {/* Country code picker trigger */}
              <TouchableOpacity
                style={styles.countryButton}
                onPress={() => setShowCountryPicker((v) => !v)}
                accessibilityLabel="Select country code"
              >
                <Text style={styles.countryFlag}>
                  {COUNTRY_CODES.find((c) => c.code === countryCode)?.flag ?? '🌍'}
                </Text>
                <Text style={styles.countryCode}>{countryCode}</Text>
                <Text style={styles.chevron}>▾</Text>
              </TouchableOpacity>

              {/* Phone number input */}
              <TextInput
                style={styles.phoneInput}
                placeholder="(555) 000-0000"
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
                value={formatDisplay(phoneNumber)}
                onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, ''))}
                maxLength={14}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
                accessibilityLabel="Phone number"
              />
            </View>

            {/* Inline country picker */}
            {showCountryPicker && (
              <View style={styles.countryDropdown}>
                {COUNTRY_CODES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[
                      styles.countryOption,
                      c.code === countryCode && styles.countryOptionSelected,
                    ]}
                    onPress={() => {
                      setCountryCode(c.code);
                      setShowCountryPicker(false);
                    }}
                  >
                    <Text style={styles.countryOptionText}>
                      {c.flag}  {c.label}  {c.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.sendButton, (!isValidPhone || isLoading) && styles.sendButtonDisabled]}
              onPress={handleSendOtp}
              disabled={!isValidPhone || isLoading}
              accessibilityRole="button"
              accessibilityLabel="Send OTP"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>Send Verification Code</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
            Standard SMS rates may apply.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F1A' },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  header: { alignItems: 'center', paddingTop: 64, paddingBottom: 40 },
  logo: { fontSize: 64, marginBottom: 12 },
  appName: { fontSize: 32, fontWeight: '700', color: '#F3F4F6', letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  form: { flex: 1 },
  label: { fontSize: 20, fontWeight: '600', color: '#F3F4F6', marginBottom: 6 },
  sublabel: { fontSize: 14, color: '#9CA3AF', marginBottom: 24 },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F33',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 4,
  },
  countryFlag: { fontSize: 18 },
  countryCode: { fontSize: 15, color: '#F3F4F6', fontWeight: '600' },
  chevron: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1F1F33',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#374151',
    letterSpacing: 0.5,
  },
  countryDropdown: {
    backgroundColor: '#1F1F33',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 8,
    overflow: 'hidden',
  },
  countryOption: { paddingVertical: 12, paddingHorizontal: 16 },
  countryOptionSelected: { backgroundColor: '#2D1F5E' },
  countryOptionText: { fontSize: 15, color: '#F3F4F6' },
  sendButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  sendButtonDisabled: { backgroundColor: '#4B5563' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  disclaimer: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
});
