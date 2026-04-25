import { useEffect, useRef, useMemo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme';

const BAR_COUNT = 20;
const MIN_H = 4;
const MAX_H = 28;

interface Props {
  isActive: boolean;
  color?: string;
  barWidth?: number;
  gap?: number;
}

export function WaveformBars({ isActive, color = Colors.orange, barWidth = 3, gap = 3 }: Props) {
  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_H)),
    [],
  );
  const animationsRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isActive) {
      const animations = bars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 40),
            Animated.timing(bar, {
              toValue: MIN_H + Math.random() * (MAX_H - MIN_H),
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: MIN_H,
              duration: 200 + Math.random() * 200,
              useNativeDriver: false,
            }),
          ]),
        ),
      );
      animationsRef.current = Animated.parallel(animations);
      animationsRef.current.start();
    } else {
      animationsRef.current?.stop();
      bars.forEach((bar) => bar.setValue(MIN_H));
    }
  }, [isActive]);

  return (
    <View style={styles.container}>
      {bars.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              width: barWidth,
              marginHorizontal: gap / 2,
              backgroundColor: color,
              height: anim,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MAX_H,
  },
  bar: {
    borderRadius: 2,
  },
});
