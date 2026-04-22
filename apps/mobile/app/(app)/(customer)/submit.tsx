import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldToRecord } from '@/src/components/HoldToRecord';
import { QuotaMeter } from '@/src/components/QuotaMeter';
import { useCreateSession } from '@/src/hooks/useSessions';
import { useAudioUpload } from '@/src/hooks/useAudioUpload';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { api } from '@/src/lib/api';

type Mode = 'idle' | 'voice' | 'text';

export default function SubmitDream() {
  const router = useRouter();
  const { subscription } = useSubscriptionStore();
  const createSession = useCreateSession();
  const {
    isRecording,
    recordingDurationMs,
    isUploading,
    startRecording,
    stopAndUpload,
    cancelRecording,
  } = useAudioUpload();

  const [mode, setMode] = useState<Mode>('idle');
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const handleHoldStart = async () => {
    setMode('voice');
    await startRecording();
  };

  const handleHoldEnd = async () => {
    if (!isRecording) return;
    setIsSubmitting(true);
    try {
      // Create session while recording is still running, then stop+upload
      const { session } = await createSession.mutateAsync();
      sessionIdRef.current = session.id;

      const uploaded = await stopAndUpload(session.id, true);
      if (!uploaded) {
        setIsSubmitting(false);
        setMode('idle');
        return;
      }

      await api.post(`/v1/sessions/${session.id}/messages`, {
        type: 'VOICE',
        messageId: uploaded.messageId,
        audioKey: uploaded.key,
        audioDurationS: uploaded.audioDurationS,
        isDreamSubmission: true,
      });

      router.replace(`/(app)/(customer)/session/${session.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Submission failed', e.message ?? 'Please try again.');
      setIsSubmitting(false);
      setMode('idle');
    }
  };

  const handleCancel = async () => {
    await cancelRecording();
    setMode('idle');
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setIsSubmitting(true);
    try {
      const { session } = await createSession.mutateAsync();
      await api.post(`/v1/sessions/${session.id}/messages`, {
        type: 'TEXT',
        content: textInput.trim(),
      });
      router.replace(`/(app)/(customer)/session/${session.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Submission failed', e.message ?? 'Please try again.');
      setIsSubmitting(false);
    }
  };

  const isDisabled = isSubmitting || isUploading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>New Dream</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {subscription && (
            <QuotaMeter
              used={subscription.dreamsUsed}
              limit={subscription.limit}
              plan={subscription.plan}
            />
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Record your dream</Text>
            <Text style={styles.sectionSub}>
              Hold the button and speak. Release when done.
            </Text>
            <View style={styles.recordArea}>
              <HoldToRecord
                isRecording={isRecording}
                isDisabled={isDisabled || mode === 'text'}
                onHoldStart={handleHoldStart}
                onHoldEnd={handleHoldEnd}
                onCancel={handleCancel}
                durationMs={recordingDurationMs}
              />
              {isUploading && (
                <Text style={styles.uploadingText}>Uploading…</Text>
              )}
            </View>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.orText}>or type it</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.section}>
            <TextInput
              style={[styles.textArea, mode === 'voice' && styles.textAreaDisabled]}
              placeholder="Describe your dream in words…"
              placeholderTextColor="#555"
              multiline
              value={textInput}
              onChangeText={(t) => {
                setTextInput(t);
                if (t.length > 0) setMode('text');
                else if (!isRecording) setMode('idle');
              }}
              editable={!isDisabled && !isRecording}
            />
            {mode === 'text' && textInput.trim().length > 0 && (
              <TouchableOpacity
                style={[styles.submitBtn, isDisabled && styles.submitBtnDisabled]}
                onPress={handleTextSubmit}
                disabled={isDisabled}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting ? 'Submitting…' : 'Submit Dream'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { color: '#9B5DE5', fontSize: 15 },
  heading: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  placeholder: { width: 60 },
  content: { padding: 20, gap: 24 },
  section: { gap: 8 },
  sectionTitle: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  sectionSub: { color: '#888', fontSize: 13 },
  recordArea: { alignItems: 'center', paddingVertical: 24, gap: 16 },
  uploadingText: { color: '#888', fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: '#222' },
  orText: { color: '#555', fontSize: 13 },
  textArea: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  textAreaDisabled: { opacity: 0.4 },
  submitBtn: {
    backgroundColor: '#9B5DE5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
