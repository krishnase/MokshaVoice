import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { VoiceBubble } from '@/src/components/VoiceBubble';
import { TextBubble } from '@/src/components/TextBubble';
import { TypingIndicator } from '@/src/components/TypingIndicator';
import { HoldToRecord } from '@/src/components/HoldToRecord';
import { useMessages } from '@/src/hooks/useMessages';
import { useAudioPlayer } from '@/src/hooks/useAudioPlayer';
import { useAudioUpload } from '@/src/hooks/useAudioUpload';
import { useAuthStore } from '@/src/stores/authStore';
import { getSocket } from '@/src/lib/socket';
import { api } from '@/src/lib/api';
import type { MessageWithSender } from '@mokshavoice/shared-types';
import { Colors } from '@/src/theme';

type SessionStatus = 'NEW' | 'ANALYZER_REVIEW' | 'PENDING_DECODER' | 'IN_PROGRESS' | 'COMPLETED';
type SessionDetail = {
  id: string;
  status: SessionStatus;
  customerId: string;
  analyzerId: string | null;
  analyzer: { id: string; displayName: string | null; phone: string } | null;
  claimedBy: string | null;
  claimedAt: string | null;
};
type DecoderMember = { id: string; phone: string; displayName: string | null; role: string };

const STATUS_COLOR: Record<SessionStatus, string> = {
  NEW: Colors.warning,
  ANALYZER_REVIEW: '#8B5CF6',
  PENDING_DECODER: '#10B981',
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
};
const STATUS_LABEL: Record<SessionStatus, string> = {
  NEW: 'New',
  ANALYZER_REVIEW: 'In Review',
  PENDING_DECODER: 'Sent to Decoder',
  IN_PROGRESS: 'Decoder Working',
  COMPLETED: 'Complete',
};

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 3) + ' ••••• ' + phone.slice(-4);
}

export default function AnalyzerSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(id);
  const audioPlayer = useAudioPlayer();
  const { isRecording, recordingDurationMs, isUploading, startRecording, stopAndUpload, cancelRecording, error: recordingError } = useAudioUpload();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [decoders, setDecoders] = useState<DecoderMember[]>([]);
  const [socketMessages, setSocketMessages] = useState<MessageWithSender[]>([]);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession).catch(() => null);
    api.get<DecoderMember[]>('/v1/analyzer/decoders').then(setDecoders).catch(() => null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit('join:session', { session_id: id });
    socket.on('message:new', ({ message }) => {
      setSocketMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [message, ...prev]);
    });
    socket.on('typing', ({ user_id, is_typing }) => {
      if (user_id === user?.id) return;
      setTypingUserId(is_typing ? user_id : (prev: string | null) => prev === user_id ? null : prev);
    });
    return () => { socket.off('message:new'); socket.off('typing'); };
  }, [id, user?.id]);

  const queryMessages = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const displayMessages = useMemo(() => {
    const allIds = new Set(socketMessages.map((m) => m.id));
    const filteredQuery = queryMessages.filter((m) => !allIds.has(m.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...socketMessages, ...filteredQuery];
  }, [socketMessages, queryMessages]);

  const emitTyping = useCallback((isTyping: boolean) => getSocket().emit('typing', { session_id: id, is_typing: isTyping }), [id]);

  const handleTextChange = (text: string) => {
    setTextInput(text);
    emitTyping(text.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2000);
  };

  const handleClaim = async () => {
    if (isClaiming) return;
    setIsClaiming(true);
    try {
      const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/analyzer-claim`);
      setSession(updated);
      void queryClient.invalidateQueries({ queryKey: ['analyzer-queue'] });
    } catch (err: unknown) {
      Alert.alert('Error', (err as { message?: string }).message ?? 'Could not claim this dream.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleSubmitAnalysis = useCallback(() => {
    const options = ['Send to Decoder Queue', 'Assign to Specific Decoder', 'Cancel'];

    const doSubmit = async (decoderId?: string) => {
      setIsSubmitting(true);
      try {
        const body = decoderId ? { decoderId } : {};
        const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/analyzer-done`, body);
        setSession(updated);
        void queryClient.invalidateQueries({ queryKey: ['analyzer-queue'] });
        void queryClient.invalidateQueries({ queryKey: ['analyzer-mine'] });
      } catch (err: unknown) {
        Alert.alert('Error', (err as { message?: string }).message ?? 'Could not submit analysis.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const showDecoderPicker = () => {
      const labels = decoders.map((d) => d.displayName ?? maskPhone(d.phone));

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, title: 'Assign to Decoder' },
          (index) => { if (index < decoders.length) void doSubmit(decoders[index]!.id); },
        );
      } else {
        Alert.alert('Assign to Decoder', undefined, [
          ...decoders.map((d, i) => ({ text: labels[i]!, onPress: () => void doSubmit(d.id) })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: 'Submit Analysis' },
        (index) => {
          if (index === 0) void doSubmit();
          if (index === 1) showDecoderPicker();
        },
      );
    } else {
      Alert.alert('Submit Analysis', 'Choose how to route this dream to a decoder.', [
        { text: 'Send to Decoder Queue', onPress: () => void doSubmit() },
        { text: 'Assign to Specific Decoder', onPress: showDecoderPicker },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [decoders, id, queryClient]);

  const handleSendText = async () => {
    const content = textInput.trim();
    if (!content || isSending) return;
    setTextInput('');
    emitTyping(false);
    setIsSending(true);
    try {
      await api.post<MessageWithSender>(`/v1/sessions/${id}/messages`, { type: 'TEXT', content });
      void queryClient.invalidateQueries({ queryKey: ['messages', id] });
    } catch { setTextInput(content); }
    finally { setIsSending(false); }
  };

  const handleHoldStart = async () => { await startRecording(); };
  const handleHoldEnd = async () => {
    if (!isRecording) return;
    try {
      const uploaded = await stopAndUpload(id);
      if (!uploaded) return;
      await api.post(`/v1/sessions/${id}/messages`, {
        type: 'VOICE', messageId: uploaded.messageId, audioKey: uploaded.key,
        audioDurationS: uploaded.audioDurationS, isDreamSubmission: false,
      });
    } catch { /* best-effort */ }
    finally { void queryClient.invalidateQueries({ queryKey: ['messages', id] }); }
  };

  const renderItem = useCallback(({ item }: { item: MessageWithSender }) => {
    const isMe = item.senderId === user?.id;
    const senderName = item.sender.displayName ?? (item.sender.role === 'CUSTOMER' ? 'Customer' : item.sender.role === 'ANALYZER' ? 'Analyzer' : 'Decoder');
    const senderRole = item.sender.role;
    if (item.type === 'VOICE') {
      return (
        <VoiceBubble
          messageId={item.id} audioUrl={item.audioUrl ?? ''} durationS={item.audioDurationS ?? 0}
          senderName={senderName} senderRole={senderRole} isMe={isMe}
          isDreamSubmission={item.isDreamSubmission} createdAt={item.createdAt}
          activeMessageId={audioPlayer.currentMessageId} isPlaying={audioPlayer.isPlaying}
          isLoading={audioPlayer.isLoading} positionMs={audioPlayer.positionMs} durationMs={audioPlayer.durationMs}
          onPlay={audioPlayer.play} onPause={audioPlayer.pause}
        />
      );
    }
    if (item.type === 'TEXT') {
      return <TextBubble content={item.content ?? ''} senderName={senderName} senderRole={senderRole} isMe={isMe} createdAt={item.createdAt} />;
    }
    return <TextBubble content={item.content ?? ''} senderName={null} isMe={false} createdAt={item.createdAt} isSystem />;
  }, [user?.id, audioPlayer]);

  const status = session?.status ?? 'NEW';
  const isMySession = session?.analyzerId === user?.id;
  const statusColor = STATUS_COLOR[status];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headingWrap}>
          <Text style={styles.heading} numberOfLines={1}>Dream Analysis</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[status]}</Text>
          </View>
        </View>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.orange} size="large" /></View>
        ) : (
          <FlatList
            data={displayMessages} keyExtractor={(item) => item.id} renderItem={renderItem} inverted
            contentContainerStyle={styles.messageList}
            ListHeaderComponent={typingUserId ? <TypingIndicator /> : null}
            ListFooterComponent={isFetchingNextPage ? <View style={styles.pageLoader}><ActivityIndicator color={Colors.orange} size="small" /></View> : null}
            onEndReached={() => hasNextPage && fetchNextPage()} onEndReachedThreshold={0.3}
          />
        )}

        {/* NEW: claim to start analysis */}
        {status === 'NEW' && (
          <View style={styles.actionArea}>
            <Text style={styles.actionHint}>Claim this dream to begin your analysis</Text>
            <TouchableOpacity
              style={[styles.claimBtn, isClaiming && styles.btnDisabled]}
              onPress={handleClaim}
              disabled={isClaiming}
            >
              {isClaiming
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.claimBtnText}>Claim for Analysis</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ANALYZER_REVIEW: my session — send notes + submit */}
        {status === 'ANALYZER_REVIEW' && isMySession && (
          <View style={styles.inputArea}>
            {recordingError ? <Text style={styles.errorText}>{recordingError}</Text> : null}
            {isRecording ? (
              <HoldToRecord isRecording={isRecording} onHoldStart={handleHoldStart} onHoldEnd={handleHoldEnd} onCancel={() => cancelRecording()} durationMs={recordingDurationMs} />
            ) : (
              <View style={styles.textRow}>
                <HoldToRecord isRecording={false} isDisabled={isUploading || isSending} compact onHoldStart={handleHoldStart} onHoldEnd={handleHoldEnd} onCancel={() => cancelRecording()} durationMs={0} />
                <TextInput
                  style={styles.input}
                  placeholder="Type your analysis notes for the decoder…"
                  placeholderTextColor={Colors.gray4}
                  value={textInput}
                  onChangeText={handleTextChange}
                  multiline
                  maxLength={4000}
                  editable={!isSending && !isUploading}
                />
                {textInput.trim().length > 0 && (
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendText} disabled={isSending}>
                    <Text style={styles.sendIcon}>➤</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              onPress={handleSubmitAnalysis}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.submitBtnText}>✓ Submit Analysis & Route to Decoder</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ANALYZER_REVIEW: someone else's session */}
        {status === 'ANALYZER_REVIEW' && !isMySession && (
          <View style={styles.bannerArea}>
            <Text style={styles.bannerText}>
              Under review by {session?.analyzer?.displayName ?? 'another analyzer'}
            </Text>
          </View>
        )}

        {/* PENDING_DECODER / IN_PROGRESS / COMPLETED */}
        {(status === 'PENDING_DECODER' || status === 'IN_PROGRESS' || status === 'COMPLETED') && (
          <View style={styles.bannerArea}>
            <Text style={[styles.bannerText, status === 'COMPLETED' && { color: '#10B981' }]}>
              {status === 'PENDING_DECODER' ? '⏳ Waiting for a decoder to pick up' : status === 'IN_PROGRESS' ? '🔍 Decoder is working on this' : '✓ Session completed'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.navyCard },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#8B5CF6', fontSize: 15, fontFamily: 'Inter_500Medium' },
  headingWrap: { alignItems: 'center', gap: 4, flex: 1 },
  heading: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  placeholder: { width: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  pageLoader: { paddingVertical: 12, alignItems: 'center' },
  actionArea: { padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: Colors.navyCard, alignItems: 'center' },
  actionHint: { color: Colors.gray3, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  claimBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  claimBtnText: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  btnDisabled: { opacity: 0.5 },
  inputArea: { borderTopWidth: 1, borderTopColor: Colors.navyCard, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, backgroundColor: Colors.navy, gap: 8 },
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: Colors.navyCard, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: Colors.white, fontSize: 15, fontFamily: 'Inter_400Regular', maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  sendIcon: { color: Colors.white, fontSize: 16 },
  submitBtn: { backgroundColor: '#8B5CF6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  errorText: { color: Colors.error, fontSize: 12, fontFamily: 'Inter_400Regular' },
  bannerArea: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.navyCard, alignItems: 'center' },
  bannerText: { color: Colors.gray4, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
});
