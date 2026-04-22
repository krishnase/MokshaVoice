import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SessionWithMeta, SessionStatus } from '@mokshavoice/shared-types';

interface Props {
  session: SessionWithMeta;
  onPress: (id: string) => void;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function lastMessagePreview(session: SessionWithMeta): string {
  if (!session.lastMessage) return 'No messages yet';
  if (session.lastMessage.type === 'VOICE') return '🎙 Voice message';
  return session.lastMessage.content ?? '';
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  NEW: '#9B5DE5',
  IN_PROGRESS: '#FFB703',
  COMPLETED: '#06D6A0',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  NEW: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export function SessionCard({ session, onPress }: Props) {
  const statusColor = STATUS_COLORS[session.status];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(session.id)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>
          {STATUS_LABELS[session.status]}
        </Text>
        <Text style={styles.time}>{timeAgo(session.createdAt)}</Text>
      </View>

      <Text style={styles.preview} numberOfLines={2}>
        {lastMessagePreview(session)}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.meta}>{session.messageCount} message{session.messageCount !== 1 ? 's' : ''}</Text>
        {session.priority === 3 && (
          <View style={styles.queuedBadge}>
            <Text style={styles.queuedText}>Queued</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
    color: '#666',
  },
  preview: {
    color: '#CCC',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: { color: '#555', fontSize: 12 },
  queuedBadge: {
    backgroundColor: '#3A2A00',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  queuedText: { color: '#FFB703', fontSize: 11, fontWeight: '600' },
});
