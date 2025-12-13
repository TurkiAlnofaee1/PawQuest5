import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
};

export default function Entrance({ children, style, duration = 450 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // progress is a reanimated shared value (stable reference); only re-run when duration changes
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [duration]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return (
    // ensure the animated wrapper fills the screen so children (Stack) can layout
    <Animated.View style={[{ flex: 1 }, aStyle, style as any]}>
      {children}
    </Animated.View>
  );
}
