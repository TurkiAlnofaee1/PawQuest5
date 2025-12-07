// app/ChallengesPages/QuickRun.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { LatLng, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import { useRouter, useLocalSearchParams } from "expo-router";

import { auth } from "@/src/lib/firebase";
import {
  beginChallengeSession,
  endChallengeSessionAndPersist,
  onChallengeViolation,
  getCurrentSessionSteps,
} from "@/src/lib/backgroundTracking";
import { awardPlayerProgress } from "@/src/lib/playerProgress";
import {
  StorySegments,
  STORY_SEGMENT_COUNT,
  saveStoryCompletion,
} from "@/src/lib/stories";

import AudioBar, { AudioBarHandle } from "@/components/AudioBar";

const haversineM = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const fmtKm = (m: number) =>
  m >= 1000 ? (m / 1000).toFixed(2) : (m / 1000).toFixed(2);
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const QUICK_SEGMENT_DISTANCE_M = 200;
const QUICK_SEGMENT_THRESHOLDS = Array.from(
  { length: STORY_SEGMENT_COUNT },
  (_, idx) => idx * QUICK_SEGMENT_DISTANCE_M,
);

// Payload جاي من QuickChallengeDetails
type QuickStoryPayload = StorySegments & {
  playMode?: "segments" | "single";
};

export default function QuickRun() {
  const router = useRouter();
  const { story: storyParamRaw } = useLocalSearchParams<{ story?: string }>();

  const activeStory = useMemo<QuickStoryPayload | null>(() => {
    if (!storyParamRaw || typeof storyParamRaw !== "string" || storyParamRaw.length === 0) {
      return null;
    }
    try {
      const decoded = decodeURIComponent(storyParamRaw);
      const payload = JSON.parse(decoded);
      if (
        !payload ||
        !Array.isArray(payload.segmentUrls) ||
        payload.segmentUrls.length === 0
      ) {
        return null;
      }
      return {
        ...payload,
        segmentUrls: payload.segmentUrls.slice(0, STORY_SEGMENT_COUNT),
      } as QuickStoryPayload;
    } catch (error) {
      console.warn("[QuickRun] invalid story payload", error);
      return null;
    }
  }, [storyParamRaw]);

  const isSingleAudio = activeStory?.playMode === "single";
  const isSegmentsMode = activeStory && !isSingleAudio;

  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [tick, setTick] = useState(0);
  const [storyStatus, setStoryStatus] = useState(
    activeStory ? "Loading story…" : "No story selected",
  );

  // للسقمنت
  const storySoundsRef = useRef<Audio.Sound[]>([]);
  const currentStorySegmentRef = useRef<number | null>(null);
  const triggeredSegmentsRef = useRef<boolean[]>(
    Array(STORY_SEGMENT_COUNT).fill(false),
  );

  // لصوت واحد (AI Story / AI Summary)
  const singleSoundRef = useRef<Audio.Sound | null>(null);
  const audioBarRef = useRef<AudioBarHandle | null>(null);
  const [audioBarVisible, setAudioBarVisible] = useState(false);
  const [audioBarPlaying, setAudioBarPlaying] = useState(false);
  const [audioBarStatus, setAudioBarStatus] = useState("Ready");

  const elapsedSec = useMemo(
    () =>
      startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
    [startedAt, tick],
  );

  // Display XP: 1 XP per 5 steps from session
  const displayedXp = useMemo(
    () => Math.max(0, Math.floor(getCurrentSessionSteps() / 5)),
    [tick],
  );

  useEffect(() => {
    setStoryStatus(activeStory ? "Loading story…" : "No story selected");
  }, [activeStory]);

  const stopCurrentStory = useCallback(async () => {
    try {
      // لصوت واحد
      if (singleSoundRef.current) {
        await singleSoundRef.current.stopAsync();
        await singleSoundRef.current.setPositionAsync(0);
        setAudioBarPlaying(false);
      }
      // للسقمنت
      if (currentStorySegmentRef.current !== null) {
        await storySoundsRef.current[currentStorySegmentRef.current]?.stopAsync();
        currentStorySegmentRef.current = null;
      }
    } catch {
      // ignore
    }
  }, []);

  const unloadStoryAudio = useCallback(async () => {
    // unload single audio
    if (singleSoundRef.current) {
      try {
        await singleSoundRef.current.unloadAsync();
      } catch {}
      singleSoundRef.current = null;
    }

    // unload segments
    await Promise.all(
      storySoundsRef.current.map((sound) =>
        sound
          .unloadAsync()
          .catch(() => {
            /* ignore */
          }),
      ),
    );
    storySoundsRef.current = [];
  }, []);

  // تحميل الصوت حسب الوضع (single / segments)
  useEffect(() => {
    let cancelled = false;

    const loadStory = async () => {
      triggeredSegmentsRef.current = Array(STORY_SEGMENT_COUNT).fill(false);
      await stopCurrentStory();
      await unloadStoryAudio();
      setAudioBarVisible(false);
      setAudioBarPlaying(false);
      setAudioBarStatus("Ready");

      if (!activeStory || !activeStory.segmentUrls?.length) {
        setStoryStatus("No story selected");
        return;
      }

      try {
        if (activeStory.playMode === "single") {
          // 🔹 AI Story / AI Summary: ملف واحد + AudioBar
          const uri = activeStory.segmentUrls[0];
          if (!uri) {
            setStoryStatus("Audio unavailable");
            return;
          }
          const sound = new Audio.Sound();
          await sound.loadAsync({ uri });

          if (cancelled) {
            await sound.unloadAsync().catch(() => {});
            return;
          }

          singleSoundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            setAudioBarPlaying(status.isPlaying);
            if (status.isBuffering) setAudioBarStatus("Buffering…");
            else if (status.isPlaying) setAudioBarStatus("Playing");
            else if (status.didJustFinish) setAudioBarStatus("Finished");
            else setAudioBarStatus("Paused");
          });

          setAudioBarVisible(true);
          setStoryStatus("Ready");
        } else {
          // 🔹 Herb / Story Series: segments على المسافة
          const sounds: Audio.Sound[] = [];
          for (const url of activeStory.segmentUrls.slice(0, STORY_SEGMENT_COUNT)) {
            const sound = new Audio.Sound();
            await sound.loadAsync({ uri: url });
            sounds.push(sound);
          }
          if (cancelled) {
            await Promise.all(
              sounds.map((sound) =>
                sound
                  .unloadAsync()
                  .catch(() => {
                    /* ignore */
                  }),
              ),
            );
            return;
          }
          storySoundsRef.current = sounds;
          currentStorySegmentRef.current = null;
          setStoryStatus("Ready");
        }
      } catch (error) {
        console.warn("[QuickRun] failed to load story audio", error);
        setStoryStatus("Audio unavailable");
      }
    };

    loadStory();
    return () => {
      cancelled = true;
    };
  }, [activeStory, stopCurrentStory, unloadStoryAudio]);

  // تشغيل segment حسب المسافة (فقط لو مو single)
  const playSegmentAtIndex = useCallback(async (idx: number) => {
    const sound = storySoundsRef.current[idx];
    if (!sound) return;
    try {
      if (
        currentStorySegmentRef.current !== null &&
        currentStorySegmentRef.current !== idx
      ) {
        await storySoundsRef.current[
          currentStorySegmentRef.current
        ]?.stopAsync();
      }
      await sound.setPositionAsync(0);
      await sound.playAsync();
      currentStorySegmentRef.current = idx;
      triggeredSegmentsRef.current[idx] = true;
      setStoryStatus(`Segment ${idx + 1} playing`);
    } catch (error) {
      console.warn("[QuickRun] failed to play story segment", error);
    }
  }, []);

  useEffect(() => {
    if (
      !running ||
      !activeStory ||
      activeStory.playMode === "single" ||
      storySoundsRef.current.length === 0
    ) {
      return;
    }
    QUICK_SEGMENT_THRESHOLDS.forEach((threshold, idx) => {
      if (distanceM >= threshold && !triggeredSegmentsRef.current[idx]) {
        void playSegmentAtIndex(idx);
      }
    });
  }, [distanceM, running, activeStory, playSegmentAtIndex]);

  // زر play/pause لـ AI Story / AI Summary (AudioBar controlled)
  const toggleSingleAudio = useCallback(async () => {
    const s = singleSoundRef.current;
    if (!s) return;
    try {
      const status = await s.getStatusAsync();
      if (!status.isLoaded) return;

      if (status.isPlaying) {
        await s.pauseAsync();
        setAudioBarPlaying(false);
        setAudioBarStatus("Paused");
      } else {
        await s.playAsync();
        setAudioBarPlaying(true);
        setAudioBarStatus("Playing");
      }
    } catch (err) {
      console.log("[QuickRun] single audio toggle error:", err);
    }
  }, []);

  const startWatch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location needed", "Enable location to start the quick challenge.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const initial: LatLng = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
    setRegion({
      latitude: initial.latitude,
      longitude: initial.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setPath([initial]);
    setStartedAt(Date.now());
    setRunning(true);

    // start calories/steps session
    void beginChallengeSession();

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 3,
      },
      (loc) => {
        const pt: LatLng = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setPath((prev) => {
          if (prev.length === 0) return [pt];
          const last = prev[prev.length - 1];
          const d = haversineM(last, pt);
          if (!Number.isFinite(d) || d < 0.5) return prev; // ignore tiny jitter
          setDistanceM((m) => m + d);
          return [...prev, pt];
        });
        // keep camera following the user
        mapRef.current?.animateCamera(
          { center: pt, zoom: 16 },
          { duration: 500 },
        );
      },
    );
  }, []);

  useEffect(() => {
    void startWatch();
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      void stopCurrentStory();
      void unloadStoryAudio();
    };
  }, [startWatch, stopCurrentStory, unloadStoryAudio]);

  // Overspeed handler: abort without rewards
  useEffect(() => {
    const off = onChallengeViolation(() => {
      if (!running) return;
      try {
        watchRef.current?.remove();
      } catch {}
      watchRef.current = null;
      setRunning(false);
      void stopCurrentStory();
      void unloadStoryAudio();
      Alert.alert(
        "Warning",
        "Using transportation is not allowed.",
        [{ text: "I understand", onPress: () => router.replace("/(tabs)") }],
        { cancelable: false },
      );
    });
    return () => {
      try {
        off();
      } catch {}
    };
  }, [running, router, stopCurrentStory, unloadStoryAudio]);

  // Tick كل ثانية (عشان التايمر حتى لو ما يتحرك)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const finish = useCallback(async () => {
    if (!running) return;
    watchRef.current?.remove();
    watchRef.current = null;
    setRunning(false);

    await stopCurrentStory();
    await unloadStoryAudio();

    // End background session and persist steps/calories to today; use steps for XP
    let sessionTotals = { steps: 0, calories: 0 };
    try {
      sessionTotals = await endChallengeSessionAndPersist();
    } catch {}

    // 1 XP for each 5 steps
    const xp = Math.max(0, Math.floor((sessionTotals.steps ?? 0) / 5));
    const uid = auth.currentUser?.uid;
    if (uid && xp > 0) {
      try {
        await awardPlayerProgress({ uid, xpEarned: xp });
      } catch (e) {
        // ignore award errors for UX; still show summary
      }
    }
    if (uid && activeStory) {
      try {
        await saveStoryCompletion(uid, activeStory);
      } catch (error) {
        console.warn("[QuickRun] failed to save story completion", error);
      }
    }

    Alert.alert("Great Job!", `You gained ${xp} XP`, [
      { text: "Back to Home", onPress: () => router.replace("/(tabs)") },
    ]);
  }, [activeStory, running, router, stopCurrentStory, unloadStoryAudio]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Challenge Run</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region ?? undefined}
          showsUserLocation
        >
          {path.length > 1 && (
            <Polyline
              coordinates={path}
              strokeWidth={5}
              strokeColor="#2F80ED"
            />
          )}
        </MapView>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{fmtKm(distanceM)} km</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>{fmtTime(elapsedSec)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>XP</Text>
          <Text style={styles.statValue}>{displayedXp}</Text>
        </View>
      </View>

      <View style={styles.storyCard}>
        <Text style={styles.storyLabel}>
          {isSingleAudio ? "Story Audio" : "Story Segments"}
        </Text>
        {activeStory ? (
          <>
            <Text style={styles.storyTitle} numberOfLines={1}>
              {activeStory.title}
            </Text>
            <Text style={styles.storyStatus}>
              {isSingleAudio ? audioBarStatus : storyStatus}
            </Text>
            {isSingleAudio ? (
              <Text style={styles.storyHint}>
                Tap play to listen while you walk.
              </Text>
            ) : (
              <Text style={styles.storyHint}>
                0m · 200m · 400m · 600m · 800m
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.storyStatus}>No story selected</Text>
            <Text style={styles.storyHint}>
              Start walking without audio or go back and choose a story.
            </Text>
          </>
        )}
      </View>

      <Pressable
        onPress={finish}
        style={({ pressed }) => [
          styles.finishBtn,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.finishText}>Finish</Text>
      </Pressable>

      {/* AudioBar فقط لو AI Story / AI Summary */}
      {isSingleAudio && (
        <AudioBar
          ref={audioBarRef}
          title={activeStory?.title ?? "AI Story"}
          visible={audioBarVisible}
          controlledState={{
            isPlaying: audioBarPlaying,
            statusText: audioBarStatus,
            onPlay: toggleSingleAudio,
            onPause: toggleSingleAudio,
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { padding: 12, backgroundColor: "#000", alignItems: "center" },
  title: { color: "#fff", fontWeight: "900", fontSize: 18, textAlign: "center" },

  mapWrap: { flex: 1 },
  map: { flex: 1 },

  statsCard: {
    flexDirection: "row",
    backgroundColor: "#BEE3BF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 10,
  },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: { color: "#0B3D1F", fontWeight: "700" },
  statValue: {
    color: "#0B3D1F",
    fontWeight: "900",
    fontSize: 18,
    marginTop: 2,
  },

  storyCard: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  storyLabel: {
    color: "#9CA3AF",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  storyTitle: {
    color: "#F9FAFB",
    fontWeight: "900",
    fontSize: 16,
    marginTop: 4,
  },
  storyStatus: { color: "#F9FAFB", fontSize: 14, marginTop: 4 },
  storyHint: { color: "#D1D5DB", fontSize: 12, marginTop: 2 },

  finishBtn: {
    backgroundColor: "#22C55E",
    margin: 14,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  finishText: { color: "#fff", fontWeight: "900", fontSize: 18 },
});
