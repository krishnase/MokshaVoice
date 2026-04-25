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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import auth from '@react-native-firebase/auth';
import { phoneAuthStore } from '@/src/stores/phoneAuthStore';
import { Colors } from '@/src/theme';

const COUNTRY_CODES = [
  { code: '+1',  flag: '🇺🇸', label: 'US' },
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Image source={require('@/assets/icon.png')} style={styles.icon} resizeMode="contain" />
            </View>
            <Text style={styles.appName}>Moksha<Text style={styles.appNameAccent}>Voice</Text></Text>
            <Text style={styles.tagline}>AWAKEN  •  TRANSFORM  •  REALIZE</Text>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerIcon}>🪷</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Enter your phone number</Text>
            <Text style={styles.sublabel}>We'll send a one-time code to verify your number</Text>

            <View style={styles.phoneRow}>
              <TouchableOpacity
                style={styles.countryButton}
                onPress={() => setShowCountryPicker((v) => !v)}
              >
                <Text style={styles.countryFlag}>
                  {COUNTRY_CODES.find((c) => c.code === countryCode)?.flag ?? '🌍'}
                </Text>
                <Text style={styles.countryCode}>{countryCode}</Text>
                <Text style={styles.chevron}>▾</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.phoneInput}
                placeholder="(555) 000-0000"
                placeholderTextColor={Colors.gray4}
                keyboardType="phone-pad"
                value={formatDisplay(phoneNumber)}
                onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, ''))}
                maxLength={14}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />
            </View>

            {showCountryPicker && (
              <View style={styles.countryDropdown}>
                {COUNTRY_CODES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.countryOption, c.code === countryCode && styles.countryOptionSelected]}
                    onPress={() => { setCountryCode(c.code); setShowCountryPicker(false); }}
                  >
                    <Text style={styles.countryOptionText}>{c.flag}  {c.label}  {c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.sendButton, (!isValidPhone || isLoading) && styles.sendButtonDisabled]}
              onPress={handleSendOtp}
              disabled={!isValidPhone || isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.sendButtonText}>Continue Journey  ›</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.{'\n'}Standard SMS rates may apply.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 32 },
  header: { alignItems: 'center', paddingTop: 52, paddingBottom: 24 },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.gold + '55',
  },
  icon: { width: '100%', height: '100%' },
  appName: { fontFamily: 'Poppins_700Bold', fontSize: 34, color: Colors.white, letterSpacing: 0.5 },
  appNameAccent: { color: Colors.orange },
  tagline: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.gold, letterSpacing: 3, marginTop: 6 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gold + '33' },
  dividerIcon: { fontSize: 18, marginHorizontal: 12 },
  form: { flex: 1 },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: Colors.white, marginBottom: 6 },
  sublabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.gray3, marginBottom: 24 },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    gap: 4,
  },
  countryFlag: { fontSize: 18 },
  countryCode: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.white },
  chevron: { fontSize: 10, color: Colors.gray3, marginTop: 2 },
  phoneInput: {
    flex: 1,
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    letterSpacing: 0.5,
  },
  countryDropdown: {
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    marginBottom: 8,
    overflow: 'hidden',
  },
  countryOption: { paddingVertical: 12, paddingHorizontal: 16 },
  countryOptionSelected: { backgroundColor: Colors.orangeDim },
  countryOptionText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.white },
  sendButton: {
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sendButtonDisabled: { backgroundColor: Colors.gray4, shadowOpacity: 0 },
  sendButtonText: { fontFamily: 'Poppins_600SemiBold', color: Colors.white, fontSize: 16, letterSpacing: 0.3 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.gray4, textAlign: 'center', lineHeight: 17 },
});
