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
  loadNewAudio: (uri: string) => Promise<void>;   // ✅ ADDED
  stopAudio: () => Promise<void>;                 // ✅ ADDED
};

type Props = {
  title: string;
  source?: AVPlaybackSource;
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
  const slideY = useRef(new Animated.Value(80)).current;
  const isControlled = Boolean(controlledState);

  /* ---------------------- SLIDE IN/OUT ---------------------- */
  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : 80,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  /* ---------------------- AUDIO MODE ---------------------- */
  useEffect(() => {
    Audio.setAudioModeAsync({
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    }).catch(() => {});
  }, []);

  /* ---------------------- LOAD IF NEEDED ---------------------- */
  const loadIfNeeded = async () => {
    if (isControlled || !source) return;
    if (soundRef.current) return;

    const { sound } = await Audio.Sound.createAsync(source, {
      volume,
      shouldPlay: false,
    });

    soundRef.current = sound;
    setIsLoaded(true);

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      setIsPlaying(status.isPlaying);
    });
  };

  /* ---------------------- PLAY ---------------------- */
  const play = async () => {
    if (isControlled && controlledState) return controlledState.onPlay();
    await loadIfNeeded();
    if (!soundRef.current) return;

    await soundRef.current.setVolumeAsync(1);
    setVolume(1);

    await soundRef.current.playAsync();
  };

  /* ---------------------- PAUSE ---------------------- */
  const pause = async () => {
    if (isControlled && controlledState) return controlledState.onPause();
    if (!soundRef.current) return;

    await soundRef.current.pauseAsync();
  };

  /* ---------------------- FADE OUT ---------------------- */
  const fadeOut = async (ms = 1200) => {
    if (!soundRef.current) return;
    try {
      const steps = 12;
      for (let i = steps; i >= 0; i--) {
        await soundRef.current.setVolumeAsync(i / steps);
        await new Promise((r) => setTimeout(r, ms / steps));
      }
      await soundRef.current.stopAsync();
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.setVolumeAsync(1);
    } catch {}
  };

  /* ---------------------- NEW: loadNewAudio(uri) ---------------------- */
  const loadNewAudio = async (uri: string) => {
    try {
      // Stop old
      try { await soundRef.current?.stopAsync(); } catch {}
      try { await soundRef.current?.unloadAsync(); } catch {}

      const s = new Audio.Sound();
      await s.loadAsync({ uri }, { shouldPlay: false });

      soundRef.current = s;
      setIsLoaded(true);
      setIsPlaying(false);

      s.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) setIsPlaying(status.isPlaying);
      });

    } catch (err) {
      console.log("loadNewAudio error:", err);
    }
  };

  /* ---------------------- NEW: stopAudio() ---------------------- */
  const stopAudio = async () => {
    try { await soundRef.current?.stopAsync(); } catch {}
    try { await soundRef.current?.setPositionAsync(0); } catch {}
    setIsPlaying(false);
  };

  /* ---------------------- HANDLE REF ---------------------- */
  useImperativeHandle(ref, () => ({
    play,
    pause,
    fadeOut,
    loadNewAudio,   // ✅ ADDED
    stopAudio,      // ✅ ADDED
  }));

  /* ---------------------- CLEANUP ---------------------- */
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY: slideY }] }]}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={() => ((isControlled ? controlledState?.isPlaying : isPlaying) ? pause() : play())}
          style={styles.btn}
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
});

export default AudioBar;
AudioBar.displayName = "AudioBar";

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
