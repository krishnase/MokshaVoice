import { useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
} from 'react-native';
import { WaveformBars } from './WaveformBars';

interface Props {
  isRecording: boolean;
  isDisabled?: boolean;
  compact?: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onCancel: () => void;
  durationMs?: number;
}

const CANCEL_THRESHOLD = -60;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function HoldToRecord({
  isRecording,
  isDisabled = false,
  compact = false,
  onHoldStart,
  onHoldEnd,
  onCancel,
  durationMs = 0,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const dx = useRef(0);
  const isCancelling = useRef(false);

  const animatePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true }).start();
  }, []);

  const animatePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isDisabled,
      onMoveShouldSetPanResponder: () => !isDisabled,

      onPanResponderGrant: () => {
        dx.current = 0;
        isCancelling.current = false;
        animatePressIn();
        onHoldStart();
      },

      onPanResponderMove: (_, gestureState) => {
        dx.current = gestureState.dx;
        isCancelling.current = gestureState.dx < CANCEL_THRESHOLD;
      },

      onPanResponderRelease: () => {
        animatePressOut();
        if (isCancelling.current) {
          onCancel();
        } else {
          onHoldEnd();
        }
        isCancelling.current = false;
      },

      onPanResponderTerminate: () => {
        animatePressOut();
        onCancel();
        isCancelling.current = false;
      },
    }),
  ).current;

  const showCancel = isRecording && dx.current < CANCEL_THRESHOLD;

  return (
    <View style={styles.wrapper}>
      {isRecording && (
        <View style={styles.recordingHint}>
          {showCancel ? (
            <Text style={styles.cancelHint}>Release to cancel</Text>
          ) : (
            <>
              <WaveformBars isActive={isRecording} />
              <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
            </>
          )}
        </View>
      )}

      {!isRecording && (
        <Text style={styles.hint}>Hold to record</Text>
      )}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.button,
          compact && styles.buttonCompact,
          isRecording && styles.buttonRecording,
          isDisabled && styles.buttonDisabled,
          showCancel && styles.buttonCancel,
          { transform: [{ scale }] },
        ]}
      >
        <Text style={compact ? styles.iconCompact : styles.icon}>
          {isRecording ? '🎙' : '🎤'}
        </Text>
      </Animated.View>

      {isRecording && (
        <Text style={styles.slideHint}>← Slide to cancel</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#9B5DE5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9B5DE5',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  buttonCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowRadius: 6,
  },
  buttonRecording: {
    backgroundColor: '#EF476F',
    shadowColor: '#EF476F',
  },
  buttonDisabled: {
    backgroundColor: '#333',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonCancel: {
    backgroundColor: '#555',
  },
  icon: { fontSize: 32 },
  iconCompact: { fontSize: 18 },
  hint: { color: '#888', fontSize: 13 },
  slideHint: { color: '#555', fontSize: 12 },
  recordingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 32,
  },
  duration: { color: '#EF476F', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cancelHint: { color: '#EF476F', fontSize: 13, fontWeight: '600' },
});
