import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme';

interface Props {
  durationS: number;
  isUploading: boolean;
  uploadProgress: number;
  onDiscard: () => void;
  onSend: () => void;
  accentColor?: string;
}

export function RecordingPreview({
  durationS,
  isUploading,
  uploadProgress,
  onDiscard,
  onSend,
  accentColor = Colors.orange,
}: Props) {
  const minutes = Math.floor(durationS / 60);
  const seconds = durationS % 60;
  const duration = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.infoRow}>
        <Text style={styles.micIcon}>🎙</Text>
        <View style={styles.meta}>
          <Text style={styles.label}>Voice message</Text>
          <Text style={styles.duration}>{duration}</Text>
        </View>
      </View>

      {isUploading && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%`, backgroundColor: accentColor }]} />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.discardBtn}
          onPress={onDiscard}
          disabled={isUploading}
        >
          <Text style={[styles.discardText, isUploading && styles.disabledText]}>🗑 Re-record</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: accentColor }, isUploading && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={isUploading}
        >
          {isUploading
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Text style={styles.sendText}>Send ➤</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.gold + '33',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  micIcon: { fontSize: 24 },
  meta: { gap: 2 },
  label: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_500Medium' },
  duration: { color: Colors.white, fontSize: 15, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] },
  progressBar: {
    height: 3,
    backgroundColor: Colors.navyCard,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  discardBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.error + '66',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  discardText: { color: Colors.error, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  disabledText: { opacity: 0.4 },
  sendBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.7 },
  sendText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
