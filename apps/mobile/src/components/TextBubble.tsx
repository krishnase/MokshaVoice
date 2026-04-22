import { View, Text, StyleSheet } from 'react-native';

interface Props {
  content: string;
  senderName: string | null;
  isMe: boolean;
  createdAt: string;
  isSystem?: boolean;
}

function formatHHMMSS(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TextBubble({ content, senderName, isMe, createdAt, isSystem }: Props) {
  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem]}>
      {!isMe && senderName && (
        <Text style={styles.senderName}>{senderName}</Text>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.content, isMe ? styles.contentMe : styles.contentThem]}>
          {content}
        </Text>
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
  senderName: { color: '#9B5DE5', fontSize: 12, marginBottom: 2, marginLeft: 4 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleMe: { backgroundColor: '#9B5DE5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#2A2A40', borderBottomLeftRadius: 4 },
  content: { fontSize: 15, lineHeight: 22 },
  contentMe: { color: '#FFF' },
  contentThem: { color: '#EEE' },
  timestamp: { fontSize: 11, color: '#555', marginTop: 2 },
  timestampMe: { marginRight: 4 },
  timestampThem: { marginLeft: 4 },
  systemContainer: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    marginVertical: 8,
  },
  systemText: { color: '#666', fontSize: 12 },
});
