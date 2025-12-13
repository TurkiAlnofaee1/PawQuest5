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

/* ---------------------- UTILITIES ---------------------- */

const configureAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    });
  } catch {}
};

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

const fmtKm = (m: number) => (m / 1000).toFixed(2);
const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const estimateStepsFromMeters = (m: number) => Math.max(0, Math.round(m / 0.8)); // ~1.25 steps per meter

const QUICK_SEG_DIST = 200; // 200m triggers
const QUICK_THRESHOLDS = Array.from(
  { length: STORY_SEGMENT_COUNT },
  (_, i) => i * QUICK_SEG_DIST,
);

/* ---------------------- STORY PAYLOAD ---------------------- */

type QuickStoryPayload = StorySegments & {
  playMode?: "segments" | "single";
};

export default function QuickRun() {
  const router = useRouter();
  const { story: storyParam } = useLocalSearchParams<{ story?: string }>();

  const noAudioMode = storyParam === "NONE";

  /* ---------------------- Decode story ---------------------- */
  const activeStory = useMemo<QuickStoryPayload | null>(() => {
    if (!storyParam || storyParam === "NONE") return null;

    try {
      const decoded = decodeURIComponent(storyParam);
      const payload = JSON.parse(decoded);

      if (!Array.isArray(payload.segmentUrls)) return null;

      return {
        ...payload,
        segmentUrls: payload.segmentUrls.slice(0, STORY_SEGMENT_COUNT),
      };
    } catch {
      return null;
    }
  }, [storyParam]);

  const isSingleAudio = activeStory?.playMode === "single";
  const isEpisodes = activeStory && !isSingleAudio;

  /* ---------------------- State ---------------------- */

  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const watchRef = useRef<any>(null);
  const [tick, setTick] = useState(0);

  const elapsedSec = useMemo(
    () => (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0),
    [startedAt, tick],
  );

  const xp = useMemo(() => {
    const liveSteps = getCurrentSessionSteps();
    const steps = Math.max(liveSteps, estimateStepsFromMeters(distanceM));
    const rawXp = Math.floor(steps / 5);
    return distanceM > 0 && rawXp <= 0 ? 1 : rawXp;
  }, [tick, distanceM]);

  /* ---------------------- Audio ---------------------- */

  const storySoundsRef = useRef<Audio.Sound[]>([]);
  const segTriggeredRef = useRef<boolean[]>(
    Array(STORY_SEGMENT_COUNT).fill(false)
  );
  const currentSegmentRef = useRef<number | null>(null);

  const singleSoundRef = useRef<Audio.Sound | null>(null);
  const audioBarRef = useRef<AudioBarHandle | null>(null);

  const [audioBarVisible, setAudioBarVisible] = useState(false);
  const [audioBarPlaying, setAudioBarPlaying] = useState(false);
  const [audioBarStatus, setAudioBarStatus] = useState("Ready");

  const [storyStatus, setStoryStatus] = useState("Loading…");
  const [storyPlaying, setStoryPlaying] = useState(false);

  const storyDurationLabel = useMemo(() => {
    if (!activeStory) return null;
    const primary =
      typeof activeStory.estimatedTimeMin === "number" && Number.isFinite(activeStory.estimatedTimeMin)
        ? activeStory.estimatedTimeMin
        : typeof activeStory.durationMinutes === "number" && Number.isFinite(activeStory.durationMinutes)
        ? activeStory.durationMinutes
        : null;
    if (primary && primary > 0) return `${Math.round(primary)} min`;
    if (Array.isArray(activeStory.segmentUrls) && activeStory.segmentUrls.length > 0) {
      return `${Math.max(1, Math.round(activeStory.segmentUrls.length * 2))} min`;
    }
    return null;
  }, [activeStory]);

  /* ---------------------- STOP & UNLOAD ---------------------- */

  const stopStory = useCallback(async () => {
    try {
      if (singleSoundRef.current)
        await singleSoundRef.current.stopAsync();

      if (currentSegmentRef.current !== null)
        await storySoundsRef.current[currentSegmentRef.current]?.stopAsync();
    } catch {}
    setStoryPlaying(false);
  }, []);

  const unloadStory = useCallback(async () => {
    try {
      if (singleSoundRef.current)
        await singleSoundRef.current.unloadAsync();
    } catch {}
    singleSoundRef.current = null;

    for (const s of storySoundsRef.current) {
      try {
        await s.unloadAsync();
      } catch {}
    }

    storySoundsRef.current = [];
    currentSegmentRef.current = null;
    setStoryPlaying(false);
  }, []);

  /* ---------------------- LOAD AUDIO ---------------------- */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      segTriggeredRef.current = Array(STORY_SEGMENT_COUNT).fill(false);

      await stopStory();
      await unloadStory();
      await configureAudio();

      setAudioBarVisible(false);
      setAudioBarPlaying(false);

      if (!activeStory) {
        setStoryStatus(noAudioMode ? "No audio" : "No story selected");
        return;
      }

      try {
        /* -------- SINGLE AUDIO -------- */
        if (isSingleAudio) {
          const url = activeStory.segmentUrls[0];
          const s = new Audio.Sound();
          await s.loadAsync({ uri: url });
          try { await s.setVolumeAsync(1); } catch {}
          if (cancelled) return;

          singleSoundRef.current = s;

          s.setOnPlaybackStatusUpdate((st) => {
            if (!st.isLoaded) return;
            setAudioBarPlaying(st.isPlaying);
            if (st.isBuffering) setAudioBarStatus("Buffering…");
            else if (st.isPlaying) setAudioBarStatus("Playing");
            else if (st.didJustFinish) setAudioBarStatus("Finished");
            else setAudioBarStatus("Paused");
          });

          setAudioBarVisible(true);
          setStoryStatus("Ready");
        }

        /* -------- EPISODES MODE -------- */
        else {
          const array: Audio.Sound[] = [];
          for (const [idx, url] of activeStory.segmentUrls.entries()) {
            const s = new Audio.Sound();
            await s.loadAsync({ uri: url });
            try { await s.setVolumeAsync(1); } catch {}
            s.setOnPlaybackStatusUpdate((st) => {
              if (!st.isLoaded) return;
              if (st.isBuffering) setStoryStatus("Buffering…");
              else if (st.isPlaying) {
                setStoryStatus(`Playing segment ${idx + 1}`);
              } else if (st.didJustFinish) {
                setStoryStatus("Finished");
              } else {
                setStoryStatus("Paused");
              }
            });
            array.push(s);
          }
          if (cancelled) return;

          storySoundsRef.current = array;
          setStoryStatus(array.length ? "Ready" : "Audio unavailable");
          if (array.length) {
            segTriggeredRef.current[0] = true;
            void playSegment(0);
          }
        }
      } catch {
        setStoryStatus("Audio unavailable");
      }
    };

    load();
    return () => (cancelled = true);
  }, [activeStory, isSingleAudio, playSegment]);

  /* ---------------------- AUTO PLAY SEGMENT 1 ---------------------- */
  useEffect(() => {
    if (isEpisodes && running && storyStatus === "Ready") {
      if (!segTriggeredRef.current[0] && storySoundsRef.current[0]) {
        segTriggeredRef.current[0] = true;
        void playSegment(0);
      } else if (!storySoundsRef.current[0]) {
        setStoryStatus("Audio unavailable");
      }
    }
  }, [isEpisodes, running, storyStatus, playSegment]);

  const playSegment = useCallback(async (idx: number) => {
    const sound = storySoundsRef.current[idx];
    if (!sound) {
      setStoryStatus("Audio unavailable");
      return;
    }

    try {
      if (
        currentSegmentRef.current !== null &&
        currentSegmentRef.current !== idx
      ) {
        await storySoundsRef.current[currentSegmentRef.current]?.stopAsync();
      }

      await sound.setPositionAsync(0);
      await sound.playAsync();
      currentSegmentRef.current = idx;
      setStoryStatus(`Segment ${idx + 1} playing`);
    } catch {
      setStoryStatus("Audio unavailable");
    }
  }, []);

  const pauseSegments = useCallback(async () => {
    const idx = currentSegmentRef.current;
    if (idx === null) return;
    const sound = storySoundsRef.current[idx];
    if (!sound) return;
    try {
      await sound.pauseAsync();
      setStoryStatus("Paused");
    } catch {}
  }, []);

  /* ---------------------- SEGMENT TRIGGERS ---------------------- */

  useEffect(() => {
    if (!running || !activeStory || isSingleAudio) return;

    const maxSegments = Math.min(
      STORY_SEGMENT_COUNT,
      activeStory.segmentUrls.length,
    );
    for (let idx = 0; idx < maxSegments; idx += 1) {
      const threshold = idx * QUICK_SEG_DIST;
      if (distanceM + 1 >= threshold && !segTriggeredRef.current[idx]) {
        segTriggeredRef.current[idx] = true;
        void playSegment(idx);
      }
    }
  }, [distanceM, activeStory, running, isSingleAudio, playSegment]);

  /* ---------------------- AI Story Toggle ---------------------- */

  const toggleAI = useCallback(async () => {
    const s = singleSoundRef.current;
    if (!s) return;

    const st = await s.getStatusAsync();
    if (!st.isLoaded) return;

    if (st.isPlaying) await s.pauseAsync();
    else await s.playAsync();
  }, []);

  /* ---------------------- START TRACKING ---------------------- */

  const start = useCallback(async () => {
    const { status } =
      await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Enable location to continue");
      return;
    }

    const cur = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const p = {
      latitude: cur.coords.latitude,
      longitude: cur.coords.longitude,
    } as LatLng;

    setRegion({
      latitude: p.latitude,
      longitude: p.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });

    setPath([p]);
    setDistanceM(0);

    segTriggeredRef.current = Array(STORY_SEGMENT_COUNT).fill(false);

    setStartedAt(Date.now());
    setRunning(true);

    await beginChallengeSession();

    /* -------- FIXED DISTANCE TRACKING -------- */
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 3,
        timeInterval: 2000,
      },
      (loc) => {
        const pt: LatLng = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        setPath((prev) => {
          const last = prev[prev.length - 1];
          if (last) {
            const d = haversineM(last, pt);
            if (d > 0.5) {
              setDistanceM((m) => m + d);
            }
          }
          return [...prev, pt];
        });

        mapRef.current?.animateCamera({ center: pt, zoom: 16 });
      },
    );
  }, []);

  useEffect(() => {
    void start();
    return () => {
      watchRef.current?.remove();
      void stopStory();
      void unloadStory();
    };
  }, []);

  /* ---------------------- OVERSPEED ---------------------- */

  useEffect(() => {
    const off = onChallengeViolation(() => {
      watchRef.current?.remove();
      setRunning(false);
      stopStory();
      unloadStory();

      Alert.alert(
        "Warning",
        "Using transportation is not allowed.",
        [{ text: "OK", onPress: () => router.replace("/(tabs)") }],
      );
    });

    return () => off();
  }, []);

  /* ---------------------- TIMER ---------------------- */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  /* ---------------------- FINISH ---------------------- */

  const finish = useCallback(async () => {
    watchRef.current?.remove();
    setRunning(false);

    await stopStory();
    await unloadStory();

    let totals = { steps: 0, calories: 0 };

    try {
      totals = await endChallengeSessionAndPersist();
    } catch {}

    const stepsFromSession = totals.steps ?? 0;
    const stepsLive = getCurrentSessionSteps();
    const stepsEstimate = Math.max(
      stepsFromSession,
      stepsLive,
      estimateStepsFromMeters(distanceM),
    );
    let gainedXp = Math.max(
      xp, // what user saw during the run
      Math.floor(stepsEstimate / 5),
    );
    if ((distanceM > 0 || stepsEstimate > 0) && gainedXp <= 0) gainedXp = 1;

    const uid = auth.currentUser?.uid;
    if (uid && gainedXp > 0) {
      try {
        await awardPlayerProgress({ uid, xpEarned: gainedXp });
      } catch {}
    }

    if (uid && activeStory) {
      try {
        await saveStoryCompletion(uid, activeStory);
      } catch {}
    }

    Alert.alert("Great job!", `You gained ${gainedXp} XP`, [
      { text: "OK", onPress: () => router.replace("/(tabs)") },
    ]);
  }, [activeStory, distanceM, xp, router]);

  /* ---------------------- RENDER ---------------------- */

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Challenge Run</Text>
      </View>

      {/* MAP */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region ?? undefined}
          showsUserLocation
        >
          {path.length > 1 && (
            <Polyline
              strokeWidth={5}
              strokeColor="#2F80ED"
              coordinates={path}
            />
          )}
        </MapView>
      </View>

      {/* AI AUDIOBAR */}
      {isSingleAudio && (
        <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
          <AudioBar
            ref={audioBarRef}
            visible={audioBarVisible}
            title={activeStory?.title ?? "Story"}
            controlledState={{
              isPlaying: audioBarPlaying,
              statusText: audioBarStatus,
              onPlay: toggleAI,
              onPause: toggleAI,
            }}
          />
        </View>
      )}

      {/* STATS */}
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
          <Text style={styles.statValue}>{xp}</Text>
        </View>
      </View>

      {/* EPISODES */}
      {isEpisodes && (
        <View style={styles.storyCard}>
          <Text style={styles.storyLabel}>Story Audio</Text>
          <Text style={styles.storyTitle}>{activeStory?.title}</Text>
          {storyDurationLabel && (
            <Text style={styles.storyMeta}>{storyDurationLabel}</Text>
          )}
          <Text style={styles.storyStatus}>{storyStatus}</Text>
          <Text style={styles.storyHint}>
            0m · 200m · 400m · 600m · 800m
          </Text>
        </View>
      )}

      {/* NO AUDIO */}
      {noAudioMode && !activeStory && (
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#fff", textAlign: "center" }}>
            Walking without audio.
          </Text>
        </View>
      )}

      {/* FINISH BUTTON */}
      <Pressable
        onPress={finish}
        style={({ pressed }) => [
          styles.finishBtn,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.finishText}>Finish</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/* ---------------------- STYLES ---------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { padding: 12, alignItems: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },

  mapWrap: { flex: 1 },
  map: { flex: 1 },

  statsCard: {
    flexDirection: "row",
    backgroundColor: "#BEE3BF",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: { color: "#0B3D1F", fontWeight: "700" },
  statValue: { color: "#0B3D1F", fontWeight: "900", fontSize: 18 },

  storyCard: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 14,
  },
  storyLabel: { color: "#9CA3AF", fontWeight: "700", fontSize: 12 },
  storyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 4 },
  storyMeta: { color: "#D1D5DB", marginTop: 2 },
  storyStatus: { color: "#fff", marginTop: 4 },
  storyHint: { color: "#ccc", marginTop: 4, fontSize: 12 },

  finishBtn: {
    margin: 14,
    backgroundColor: "#22C55E",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  finishText: { color: "#fff", fontSize: 18, fontWeight: "900" },
});
