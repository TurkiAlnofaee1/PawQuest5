import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import MapView, { LatLng, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import { useRouter, useLocalSearchParams } from "expo-router";

import AudioBar, { AudioBarHandle } from "../../components/AudioBar";

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

/* -------------------------------------------------------
    UTILS
------------------------------------------------------- */
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

const fmtKm = (m: number) => (m >= 0 ? (m / 1000).toFixed(2) : "0.00");

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => `${n}`.padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
};

/* -------------------------------------------------------
    DISTANCE TRIGGERED STORY
------------------------------------------------------- */
const SEGMENT_DIST = 200;
const THRESHOLDS = Array.from(
  { length: STORY_SEGMENT_COUNT },
  (_, i) => i * SEGMENT_DIST
);

export default function QuickRun() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    story?: string;
    audioUri?: string;
    audioTitle?: string;
  }>();

  /* -------------------------------------------------------
        STORY PAYLOAD (OPTIONAL)
  ------------------------------------------------------- */
  const rawStory =
    typeof params.story === "string" && params.story.length > 0
      ? params.story
      : null;

  const activeStory = useMemo<StorySegments | null>(() => {
    if (!rawStory) return null;
    try {
      const decoded = decodeURIComponent(rawStory);
      const obj = JSON.parse(decoded);
      if (!Array.isArray(obj.segmentUrls) || obj.segmentUrls.length === 0)
        return null;

      return {
        ...obj,
        segmentUrls: obj.segmentUrls.slice(0, STORY_SEGMENT_COUNT),
      };
    } catch (e) {
      console.warn("Invalid story payload");
      return null;
    }
  }, [rawStory]);

  /* -------------------------------------------------------
        AUDIO (FROM QuickChallengeDetails)
  ------------------------------------------------------- */
  const initialUri =
    typeof params.audioUri === "string" ? params.audioUri : "";
  const initialTitle =
    typeof params.audioTitle === "string" ? params.audioTitle : "";

  const [audio, setAudio] = useState(
    initialUri ? { uri: initialUri, title: initialTitle || "Audio" } : null
  );

  const audioRef = useRef<AudioBarHandle>(null);

  /* -------------------------------------------------------
        RUNNING STATE
  ------------------------------------------------------- */
  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(true);
  const mapRef = useRef<MapView | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const [tick, setTick] = useState(0);

  /* -------------------------------------------------------
        STORY SEGMENT AUDIO (Herb of Dawn style)
  ------------------------------------------------------- */
  const [storyStatus, setStoryStatus] = useState(
    activeStory ? "Loading story…" : "No story selected"
  );
  const storySoundsRef = useRef<Audio.Sound[]>([]);
  const currentSegRef = useRef<number | null>(null);
  const triggeredRef = useRef<boolean[]>(Array(STORY_SEGMENT_COUNT).fill(false));

  const elapsed = useMemo(
    () => (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0),
    [startedAt, tick]
  );

  const xp = useMemo(
    () => Math.max(0, Math.floor((getCurrentSessionSteps() ?? 0) / 5)),
    [tick]
  );

  /* -------------------------------------------------------
       STORY AUDIO HELPERS
  ------------------------------------------------------- */
  const stopSeg = useCallback(async () => {
    if (currentSegRef.current === null) return;
    try {
      await storySoundsRef.current[currentSegRef.current]?.stopAsync();
    } catch {}
    currentSegRef.current = null;
  }, []);

  const unloadSegs = useCallback(async () => {
    await Promise.all(
      storySoundsRef.current.map((s) =>
        s.unloadAsync().catch(() => {})
      )
    );
    storySoundsRef.current = [];
  }, []);

  const playSeg = useCallback(async (idx: number) => {
    const snd = storySoundsRef.current[idx];
    if (!snd) return;

    try {
      if (
        currentSegRef.current !== null &&
        currentSegRef.current !== idx
      ) {
        await storySoundsRef.current[currentSegRef.current]?.stopAsync();
      }
      await snd.setPositionAsync(0);
      await snd.playAsync();
      currentSegRef.current = idx;
      triggeredRef.current[idx] = true;
      setStoryStatus(`Segment ${idx + 1} playing`);
    } catch (e) {
      console.warn("Failed to play segment", e);
    }
  }, []);

  /* -------------------------------------------------------
       START TRACKING
  ------------------------------------------------------- */
  const startTracking = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Enable location.");
      return;
    }

    const curr = await Location.getCurrentPositionAsync({});
    const first: LatLng = {
      latitude: curr.coords.latitude,
      longitude: curr.coords.longitude,
    };

    setRegion({
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });

    setPath([first]);
    setStartedAt(Date.now());
    setRunning(true);
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
          if (!Number.isFinite(d) || d < 0.5) return prev;
          setDistanceM((m) => m + d);
          return [...prev, pt];
        });

        mapRef.current?.animateCamera(
          { center: pt, zoom: 16 },
          { duration: 600 }
        );
      }
    );
  }, []);

  /* -------------------------------------------------------
        FINISH RUN
  ------------------------------------------------------- */
  const finishRun = useCallback(async () => {
    setRunning(false);
    try {
      watchRef.current?.remove();
    } catch {}
    watchRef.current = null;

    await stopSeg();
    await unloadSegs();

    // end step session
    let totals = { steps: 0, calories: 0 };
    try {
      totals = await endChallengeSessionAndPersist();
    } catch {}

    const gainedXP = Math.max(0, Math.floor((totals.steps ?? 0) / 5));
    const uid = auth.currentUser?.uid;

    if (uid && gainedXP > 0) {
      await awardPlayerProgress({ uid, xpEarned: gainedXP });
    }
    if (uid && activeStory) {
      try {
        await saveStoryCompletion(uid, activeStory);
      } catch {}
    }

    Alert.alert("Great Job!", `You gained ${gainedXP} XP`, [
      { text: "Home", onPress: () => router.replace("/(tabs)") },
    ]);
  }, [router, activeStory, stopSeg, unloadSegs]);

  /* -------------------------------------------------------
        EFFECTS
  ------------------------------------------------------- */
  // Setup story segments
  useEffect(() => {
    setStoryStatus(activeStory ? "Loading story…" : "No story selected");
  }, [activeStory]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      triggeredRef.current = Array(STORY_SEGMENT_COUNT).fill(false);
      await stopSeg();
      await unloadSegs();

      if (!activeStory) {
        setStoryStatus("No story selected");
        return;
      }

      try {
        const sounds: Audio.Sound[] = [];
        for (const url of activeStory.segmentUrls) {
          const s = new Audio.Sound();
          await s.loadAsync({ uri: url });
          sounds.push(s);
        }

        if (cancelled) {
          sounds.forEach((s) => s.unloadAsync().catch(() => {}));
          return;
        }

        storySoundsRef.current = sounds;
        currentSegRef.current = null;
        setStoryStatus("Ready");
      } catch (e) {
        setStoryStatus("Audio unavailable");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeStory, stopSeg, unloadSegs]);

  // trigger segments
  useEffect(() => {
    if (!running || !activeStory) return;
    if (storySoundsRef.current.length === 0) return;

    THRESHOLDS.forEach((th, idx) => {
      if (distanceM >= th && !triggeredRef.current[idx]) {
        void playSeg(idx);
      }
    });
  }, [distanceM, running, activeStory, playSeg]);

  // start tracking
  useEffect(() => {
    startTracking();
    return () => {
      try {
        watchRef.current?.remove();
      } catch {}
      watchRef.current = null;
      stopSeg();
      unloadSegs();
    };
  }, [startTracking, stopSeg, unloadSegs]);

  // overspeed
  useEffect(() => {
    const off = onChallengeViolation(() => {
      if (!running) return;
      try {
        watchRef.current?.remove();
      } catch {}
      watchRef.current = null;
      setRunning(false);
      stopSeg();
      unloadSegs();
      Alert.alert("Warning", "Using transportation is not allowed.", [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    });

    return () => {
      try {
        off();
      } catch {}
    };
  }, [running, router, stopSeg, unloadSegs]);

  // tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  /* -------------------------------------------------------
        UI
  ------------------------------------------------------- */
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quick Challenge Run</Text>
      </View>

      {/* MAP */}
      <View style={{ flex: 1 }}>
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
              strokeColor="#34A853"
            />
          )}
        </MapView>
      </View>

      {/* AUDIO BAR (if any audio selected) */}
      {audio && (
        <View style={{ paddingHorizontal: 12, marginTop: 6 }}>
          <AudioBar
            ref={audioRef}
            title={audio.title}
            source={{ uri: audio.uri }}
            visible={true}
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
          <Text style={styles.statValue}>{fmtTime(elapsed)}</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>XP</Text>
          <Text style={styles.statValue}>{xp}</Text>
        </View>
      </View>

      {/* STORY STATUS */}
      <View style={styles.storyCard}>
        <Text style={styles.storyLabel}>Story Segments</Text>
        {activeStory ? (
          <>
            <Text style={styles.storyTitle} numberOfLines={1}>
              {activeStory.title}
            </Text>
            <Text style={styles.storyStatus}>{storyStatus}</Text>
            <Text style={styles.storyHint}>0m · 200m · 400m · 600m · 800m</Text>
          </>
        ) : (
          <>
            <Text style={styles.storyStatus}>No story selected</Text>
            <Text style={styles.storyHint}>
              You can still enjoy the main audio.
            </Text>
          </>
        )}
      </View>

      {/* FINISH BUTTON */}
      <Pressable
        onPress={finishRun}
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

/* -------------------------------------------------------
    STYLES
------------------------------------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#000",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },

  map: {
    flex: 1,
  },

  statsCard: {
    flexDirection: "row",
    backgroundColor: "#BEE3BF",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  statBox: { flex: 1, alignItems: "center" },
  statLabel: { fontWeight: "700", color: "#0B3D1F" },
  statValue: {
    fontWeight: "900",
    color: "#0B3D1F",
    fontSize: 18,
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
  storyStatus: {
    color: "#F9FAFB",
    fontSize: 14,
    marginTop: 4,
  },
  storyHint: {
    color: "#D1D5DB",
    fontSize: 12,
    marginTop: 2,
  },

  finishBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 6,
    backgroundColor: "#22C55E",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  finishText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
  },
});
