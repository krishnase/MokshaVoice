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
  // Start with one empty note so the text section is always visible
  const [notes, setNotes] = useState<Note[]>([{ id: nextId(), value: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);

  const validNotes = notes.filter((n) => n.value.trim().length > 0);
  const canSubmit = clips.length > 0 || validNotes.length > 0;
  const lastNoteHasContent = (notes[notes.length - 1]?.value.trim().length ?? 0) > 0;

  // ── Recording ──────────────────────────────────────────────────────────────

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

  // ── Notes ─────────────────────────────────────────────────────────────────

  function updateNote(id: string, value: string) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, value: value.slice(0, MAX_TEXT) } : n)),
    );
  }

  function removeNote(id: string) {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      // Always keep at least one note input
      return next.length > 0 ? next : [{ id: nextId(), value: '' }];
    });
  }

  function addNote() {
    setNotes((prev) => [...prev, { id: nextId(), value: '' }]);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();

      // Append clips in order — durationS immediately after each audio so
      // backend can zip them by index
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
      // Also flush any unsaved text still in an input box
      for (const note of notes) {
        if (!validNotes.find((n) => n.id === note.id) && note.value.trim()) {
          formData.append('text', note.value.trim());
        }
      }

      const { session } = await api.postForm<SubmitResponse>('/v1/dreams', formData);
      // Refresh home screen so the new session appears immediately
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['subscription'] });
      router.replace(`/(app)/(customer)/session/${session.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      Alert.alert('Submission failed', e.message ?? 'Please try again.');
      setIsSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

          {/* ── Voice Recordings ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Voice Recordings{clips.length > 0 ? ` (${clips.length})` : ' (Optional)'}
            </Text>

            {/* Saved clips list */}
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

            {/* Hold-to-record button */}
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

          {/* ── Text Notes ───────────────────────────────────────────────── */}
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
                  placeholderTextColor="#555"
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

        {/* ── Submit Button ─────────────────────────────────────────────── */}
        <View style={styles.submitArea}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <View style={styles.submitRow}>
                <ActivityIndicator color="#fff" />
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
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: { color: '#7C3AED', fontSize: 15 },
  heading: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  placeholder: { width: 60 },
  subtitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 4 },
  content: { padding: 20, gap: 24, paddingBottom: 16 },
  section: { gap: 12 },
  sectionLabel: { color: '#D1D5DB', fontSize: 14, fontWeight: '600' },

  // ── Clips ──────────────────────────────────────────────────────────────────
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E1A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  clipIcon: { fontSize: 16 },
  clipText: { flex: 1, color: '#4ADE80', fontSize: 14, fontWeight: '500' },
  deleteBtn: { padding: 4 },
  deleteText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },

  // ── Record button ──────────────────────────────────────────────────────────
  recordArea: { alignItems: 'center', paddingVertical: 12, gap: 10 },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1F1F33',
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonPressed: { borderColor: '#7C3AED', backgroundColor: '#2D1B69' },
  recordButtonRecording: { borderColor: '#EF4444', backgroundColor: '#3B0F0F' },
  recordingDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EF4444' },
  micIcon: { fontSize: 30 },
  recordHint: { color: '#6B7280', fontSize: 13 },

  // ── Notes ─────────────────────────────────────────────────────────────────
  noteBlock: { gap: 6 },
  noteLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteIndex: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },
  removeNoteText: { color: '#EF4444', fontSize: 12 },
  textArea: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 110,
    borderWidth: 1.5,
    borderColor: '#374151',
  },
  textAreaFocused: { borderColor: '#7C3AED' },
  charCounter: { color: '#4B5563', fontSize: 11, textAlign: 'right' },

  addNoteBtn: {
    borderWidth: 1,
    borderColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addNoteBtnDisabled: { borderColor: '#374151' },
  addNoteBtnText: { color: '#7C3AED', fontSize: 14, fontWeight: '600' },
  addNoteBtnTextDisabled: { color: '#4B5563' },

  // ── Submit ─────────────────────────────────────────────────────────────────
  submitArea: { padding: 20, paddingTop: 8 },
  submitBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#4B5563' },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  submitRow: { flexDirection: 'row', alignItems: 'center' },
});
