import { useRef, useState, useEffect, useCallback } from 'react';
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
import { useAuthStore } from '@/src/stores/authStore';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { api } from '@/src/lib/api';
import type { VerifyOtpResponse } from '@mokshavoice/shared-types';
import { Colors } from '@/src/theme';

const OTP_LENGTH = 6;
const RESEND_COUNTDOWN_S = 60;

export default function VerifyScreen() {
  const router = useRouter();
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const { setTokens, setUser } = useAuthStore();
  const { setSubscription } = useSubscriptionStore();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COUNTDOWN_S);

  const phone = phoneAuthStore.getPhone();
  const maskedPhone = phone.replace(/(\+\d{1,3})(\d+)(\d{4})/, '$1 ••••• $3');

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const filledOtp = otp.join('');
  const isComplete = filledOtp.length === OTP_LENGTH;

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (isComplete) handleVerify();
  }, [isComplete]);

  function handleCellChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);

    const next = [...otp];
    next[index] = digit;
    setOtp(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleCellKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      inputRefs.current[index - 1]?.focus();
    }
  }

  // Handle paste of full OTP code
  function handlePaste(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
    if (digits.length === OTP_LENGTH) {
      setOtp(digits);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  }

  const handleVerify = useCallback(async () => {
    const code = otp.join('');
    if (code.length !== OTP_LENGTH || isVerifying) return;

    const confirmation = phoneAuthStore.getConfirmation();
    if (!confirmation) {
      Alert.alert('Session expired', 'Please go back and request a new code.');
      router.replace('/(auth)/login');
      return;
    }

    setIsVerifying(true);
    try {
      // 1. Confirm OTP with Firebase — throws on wrong code
      const credential = await confirmation.confirm(code);
      if (!credential.user) throw new Error('Firebase auth failed');

      // 2. Get Firebase ID token to send to our backend
      const firebaseIdToken = await credential.user.getIdToken();

      // 3. Exchange Firebase token for our JWT
      const { accessToken, refreshToken, user, isNewUser } = await api.post<VerifyOtpResponse>(
        '/v1/auth/verify-otp',
        { phone, firebaseIdToken },
      );

      setTokens(accessToken, refreshToken);
      setUser(user);
      setSubscription(user.subscription);
      phoneAuthStore.clear();

      // New customers collect their name first
      if (isNewUser && user.role === 'CUSTOMER') {
        router.replace('/(auth)/profile-setup' as never);
        return;
      }

      // Role-based redirect
      switch (user.role) {
        case 'DECODER':
        case 'MENTOR':
          router.replace('/(app)/(decoder)/queue');
          break;
        case 'ADMIN':
          router.replace('/(app)/(admin)/dashboard');
          break;
        default:
          router.replace('/(app)/(customer)/');
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'auth/invalid-verification-code') {
        Alert.alert('Wrong code', 'That code is incorrect. Please check and try again.');
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      } else if (e.code === 'auth/code-expired') {
        Alert.alert('Code expired', 'This code has expired. Please request a new one.');
        setOtp(Array(OTP_LENGTH).fill(''));
        phoneAuthStore.clear();
      } else {
        Alert.alert('Verification failed', e.message ?? 'Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  }, [otp, isVerifying, phone]);

  async function handleResend() {
    const confirmation = phoneAuthStore.getConfirmation();
    if (!confirmation && !phone) {
      router.replace('/(auth)/login');
      return;
    }

    setIsResending(true);
    try {
      const newConfirmation = await auth().signInWithPhoneNumber(phone);
      phoneAuthStore.setConfirmation(newConfirmation, phone);
      setOtp(Array(OTP_LENGTH).fill(''));
      setCountdown(RESEND_COUNTDOWN_S);
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Error', e.message ?? 'Could not resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          {/* Back */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Go back"
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phoneHighlight}>{maskedPhone}</Text>
            </Text>
          </View>

          {/* OTP cells */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => { inputRefs.current[i] = r; }}
                style={[
                  styles.otpCell,
                  digit ? styles.otpCellFilled : null,
                  isVerifying ? styles.otpCellDisabled : null,
                ]}
                value={digit}
                onChangeText={(v) => {
                  if (v.length === OTP_LENGTH) {
                    handlePaste(v);
                  } else {
                    handleCellChange(i, v);
                  }
                }}
                onKeyPress={({ nativeEvent }) => handleCellKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                selectTextOnFocus
                editable={!isVerifying}
                accessibilityLabel={`OTP digit ${i + 1}`}
                textContentType="oneTimeCode"
                caretHidden
              />
            ))}
          </View>

          {/* Verify button */}
          {isComplete && (
            <TouchableOpacity
              style={[styles.verifyButton, isVerifying && styles.verifyButtonLoading]}
              onPress={handleVerify}
              disabled={isVerifying}
              accessibilityRole="button"
              accessibilityLabel="Verify code"
            >
              {isVerifying ? (
                <View style={styles.verifyingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.verifyButtonText}>  Verifying…</Text>
                </View>
              ) : (
                <Text style={styles.verifyButtonText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Resend */}
          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={styles.resendCountdown}>Resend code in {countdown}s</Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={isResending}
                accessibilityRole="button"
                accessibilityLabel="Resend OTP"
              >
                {isResending ? (
                  <ActivityIndicator size="small" color={Colors.orange} />
                ) : (
                  <Text style={styles.resendLink}>Resend code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.tip}>
            Check your SMS messages. The code expires in 10 minutes.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 32 },
  backButton: { paddingTop: 16, paddingBottom: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.orange },
  header: { paddingTop: 32, paddingBottom: 40 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 26, color: Colors.white, marginBottom: 10 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.gray3, lineHeight: 22 },
  phoneHighlight: { fontFamily: 'Inter_600SemiBold', color: Colors.white },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  otpCell: {
    width: 48,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.gold + '44',
    backgroundColor: Colors.navyCard,
    textAlign: 'center',
    fontFamily: 'Poppins_700Bold',
    fontSize: 24,
    color: Colors.white,
  },
  otpCellFilled: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  otpCellDisabled: { opacity: 0.5 },
  verifyButton: {
    backgroundColor: Colors.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: Colors.orange,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  verifyButtonLoading: { backgroundColor: Colors.orangeDim },
  verifyButtonText: { fontFamily: 'Poppins_600SemiBold', color: Colors.white, fontSize: 16, letterSpacing: 0.3 },
  verifyingRow: { flexDirection: 'row', alignItems: 'center' },
  resendRow: { alignItems: 'center', marginBottom: 24 },
  resendCountdown: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.gray4 },
  resendLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.orange, textDecorationLine: 'underline' },
  tip: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.gray4, textAlign: 'center', lineHeight: 18 },
});