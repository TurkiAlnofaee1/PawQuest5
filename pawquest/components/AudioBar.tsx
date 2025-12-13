import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Audio, AVPlaybackSource, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Ionicons } from "@expo/vector-icons";

export type AudioBarHandle = {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  fadeOut: (ms?: number) => Promise<void>;
};

type Props = {
  title: string;
  source?: AVPlaybackSource; // { uri: string } or require("...mp3")
  visible: boolean;
  controlledState?: {
    isPlaying: boolean;
    statusText?: string;
    onPlay: () => void;
    onPause: () => void;
  };
};

const AudioBar = forwardRef<AudioBarHandle, Props>(
  ({ title, source, visible, controlledState }, ref) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const slideY = useRef(new Animated.Value(80)).current; // slide in/out
  const isControlled = Boolean(controlledState);

  // slide in/out on visible
  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : 80,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, slideY]);

  // Configure audio mode once
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  const loadIfNeeded = async () => {
    if (isControlled || !source) return;
    if (soundRef.current) return;
    const { sound } = await Audio.Sound.createAsync(source, {
      volume: volume,
      shouldPlay: false,
      progressUpdateIntervalMillis: 250,
    });
    soundRef.current = sound;
    setIsLoaded(true);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      setIsPlaying(status.isPlaying);
      // keep local volume state in sync if needed
    });
  };

  const play = async () => {
    if (isControlled && controlledState) {
      controlledState.onPlay();
      return;
    }
    await loadIfNeeded();
    if (!soundRef.current) return;
    await soundRef.current.setVolumeAsync(1);
    setVolume(1);
    await soundRef.current.playAsync();
  };

  const pause = async () => {
    if (isControlled && controlledState) {
      controlledState.onPause();
      return;
    }
    if (!soundRef.current) return;
    await soundRef.current.pauseAsync();
  };

  const fadeOut = async (ms = 1200) => {
    if (isControlled && controlledState) {
      controlledState.onPause();
      return;
    }
    if (!soundRef.current) return;
    try {
      const steps = 12;
      const stepMs = Math.max(30, Math.floor(ms / steps));
      for (let i = steps; i >= 0; i--) {
        const v = i / steps;
        await soundRef.current.setVolumeAsync(v);
        await new Promise((r) => setTimeout(r, stepMs));
      }
      await soundRef.current.stopAsync();
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.setVolumeAsync(1);
      setVolume(1);
    } catch {}
  };

  // expose handle
  useImperativeHandle(ref, () => ({ play, pause, fadeOut }));

  // cleanup
  useEffect(() => {
    return () => {
      (async () => {
        if (soundRef.current) {
          try {
            await soundRef.current.unloadAsync();
          } catch {}
          soundRef.current = null;
        }
      })();
    };
  }, []);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { transform: [{ translateY: slideY }] },
      ]}
    >
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={() =>
            (isControlled ? controlledState?.isPlaying : isPlaying) ? pause() : play()
          }
          style={styles.btn}
          activeOpacity={0.8}
        >
          <Ionicons
            name={(isControlled ? controlledState?.isPlaying : isPlaying) ? "pause" : "play"}
            size={22}
            color="#0B1221"
          />
        </TouchableOpacity>

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {title || "Audio"}
          </Text>
          <Text style={styles.subtitle}>
            {controlledState?.statusText ??
              (isLoaded ? (isPlaying ? "Playing" : "Paused") : "Ready")}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
},
);

export default AudioBar;

// Add a display name for better DevTools and to satisfy eslint/react/display-name
AudioBar.displayName = 'AudioBar';

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#A5D9F6",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#C9ECFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  meta: { flex: 1 },
  title: { color: "#0B1221", fontWeight: "800" },
  subtitle: { color: "#0B1221", opacity: 0.7, fontSize: 12, marginTop: 2 },
});
