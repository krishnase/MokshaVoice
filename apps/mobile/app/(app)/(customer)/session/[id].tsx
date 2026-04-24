import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
import type { MessageWithSender, SessionStatus } from '@mokshavoice/shared-types';

type SessionDetail = {
  id: string;
  status: SessionStatus;
  claimedBy: string | null;
  claimer: { id: string; displayName: string | null; phone: string } | null;
};

const STATUS_BAR: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  NEW:         { label: 'Waiting for a decoder…',        color: '#F59E0B', bg: '#78350F18' },
  IN_PROGRESS: { label: 'Your decoder is working on this', color: '#3B82F6', bg: '#1E3A5F18' },
  COMPLETED:   { label: '✓ Analysis complete',            color: '#10B981', bg: '#06402418' },
};

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 3) + ' ••••• ' + phone.slice(-4);
}

export default function SessionChat() {
  const { id, sessionTitle } = useLocalSearchParams<{ id: string; sessionTitle: string }>();
  const heading = sessionTitle ? decodeURIComponent(sessionTitle) : 'Dream Session';
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(id);
  const audioPlayer = useAudioPlayer();
  const {
    isRecording,
    recordingDurationMs,
    isUploading,
    startRecording,
    stopAndUpload,
    cancelRecording,
    error: recordingError,
  } = useAudioUpload();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [socketMessages, setSocketMessages] = useState<MessageWithSender[]>([]);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load session status
  useEffect(() => {
    if (!id) return;
    api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession).catch(() => null);
  }, [id]);

  // Join socket room + listen for messages and status changes
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit('join:session', { session_id: id });

    socket.on('message:new', ({ message }) => {
      setSocketMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [message, ...prev];
      });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    });

    socket.on('session:status', ({ session_id, status, claimed_by }) => {
      if (session_id !== id) return;
      setSession((prev) => prev ? { ...prev, status, claimedBy: claimed_by } : prev);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    });

    socket.on('typing', ({ user_id, is_typing }) => {
      if (user_id === user?.id) return;
      setTypingUserId(is_typing ? user_id : (prev) => prev === user_id ? null : prev);
    });

    return () => {
      socket.off('message:new');
      socket.off('session:status');
      socket.off('typing');
    };
  }, [id, user?.id]);

  const queryMessages = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const displayMessages = useMemo(() => {
    const allIds = new Set(socketMessages.map((m) => m.id));
    const filteredQuery = queryMessages
      .filter((m) => !allIds.has(m.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...socketMessages, ...filteredQuery];
  }, [socketMessages, queryMessages]);

  const emitTyping = useCallback(
    (isTyping: boolean) => getSocket().emit('typing', { session_id: id, is_typing: isTyping }),
    [id],
  );

  const handleTextChange = (text: string) => {
    setTextInput(text);
    emitTyping(text.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2000);
  };

  const handleSendText = async () => {
    const content = textInput.trim();
    if (!content || isSending) return;
    setTextInput('');
    emitTyping(false);
    setIsSending(true);
    try {
      await api.post<MessageWithSender>(`/v1/sessions/${id}/messages`, { type: 'TEXT', content });
      void queryClient.invalidateQueries({ queryKey: ['messages', id] });
    } catch {
      setTextInput(content);
    } finally {
      setIsSending(false);
    }
  };

  const handleHoldStart = async () => { await startRecording(); };

  const handleHoldEnd = async () => {
    if (!isRecording) return;
    try {
      const uploaded = await stopAndUpload(id);
      if (!uploaded) return;
      await api.post(`/v1/sessions/${id}/messages`, {
        type: 'VOICE',
        messageId: uploaded.messageId,
        audioKey: uploaded.key,
        audioDurationS: uploaded.audioDurationS,
        isDreamSubmission: false,
      });
    } catch { /* best-effort */ }
    finally { void queryClient.invalidateQueries({ queryKey: ['messages', id] }); }
  };

  const renderItem = useCallback(
    ({ item }: { item: MessageWithSender }) => {
      const isMe = item.senderId === user?.id;
      const senderRole = item.sender.role;
      const senderName = isMe
        ? null
        : (item.sender.displayName ?? (senderRole === 'CUSTOMER' ? 'Customer' : 'Decoder'));

      if (item.type === 'VOICE') {
        return (
          <VoiceBubble
            messageId={item.id}
            audioUrl={item.audioUrl ?? ''}
            durationS={item.audioDurationS ?? 0}
            senderName={senderName}
            senderRole={senderRole}
            isMe={isMe}
            isDreamSubmission={item.isDreamSubmission}
            createdAt={item.createdAt}
            activeMessageId={audioPlayer.currentMessageId}
            isPlaying={audioPlayer.isPlaying}
            isLoading={audioPlayer.isLoading}
            positionMs={audioPlayer.positionMs}
            durationMs={audioPlayer.durationMs}
            onPlay={audioPlayer.play}
            onPause={audioPlayer.pause}
          />
        );
      }
      if (item.type === 'TEXT') {
        return (
          <TextBubble
            content={item.content ?? ''}
            senderName={senderName}
            senderRole={senderRole}
            isMe={isMe}
            createdAt={item.createdAt}
          />
        );
      }
      return (
        <TextBubble content={item.content ?? ''} senderName={null} isMe={false} createdAt={item.createdAt} isSystem />
      );
    },
    [user?.id, audioPlayer],
  );

  const status = session?.status ?? 'NEW';
  const isCompleted = status === 'COMPLETED';
  const inputDisabled = isCompleted || isSending || isUploading;
  const statusMeta = STATUS_BAR[status];
  const decoderName = session?.claimer?.displayName ?? (session?.claimer ? maskPhone(session.claimer.phone) : null);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading} numberOfLines={1}>{heading}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Status banner */}
      <View style={[styles.statusBar, { backgroundColor: statusMeta.bg, borderBottomColor: statusMeta.color + '44' }]}>
        <Text style={[styles.statusLabel, { color: statusMeta.color }]}>
          {statusMeta.label}
          {decoderName && status !== 'NEW' ? ` · ${decoderName}` : ''}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color="#9B5DE5" size="large" /></View>
        ) : (
          <FlatList
            data={displayMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.messageList}
            ListHeaderComponent={typingUserId ? <TypingIndicator /> : null}
            ListFooterComponent={isFetchingNextPage ? <View style={styles.pageLoader}><ActivityIndicator color="#9B5DE5" size="small" /></View> : null}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
          />
        )}

        {isCompleted ? (
          <View style={styles.completedBanner}>
            <Text style={styles.completedText}>✓ This session is complete. You can still review the conversation above.</Text>
          </View>
        ) : (
          <View style={styles.inputArea}>
            {recordingError ? <Text style={styles.recordingError}>{recordingError}</Text> : null}
            {isRecording ? (
              <HoldToRecord
                isRecording={isRecording}
                onHoldStart={handleHoldStart}
                onHoldEnd={handleHoldEnd}
                onCancel={() => cancelRecording()}
                durationMs={recordingDurationMs}
              />
            ) : (
              <View style={styles.textRow}>
                <HoldToRecord
                  isRecording={false}
                  isDisabled={inputDisabled}
                  compact
                  onHoldStart={handleHoldStart}
                  onHoldEnd={handleHoldEnd}
                  onCancel={() => cancelRecording()}
                  durationMs={0}
                />
                <TextInput
                  style={styles.input}
                  placeholder={status === 'NEW' ? 'Waiting for a decoder to join…' : 'Reply to your decoder…'}
                  placeholderTextColor="#555"
                  value={textInput}
                  onChangeText={handleTextChange}
                  multiline
                  maxLength={4000}
                  editable={!inputDisabled}
                />
                {textInput.trim().length > 0 && (
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendText} disabled={isSending}>
                    <Text style={styles.sendIcon}>➤</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#9B5DE5', fontSize: 15 },
  heading: { color: '#FFF', fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'center' },
  placeholder: { width: 60 },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  statusLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  pageLoader: { paddingVertical: 12, alignItems: 'center' },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0D0D0D',
  },
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9B5DE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: { color: '#FFF', fontSize: 16 },
  recordingError: { color: '#EF4444', fontSize: 12, paddingBottom: 4, paddingHorizontal: 4 },
  completedBanner: {
    borderTopWidth: 1,
    borderTopColor: '#10B981' + '44',
    backgroundColor: '#06402418',
    padding: 16,
    alignItems: 'center',
  },
  completedText: { color: '#10B981', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
