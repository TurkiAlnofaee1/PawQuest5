import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const backgroundColours = ['#0C2E16', '#1B5125', '#2F7D32'] as const;

const logoSource = require('../assets/images/PawquestLogo.png');

export default function Splash() {
  const pulse = useSharedValue(0);
  const title = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    title.value = withDelay(250, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    progress.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.linear) }), -1, false);
  }, [pulse, title, progress]);

  const glowStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [1, 1.18]);
    const opacity = interpolate(pulse.value, [0, 1], [0.35, 0.6]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: interpolate(title.value, [0, 1], [12, 0]) }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(title.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(title.value, [0, 1], [18, 0]) }],
  }));

  const meterDotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, 196]) }],
  }));

  return (
    <LinearGradient colors={backgroundColours} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.center}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <View style={styles.logoWrap}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        </View>

        <Animated.View style={[styles.titleWrap, titleStyle]}>
          <Text style={styles.brand}>PawQuest</Text>
          <Animated.Text style={[styles.tagline, taglineStyle]}>Where every walk becomes an adventure</Animated.Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>Preparing your experience</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressDot, meterDotStyle]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 36,
    paddingVertical: 56,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#9FE870',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
  },
  logoWrap: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(22, 61, 33, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  logo: {
    width: 140,
    height: 140,
  },
  titleWrap: {
    marginTop: 32,
    alignItems: 'center',
  },
  brand: {
    fontSize: 36,
    fontWeight: '900',
    color: '#F7FFE6',
    letterSpacing: 1,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    color: 'rgba(247, 255, 230, 0.85)',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: 14,
  },
  hint: {
    color: 'rgba(247, 255, 230, 0.76)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressTrack: {
    width: 220,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F7FFE6',
    shadowColor: '#F7FFE6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    transform: [{ translateY: -10 }],
  },
});
