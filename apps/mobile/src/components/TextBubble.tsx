import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme';

interface Props {
  content: string;
  senderName: string | null;
  senderRole?: string;
  isMe: boolean;
  createdAt: string;
  isSystem?: boolean;
}

function formatHHMMSS(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roleColor(role?: string): string {
  if (!role) return Colors.orange;
  if (role === 'CUSTOMER') return '#60A5FA';
  return Colors.gold;
}

function roleBubbleBg(role?: string): string {
  if (!role) return Colors.navyCard;
  if (role === 'CUSTOMER') return '#0F2940';
  return '#0A2018';
}

export function TextBubble({ content, senderName, senderRole, isMe, createdAt, isSystem }: Props) {
  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    );
  }

  const bubbleBg = isMe ? Colors.orange : roleBubbleBg(senderRole);
  const nameColor = roleColor(senderRole);

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem]}>
      {!isMe && senderName && (
        <Text style={[styles.senderName, { color: nameColor }]}>{senderName}</Text>
      )}
      <View style={[
        styles.bubble,
        { backgroundColor: bubbleBg },
        isMe ? styles.bubbleMeRadius : styles.bubbleThemRadius,
      ]}>
        <Text style={styles.content}>{content}</Text>
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
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleMeRadius: { borderBottomRightRadius: 4 },
  bubbleThemRadius: { borderBottomLeftRadius: 4 },
  content: { fontSize: 15, lineHeight: 22, color: Colors.white },
  timestamp: { fontSize: 11, color: Colors.gray4, marginTop: 2 },
  timestampMe: { marginRight: 4 },
  timestampThem: { marginLeft: 4 },
  systemContainer: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.navyCard,
    borderRadius: 12,
    marginVertical: 8,
  },
  systemText: { color: Colors.gray4, fontSize: 12 },
});
