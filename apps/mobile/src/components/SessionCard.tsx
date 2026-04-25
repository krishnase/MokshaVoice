import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SessionWithMeta, SessionStatus } from '@mokshavoice/shared-types';
import { Colors } from '@/src/theme';

interface Props {
  session: SessionWithMeta;
  dreamNumber: number;
  onPress: (id: string, title: string) => void;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function lastMessagePreview(session: SessionWithMeta): string {
  if (!session.lastMessage) return 'No messages yet';
  if (session.lastMessage.type === 'VOICE') return '🎙 Voice message';
  return session.lastMessage.content ?? '';
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  NEW: Colors.orange,
  IN_PROGRESS: '#FFB703',
  COMPLETED: '#06D6A0',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  NEW: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export function SessionCard({ session, dreamNumber, onPress }: Props) {
  const statusColor = STATUS_COLORS[session.status];
  const title = `Dream ${dreamNumber} on ${formatDate(session.createdAt)}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(session.id, title)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>
          {STATUS_LABELS[session.status]}
        </Text>
      </View>

      <Text style={styles.title}>{title}</Text>

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
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
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
  title: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  preview: {
    color: Colors.gray3,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: { color: Colors.gray4, fontSize: 12 },
  queuedBadge: {
    backgroundColor: Colors.goldDim,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  queuedText: { color: Colors.gold, fontSize: 11, fontWeight: '600' },
});
