import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Audio } from 'expo-av';
import { QuotaMeter } from '@/src/components/QuotaMeter';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';
import { useAuthStore } from '@/src/stores/authStore';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';

const MAX_TEXT = 1000;

type Clip = { id: string; uri: string; durationS: number };
type Note = { id: string; value: string };

type SubmitResponse = {
  session: { id: string };
  quota: { allowed: boolean; status: string; used: number; limit: number };
};

let _idCounter = 0;
function nextId() { return String(++_idCounter); }

export default function SubmitDream() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { subscription } = useSubscriptionStore();

  const recordingRef = useRef<Audio.Recording | null>(null);
  const startTimeRef = useRef<number>(0);
  const isOperatingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [notes, setNotes] = useState<Note[]>([{ id: nextId(), value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);

  const validNotes = notes.filter((n) => n.value.trim().length > 0);
  const canSubmit = clips.length > 0 || validNotes.length > 0;
  const lastNoteHasContent = (notes[notes.length - 1]?.value.trim().length ?? 0) > 0;

  async function startRecording() {
    if (isRecording || isOperatingRef.current) return;
    isOperatingRef.current = true;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed to record your dream.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Recording error', e.message ?? 'Could not start recording.');
    } finally {
      isOperatingRef.current = false;
    }
  }

  async function stopRecording() {
    if (!recordingRef.current || !isRecording || isOperatingRef.current) return;
    isOperatingRef.current = true;
    setIsRecording(false);
    const rec = recordingRef.current;
    recordingRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      const durationS = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (uri && durationS >= 1) {
        setClips((prev) => [...prev, { id: nextId(), uri, durationS }]);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Recording error', e.message ?? 'Could not save recording.');
    } finally {
      isOperatingRef.current = false;
    }
  }

  function removeClip(id: string) {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }

  function updateNote(id: string, value: string) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, value: value.slice(0, MAX_TEXT) } : n)),
    );
  }

  function removeNote(id: string) {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      return next.length > 0 ? next : [{ id: nextId(), value: '' }];
    });
  }

  function addNote() {
    setNotes((prev) => [...prev, { id: nextId(), value: '' }]);
  }

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();

      for (const clip of clips) {
        formData.append('audio', {
          uri: clip.uri,
          type: 'audio/m4a',
          name: `recording-${clip.id}.m4a`,
        } as unknown as Blob);
        formData.append('durationS', String(clip.durationS));
      }

      for (const note of validNotes) {
        formData.append('text', note.value.trim());
      }
      for (const note of notes) {
        if (!validNotes.find((n) => n.id === note.id) && note.value.trim()) {
          formData.append('text', note.value.trim());
        }
      }

      const { session } = await api.postForm<SubmitResponse>('/v1/dreams', formData);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription'] });
      router.replace(`/(app)/(customer)/session/${session.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Submission failed', e.message ?? 'Please try again.');
      setIsSubmitting(false);
    }
  }

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
          <Text style={styles.heading}>Share Your Dream</Text>
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

          <Text style={styles.subtitle}>Record and describe your dream</Text>

          {/* Voice Recordings */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Voice Recordings{clips.length > 0 ? ` (${clips.length})` : ' (Optional)'}
            </Text>

            {clips.map((clip, i) => (
              <View key={clip.id} style={styles.clipRow}>
                <Text style={styles.clipIcon}>🎙️</Text>
                <Text style={styles.clipText}>
                  Recording {i + 1} — {clip.durationS}s
                </Text>
                <TouchableOpacity
                  onPress={() => removeClip(clip.id)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.recordArea}>
              <Pressable
                onPressIn={startRecording}
                onPressOut={stopRecording}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.recordButton,
                  pressed && !isRecording && styles.recordButtonPressed,
                  isRecording && styles.recordButtonRecording,
                ]}
              >
                {isRecording ? (
                  <View style={styles.recordingDot} />
                ) : (
                  <Text style={styles.micIcon}>🎙️</Text>
                )}
              </Pressable>
              <Text style={styles.recordHint}>
                {isRecording
                  ? 'Recording… Release to save'
                  : clips.length > 0
                  ? 'Hold to add another recording'
                  : 'Hold to Record'}
              </Text>
            </View>
          </View>

          {/* Text Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Dream Notes{validNotes.length > 0 ? ` (${validNotes.length})` : ' (Optional)'}
            </Text>

            {notes.map((note, i) => (
              <View key={note.id} style={styles.noteBlock}>
                <View style={styles.noteLabelRow}>
                  <Text style={styles.noteIndex}>Note {i + 1}</Text>
                  {notes.length > 1 && (
                    <TouchableOpacity onPress={() => removeNote(note.id)}>
                      <Text style={styles.removeNoteText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[
                    styles.textArea,
                    focusedNoteId === note.id && styles.textAreaFocused,
                  ]}
                  placeholder="Describe your dream… What did you see, feel, or experience?"
                  placeholderTextColor={Colors.gray4}
                  multiline
                  numberOfLines={4}
                  value={note.value}
                  onChangeText={(t) => updateNote(note.id, t)}
                  onFocus={() => setFocusedNoteId(note.id)}
                  onBlur={() => setFocusedNoteId(null)}
                  editable={!isSubmitting}
                  textAlignVertical="top"
                />
                <Text style={styles.charCounter}>
                  {note.value.length}/{MAX_TEXT}
                </Text>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.addNoteBtn, !lastNoteHasContent && styles.addNoteBtnDisabled]}
              onPress={addNote}
              disabled={!lastNoteHasContent || isSubmitting}
            >
              <Text
                style={[
                  styles.addNoteBtnText,
                  !lastNoteHasContent && styles.addNoteBtnTextDisabled,
                ]}
              >
                + Add Another Note
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.submitArea}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <View style={styles.submitRow}>
                <ActivityIndicator color={Colors.white} />
                <Text style={styles.submitBtnText}>  Submitting…</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>Analyze My Dream</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_500Medium' },
  heading: { color: Colors.white, fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  placeholder: { width: 60 },
  subtitle: { color: Colors.gray3, fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  content: { padding: 20, gap: 24, paddingBottom: 16 },
  section: { gap: 12 },
  sectionLabel: { color: Colors.gray3, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.greenDim,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  clipIcon: { fontSize: 16 },
  clipText: { flex: 1, color: Colors.success, fontSize: 14, fontFamily: 'Inter_500Medium' },
  deleteBtn: { padding: 4 },
  deleteText: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  recordArea: { alignItems: 'center', paddingVertical: 12, gap: 10 },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.navyCard,
    borderWidth: 2,
    borderColor: Colors.gold + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonPressed: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  recordButtonRecording: { borderColor: Colors.error, backgroundColor: '#3B0F0F' },
  recordingDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.error },
  micIcon: { fontSize: 30 },
  recordHint: { color: Colors.gray4, fontSize: 13, fontFamily: 'Inter_400Regular' },

  noteBlock: { gap: 6 },
  noteLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteIndex: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_500Medium' },
  removeNoteText: { color: Colors.error, fontSize: 12, fontFamily: 'Inter_400Regular' },
  textArea: {
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    padding: 14,
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
    minHeight: 110,
    borderWidth: 1.5,
    borderColor: Colors.gold + '33',
  },
  textAreaFocused: { borderColor: Colors.orange },
  charCounter: { color: Colors.gray4, fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right' },

  addNoteBtn: {
    borderWidth: 1,
    borderColor: Colors.orange,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addNoteBtnDisabled: { borderColor: Colors.gold + '33' },
  addNoteBtnText: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  addNoteBtnTextDisabled: { color: Colors.gray4 },

  submitArea: { padding: 20, paddingTop: 8 },
  submitBtn: {
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
  submitBtnDisabled: { backgroundColor: Colors.gray4, shadowOpacity: 0 },
  submitBtnText: { color: Colors.white, fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  submitRow: { flexDirection: 'row', alignItems: 'center' },
});
