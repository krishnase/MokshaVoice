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

type SessionStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED';
type SessionDetail = {
  id: string;
  status: SessionStatus;
  customerId: string;
  claimedBy: string | null;
  claimedAt: string | null;
  claimer: { id: string; displayName: string | null; phone: string } | null;
};
type TeamMember = {
  id: string;
  phone: string;
  displayName: string | null;
  role: string;
};

const STATUS_COLOR: Record<SessionStatus, string> = {
  NEW: Colors.warning,
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
};
const STATUS_LABEL: Record<SessionStatus, string> = {
  NEW: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Complete',
};

function formatClaimedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function maskPhone(phone: string) {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 3) + ' ••••• ' + phone.slice(-4);
}

export default function DecoderSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useMessages(id);
  const audioPlayer = useAudioPlayer();
  const { isRecording, recordingDurationMs, isUploading, startRecording, stopAndUpload, cancelRecording, error: recordingError } = useAudioUpload();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [socketMessages, setSocketMessages] = useState<MessageWithSender[]>([]);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isUnclaiming, setIsUnclaiming] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession).catch(() => null);
    api.get<TeamMember[]>('/v1/decoder/team').then(setTeam).catch(() => null);
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
      const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/claim`);
      setSession(updated);
      void queryClient.invalidateQueries({ queryKey: ['decoder-queue'] });
    } catch (err: unknown) {
      Alert.alert('Error', (err as { message?: string }).message ?? 'Could not claim this dream.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAssign = useCallback(() => {
    const others = team.filter((m) => m.id !== user?.id);
    const self = team.find((m) => m.id === user?.id);
    const options: TeamMember[] = self ? [self, ...others] : others;
    const labels = options.map((m) =>
      m.id === user?.id
        ? `Claim for myself${m.displayName ? ` (${m.displayName})` : ''}`
        : (m.displayName ?? m.phone)
    );

    const doAssign = async (member: TeamMember) => {
      setIsAssigning(true);
      try {
        const endpoint = member.id === user?.id ? `/v1/sessions/${id}/claim` : `/v1/sessions/${id}/assign`;
        const body = member.id === user?.id ? undefined : { decoderId: member.id };
        const updated = await (body ? api.patch<SessionDetail>(endpoint, body) : api.patch<SessionDetail>(endpoint));
        setSession(updated);
        void queryClient.invalidateQueries({ queryKey: ['decoder-queue'] });
        void queryClient.invalidateQueries({ queryKey: ['decoder-mine'] });
      } catch (err: unknown) {
        Alert.alert('Error', (err as { message?: string }).message ?? 'Could not assign dream.');
      } finally {
        setIsAssigning(false);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, title: 'Assign Dream To' },
        (index) => { if (index < options.length) void doAssign(options[index]!); },
      );
    } else {
      Alert.alert('Assign Dream To', undefined, [
        ...options.map((m, i) => ({ text: labels[i]!, onPress: () => void doAssign(m) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [team, user?.id, id, queryClient]);

  const handleComplete = () => {
    Alert.alert('Mark as Complete', 'The customer will be notified that their dream has been analysed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete', onPress: async () => {
          setIsCompleting(true);
          try {
            const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/complete`);
            setSession(updated);
            void queryClient.invalidateQueries({ queryKey: ['decoder-queue'] });
            void queryClient.invalidateQueries({ queryKey: ['decoder-mine'] });
          } catch (err: unknown) {
            Alert.alert('Error', (err as { message?: string }).message ?? 'Could not complete session.');
          } finally {
            setIsCompleting(false);
          }
        },
      },
    ]);
  };

  const handleReassign = useCallback(() => {
    const others = team.filter((m) => m.id !== user?.id);
    const options = others;
    const labels = options.map((m) => m.displayName ?? maskPhone(m.phone));

    const doReassign = async (member: TeamMember) => {
      try {
        const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/reassign`, { decoderId: member.id });
        setSession(updated);
        void queryClient.invalidateQueries({ queryKey: ['decoder-queue'] });
        void queryClient.invalidateQueries({ queryKey: ['decoder-mine'] });
      } catch (err: unknown) {
        Alert.alert('Error', (err as { message?: string }).message ?? 'Could not reassign.');
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, title: 'Reassign Dream To' },
        (index) => { if (index < options.length) void doReassign(options[index]!); },
      );
    } else {
      Alert.alert('Reassign Dream To', undefined, [
        ...options.map((m, i) => ({ text: labels[i]!, onPress: () => void doReassign(m) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [team, user?.id, id, queryClient]);

  const handleUnclaim = () => {
    Alert.alert('Return to Pending', 'This dream will go back to the queue. Anyone can claim it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Return to Pending',
        style: 'destructive',
        onPress: async () => {
          setIsUnclaiming(true);
          try {
            const updated = await api.patch<SessionDetail>(`/v1/sessions/${id}/unclaim`);
            setSession(updated);
            void queryClient.invalidateQueries({ queryKey: ['decoder-queue'] });
            void queryClient.invalidateQueries({ queryKey: ['decoder-mine'] });
          } catch (err: unknown) {
            Alert.alert('Error', (err as { message?: string }).message ?? 'Could not return to pending.');
          } finally {
            setIsUnclaiming(false);
          }
        },
      },
    ]);
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
    const senderName = item.sender.displayName ?? (item.sender.role === 'CUSTOMER' ? 'Customer' : 'Decoder');
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
  const isMyClaim = session?.claimedBy === user?.id;
  const statusColor = STATUS_COLOR[status];
  const claimerName = session?.claimer
    ? (session.claimer.displayName ?? maskPhone(session.claimer.phone))
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headingWrap}>
          <Text style={styles.heading} numberOfLines={1}>Dream Session</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[status]}</Text>
          </View>
          {session?.claimedAt && claimerName ? (
            <Text style={styles.assignedMeta} numberOfLines={1}>
              {isMyClaim ? 'Claimed' : `Assigned to ${claimerName}`} · {formatClaimedAt(session.claimedAt)}
            </Text>
          ) : null}
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

        {status === 'NEW' && (
          <View style={styles.claimArea}>
            <Text style={styles.claimHint}>Claim or assign this dream to start the analysis</Text>
            <View style={styles.claimRow}>
              <TouchableOpacity
                style={[styles.claimBtn, (isClaiming || isAssigning) && styles.btnDisabled]}
                onPress={handleClaim}
                disabled={isClaiming || isAssigning}
              >
                {isClaiming ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.claimBtnText}>Claim for Myself</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.assignBtn, (isClaiming || isAssigning) && styles.btnDisabled]}
                onPress={handleAssign}
                disabled={isClaiming || isAssigning}
              >
                {isAssigning ? <ActivityIndicator color={Colors.orange} size="small" /> : <Text style={styles.assignBtnText}>Assign to Decoder</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {status === 'IN_PROGRESS' && isMyClaim && (
          <View style={styles.inputArea}>
            {recordingError ? <Text style={styles.errorText}>{recordingError}</Text> : null}
            {isRecording ? (
              <HoldToRecord isRecording={isRecording} onHoldStart={handleHoldStart} onHoldEnd={handleHoldEnd} onCancel={() => cancelRecording()} durationMs={recordingDurationMs} />
            ) : (
              <View style={styles.textRow}>
                <HoldToRecord isRecording={false} isDisabled={isUploading || isSending} compact onHoldStart={handleHoldStart} onHoldEnd={handleHoldEnd} onCancel={() => cancelRecording()} durationMs={0} />
                <TextInput
                  style={styles.input} placeholder="Type your analysis…" placeholderTextColor={Colors.gray4}
                  value={textInput} onChangeText={handleTextChange} multiline maxLength={4000} editable={!isSending && !isUploading}
                />
                {textInput.trim().length > 0 && (
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendText} disabled={isSending}>
                    <Text style={styles.sendIcon}>➤</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TouchableOpacity style={[styles.completeBtn, isCompleting && styles.btnDisabled]} onPress={handleComplete} disabled={isCompleting}>
              {isCompleting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.completeBtnText}>✓ Mark Complete</Text>}
            </TouchableOpacity>
            <View style={styles.mgmtRow}>
              <TouchableOpacity style={styles.mgmtBtn} onPress={handleReassign}>
                <Text style={styles.mgmtBtnText}>⇄ Reassign</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mgmtBtn, styles.mgmtBtnDanger]} onPress={handleUnclaim} disabled={isUnclaiming}>
                {isUnclaiming ? <ActivityIndicator color={Colors.error} size="small" /> : <Text style={[styles.mgmtBtnText, { color: Colors.error }]}>↩ Back to Pending</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {status === 'IN_PROGRESS' && !isMyClaim && (
          <View style={styles.bannerArea}>
            <Text style={styles.bannerText}>
              Claimed by {claimerName ?? 'another decoder'}
            </Text>
            {(user?.role === 'ADMIN' || user?.role === 'MENTOR') && (
              <View style={styles.mgmtRow}>
                <TouchableOpacity style={styles.mgmtBtn} onPress={handleReassign}>
                  <Text style={styles.mgmtBtnText}>⇄ Reassign</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mgmtBtn, styles.mgmtBtnDanger]} onPress={handleUnclaim} disabled={isUnclaiming}>
                  {isUnclaiming ? <ActivityIndicator color={Colors.error} size="small" /> : <Text style={[styles.mgmtBtnText, { color: Colors.error }]}>↩ Back to Pending</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {status === 'COMPLETED' && (
          <View style={styles.bannerArea}><Text style={[styles.bannerText, { color: '#10B981' }]}>✓ Session completed</Text></View>
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
  backText: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_500Medium' },
  headingWrap: { alignItems: 'center', gap: 4, flex: 1 },
  heading: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  assignedMeta: { color: Colors.gray4, fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  placeholder: { width: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  pageLoader: { paddingVertical: 12, alignItems: 'center' },
  claimArea: { padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: Colors.navyCard, alignItems: 'center' },
  claimHint: { color: Colors.gray3, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  claimRow: { flexDirection: 'row', gap: 10, width: '100%' },
  claimBtn: { flex: 1, backgroundColor: Colors.orange, borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: Colors.orange, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  claimBtnText: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  assignBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.orange },
  assignBtnText: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  btnDisabled: { opacity: 0.5 },
  inputArea: { borderTopWidth: 1, borderTopColor: Colors.navyCard, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, backgroundColor: Colors.navy, gap: 8 },
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: Colors.navyCard, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: Colors.white, fontSize: 15, fontFamily: 'Inter_400Regular', maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.orange, justifyContent: 'center', alignItems: 'center' },
  sendIcon: { color: Colors.white, fontSize: 16 },
  completeBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  completeBtnText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  errorText: { color: Colors.error, fontSize: 12, fontFamily: 'Inter_400Regular' },
  bannerArea: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.navyCard, alignItems: 'center', gap: 12 },
  bannerText: { color: Colors.gray4, fontSize: 13, fontFamily: 'Inter_500Medium' },
  mgmtRow: { flexDirection: 'row', gap: 8, width: '100%' },
  mgmtBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.gold + '44' },
  mgmtBtnDanger: { borderColor: Colors.error + '44' },
  mgmtBtnText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
