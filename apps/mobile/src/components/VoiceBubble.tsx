import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  messageId: string;
  audioUrl: string;
  durationS: number;
  senderName: string | null;
  senderRole?: string;
  isMe: boolean;
  isDreamSubmission: boolean;
  createdAt: string;
  activeMessageId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  onPlay: (messageId: string, url: string) => void;
  onPause: () => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatHHMMSS(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roleColor(role?: string): string {
  if (!role) return '#9B5DE5';
  if (role === 'CUSTOMER') return '#60A5FA';          // blue
  return '#34D399';                                    // green for DECODER/MENTOR/ADMIN
}

export function VoiceBubble({
  messageId,
  audioUrl,
  durationS,
  senderName,
  senderRole,
  isMe,
  isDreamSubmission,
  createdAt,
  activeMessageId,
  isPlaying,
  isLoading,
  positionMs,
  durationMs,
  onPlay,
  onPause,
}: Props) {
  const isActive = activeMessageId === messageId;
  const totalMs = isActive && durationMs > 0 ? durationMs : durationS * 1000;
  const progress = isActive && totalMs > 0 ? positionMs / totalMs : 0;

  const handlePress = () => {
    if (isActive && isPlaying) onPause();
    else onPlay(messageId, audioUrl);
  };

  const bubbleBg = isMe
    ? '#9B5DE5'
    : senderRole === 'CUSTOMER'
      ? '#1E3A5F'   // dark blue for customer
      : '#0F3025';  // dark green for decoder/admin

  const trackBg = isMe ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)';
  const barBg = isMe ? 'rgba(255,255,255,0.85)' : roleColor(senderRole) + 'CC';

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem]}>
      {!isMe && senderName && (
        <Text style={[styles.senderName, { color: roleColor(senderRole) }]}>
          {senderName}
        </Text>
      )}
      {isDreamSubmission && (
        <View style={[styles.dreamBadge, { backgroundColor: '#2A1A5E' }]}>
          <Text style={styles.dreamBadgeText}>Dream Submission</Text>
        </View>
      )}
      <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
        <TouchableOpacity
          onPress={handlePress}
          style={styles.playBtn}
          disabled={isLoading && isActive}
        >
          <Text style={styles.playIcon}>
            {isLoading && isActive ? '⏳' : isActive && isPlaying ? '⏸' : '▶'}
          </Text>
        </TouchableOpacity>

        <View style={styles.right}>
          <View style={[styles.progressTrack, { backgroundColor: trackBg }]}>
            <View style={[styles.progressBar, { width: `${progress * 100}%`, backgroundColor: barBg }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.time}>
              {isActive ? formatTime(positionMs) : formatTime(0)}
            </Text>
            <Text style={styles.time}>{formatTime(totalMs)}</Text>
          </View>
        </View>
      </View>
      <Text style={[styles.timestamp, isMe ? styles.timestampMe : styles.timestampThem]}>
        {formatHHMMSS(createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: '80%', marginVertical: 4 },
  containerMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  containerThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 4 },
  dreamBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  dreamBadgeText: { color: '#9B5DE5', fontSize: 11, fontWeight: '600' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    minWidth: 180,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: { fontSize: 16, color: '#FFF' },
  right: { flex: 1, gap: 4 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  timestamp: { fontSize: 11, color: '#555', marginTop: 2 },
  timestampMe: { marginRight: 4 },
  timestampThem: { marginLeft: 4 },
});
