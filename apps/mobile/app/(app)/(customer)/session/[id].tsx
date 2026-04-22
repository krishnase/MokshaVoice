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

export default function SessionChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(id);
  const audioPlayer = useAudioPlayer();
  const {
    isRecording,
    recordingDurationMs,
    isUploading,
    startRecording,
    stopAndUpload,
    cancelRecording,
  } = useAudioUpload();

  const [socketMessages, setSocketMessages] = useState<MessageWithSender[]>([]);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Join socket room on mount
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();
    socket.emit('join:session', { session_id: id });

    socket.on('message:new', ({ message }) => {
      setSocketMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [message, ...prev];
      });
    });

    socket.on('typing', ({ user_id, is_typing }) => {
      if (user_id === user?.id) return;
      if (is_typing) {
        setTypingUserId(user_id);
      } else {
        setTypingUserId((prev) => (prev === user_id ? null : prev));
      }
    });

    return () => {
      socket.off('message:new');
      socket.off('typing');
    };
  }, [id, user?.id]);

  // All query messages, oldest-first across pages
  const queryMessages = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  // Merged display list: newest first (for inverted FlatList)
  const displayMessages = useMemo(() => {
    const allIds = new Set(socketMessages.map((m) => m.id));
    const filtered = queryMessages.filter((m) => !allIds.has(m.id));
    // socketMessages is newest-first, queryMessages is oldest-first
    // Combine: socket (newest) + reverse(query) = newest first overall
    return [...socketMessages, ...filtered.slice().reverse()];
  }, [socketMessages, queryMessages]);

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      getSocket().emit('typing', { session_id: id, is_typing: isTyping });
    },
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
      await api.post<MessageWithSender>(`/v1/sessions/${id}/messages`, {
        type: 'TEXT',
        content,
      });
      // Optimistic update is handled by socket; invalidate query to sync
    } catch {
      setTextInput(content); // restore on failure
    } finally {
      setIsSending(false);
    }
  };

  const handleHoldStart = async () => {
    await startRecording();
  };

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
    } catch {
      // Socket will deliver the message if it succeeded
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: MessageWithSender }) => {
      const isMe = item.senderId === user?.id;
      const senderName = item.sender.displayName;

      if (item.type === 'VOICE') {
        return (
          <VoiceBubble
            messageId={item.id}
            audioUrl={item.audioUrl ?? ''}
            durationS={item.audioDurationS ?? 0}
            senderName={senderName}
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
            isMe={isMe}
            createdAt={item.createdAt}
          />
        );
      }

      return (
        <TextBubble
          content={item.content ?? ''}
          senderName={null}
          isMe={false}
          createdAt={item.createdAt}
          isSystem
        />
      );
    },
    [user?.id, audioPlayer],
  );

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.pageLoader}>
        <ActivityIndicator color="#9B5DE5" size="small" />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading} numberOfLines={1}>
          Dream Session
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#9B5DE5" size="large" />
          </View>
        ) : (
          <FlatList
            data={displayMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.messageList}
            ListHeaderComponent={typingUserId ? <TypingIndicator /> : null}
            ListFooterComponent={renderFooter}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
          />
        )}

        <View style={styles.inputArea}>
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
                isDisabled={isUploading || isSending}
                compact
                onHoldStart={handleHoldStart}
                onHoldEnd={handleHoldEnd}
                onCancel={() => cancelRecording()}
                durationMs={0}
              />
              <TextInput
                style={styles.input}
                placeholder="Type a message…"
                placeholderTextColor="#555"
                value={textInput}
                onChangeText={handleTextChange}
                multiline
                maxLength={4000}
                editable={!isSending && !isUploading}
              />
              {textInput.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={handleSendText}
                  disabled={isSending}
                >
                  <Text style={styles.sendIcon}>➤</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#9B5DE5', fontSize: 15 },
  heading: { color: '#FFF', fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  placeholder: { width: 60 },
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
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
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
});
