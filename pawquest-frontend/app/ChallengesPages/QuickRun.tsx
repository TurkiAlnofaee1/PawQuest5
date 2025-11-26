import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";
import MapView, { LatLng, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import { useRouter, useLocalSearchParams } from "expo-router";

import AudioBar, { AudioBarHandle } from "../../components/AudioBar";
import { db } from "../../src/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

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

// Utility functions
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
  m >= 0 ? (m / 1000).toFixed(2) : "0.00";

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const QUICK_SEGMENT_DISTANCE_M = 200;
const QUICK_SEGMENT_THRESHOLDS = Array.from(
  { length: STORY_SEGMENT_COUNT },
  (_, idx) => idx * QUICK_SEGMENT_DISTANCE_M,
);

export default function QuickRun() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    story?: string;
    audioUri?: string;
    audioTitle?: string;
  }>();

  const storyParamRaw =
    typeof params.story === "string" && params.story.length > 0
      ? params.story
      : undefined;

  const activeStory = useMemo<StorySegments | null>(() => {
    if (!storyParamRaw) return null;
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
      } as StorySegments;
    } catch (error) {
      console.warn("[QuickRun] invalid story payload", error);
      return null;
    }
  }, [storyParamRaw]);

  const initialAudioUri =
    typeof params.audioUri === "string" ? params.audioUri : "";
  const initialAudioTitle =
    typeof params.audioTitle === "string" ? params.audioTitle : "";

  const [audio, setAudio] = useState<
    { uri: string; title: string } | null
  >(
    initialAudioUri
      ? { uri: initialAudioUri, title: initialAudioTitle }
      : null,
  );

  const audioRef = useRef<AudioBarHandle>(null);

  // ░░░ RUNNING STATE ░░░
  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(true);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [tick, setTick] = useState(0);

  const [storyStatus, setStoryStatus] = useState(
    activeStory ? "Loading story…" : "No story selected",
  );
  const storySoundsRef = useRef<Audio.Sound[]>([]);
  const currentStorySegmentRef = useRef<number | null>(null);
  const triggeredSegmentsRef = useRef<boolean[]>(
    Array(STORY_SEGMENT_COUNT).fill(false),
  );

  const elapsedSec = useMemo(
    () =>
      startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    [startedAt, tick],
  );

  // Display XP from current background session: 1 XP per 5 steps
  const displayedXp = useMemo(
    () =>
      Math.max(0, Math.floor((getCurrentSessionSteps() ?? 0) / 5)),
    [tick],
  );

  // ░░░ STORY AUDIO HELPERS ░░░
  const stopCurrentStory = useCallback(async () => {
    if (currentStorySegmentRef.current === null) return;
    try {
      await storySoundsRef.current[
        currentStorySegmentRef.current
      ]?.stopAsync();
    } catch {
      // ignore
    }
    currentStorySegmentRef.current = null;
  }, []);

  const unloadStoryAudio = useCallback(async () => {
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

  const playSegmentAtIndex = useCallback(
    async (idx: number) => {
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
    },
    [],
  );

  // ░░░ START LOCATION TRACKING ░░░
  const startTracking = useCallback(async () => {
    const { status } =
      await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable location to start the run.",
      );
      return;
    }

    const curr = await Location.getCurrentPositionAsync({});
    const initial: LatLng = {
      latitude: curr.coords.latitude,
      longitude: curr.coords.longitude,
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

    // start steps/calories background session
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
          { duration: 600 },
        );
      },
    );
  }, []);

  // ░░░ FINISH RUN ░░░
  const finishRun = useCallback(async () => {
    setRunning(false);
    try {
      watchRef.current?.remove();
    } catch {}
    watchRef.current = null;

    await stopCurrentStory();
    await unloadStoryAudio();

    // End background session and persist steps/calories; use steps for XP
    let sessionTotals = { steps: 0, calories: 0 };
    try {
      sessionTotals = await endChallengeSessionAndPersist();
    } catch {}

    const xp = Math.max(
      0,
      Math.floor((sessionTotals.steps ?? 0) / 5),
    );

    const uid = auth.currentUser?.uid;
    if (uid && xp > 0) {
      await awardPlayerProgress({ uid, xpEarned: xp });
    }
    if (uid && activeStory) {
      try {
        await saveStoryCompletion(uid, activeStory);
      } catch (error) {
        console.warn(
          "[QuickRun] failed to save story completion",
          error,
        );
      }
    }

    Alert.alert("Great Job!", `You gained ${xp} XP`, [
      { text: "Home", onPress: () => router.replace("/(tabs)") },
    ]);
  }, [activeStory, router, stopCurrentStory, unloadStoryAudio]);

  // ░░░ CHANGE AUDIO MODAL ░░░
  const [audioModal, setAudioModal] = useState(false);
  const [storySeriesList, setStorySeriesList] = useState<any[]>([]);
  const [storiesList, setStoriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ░░░ LOAD AUDIO OPTIONS ░░░
  const loadAudioSources = useCallback(async () => {
    try {
      setLoading(true);

      // Load Story Series audios
      const docRef = doc(db, "Story Series", "The herb of dawn");
      const snap = await getDoc(docRef);

      const seriesAudio: any[] = [];

      if (snap.exists()) {
        const data = snap.data() as Record<string, string[]>;
        Object.keys(data).forEach((episode) => {
          const arr = data[episode];
          if (Array.isArray(arr)) {
            arr.forEach((mp3: string, index: number) => {
              if (typeof mp3 === "string" && mp3.length > 0) {
                seriesAudio.push({
                  id: `${episode}-${index}`,
                  title: `${episode} • Part ${index + 1}`,
                  uri: mp3,
                });
              }
            });
          }
        });
      }

      setStorySeriesList(seriesAudio);

      // Load "stories" collection
      const storiesSnap = await getDocs(collection(db, "stories"));
      const stories: any[] = [];

      storiesSnap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        if (d.audioUrl) {
          stories.push({
            id: docSnap.id,
            title: d.title || "Story",
            uri: d.audioUrl,
          });
        }
      });

      setStoriesList(stories);
    } catch (err) {
      console.log("Audio load error:", err);
    }

    setLoading(false);
  }, []);

  const applyAudio = (track: any) => {
    setAudio(track);
    audioRef.current?.loadNewAudio(track.uri);
  };

  // ░░░ EFFECTS ░░░

  // Story label text when activeStory changes
  useEffect(() => {
    setStoryStatus(
      activeStory ? "Loading story…" : "No story selected",
    );
  }, [activeStory]);

  // Load story audio segments when activeStory changes
  useEffect(() => {
    let cancelled = false;

    const loadStory = async () => {
      triggeredSegmentsRef.current = Array(
        STORY_SEGMENT_COUNT,
      ).fill(false);
      await stopCurrentStory();
      await unloadStoryAudio();

      if (
        !activeStory ||
        !Array.isArray(activeStory.segmentUrls) ||
        activeStory.segmentUrls.length === 0
      ) {
        setStoryStatus("No story selected");
        return;
      }

      try {
        const sounds: Audio.Sound[] = [];
        for (const url of activeStory.segmentUrls.slice(
          0,
          STORY_SEGMENT_COUNT,
        )) {
          const sound = new Audio.Sound();
          await sound.loadAsync({ uri: url });
          sounds.push(sound);
        }

        if (cancelled) {
          await Promise.all(
            sounds.map((s) =>
              s
                .unloadAsync()
                .catch(() => {
                  /* ignore */
                }),
          );
          return;
        }

        storySoundsRef.current = sounds;
        currentStorySegmentRef.current = null;
        setStoryStatus("Ready");
      } catch (error) {
        console.warn(
          "[QuickRun] failed to load story audio",
          error,
        );
        setStoryStatus("Audio unavailable");
      }
    };

    void loadStory();

    return () => {
      cancelled = true;
    };
  }, [activeStory, stopCurrentStory, unloadStoryAudio]);

  // Trigger story segments based on distance
  useEffect(() => {
    if (!running || !activeStory) return;
    if (storySoundsRef.current.length === 0) return;

    QUICK_SEGMENT_THRESHOLDS.forEach((threshold, idx) => {
      if (
        distanceM >= threshold &&
        !triggeredSegmentsRef.current[idx]
      ) {
        void playSegmentAtIndex(idx);
      }
    });
  }, [distanceM, running, activeStory, playSegmentAtIndex]);

  // Start tracking on mount + cleanup on unmount
  useEffect(() => {
    void startTracking();
    return () => {
      try {
        watchRef.current?.remove();
      } catch {}
      watchRef.current = null;
      void stopCurrentStory();
      void unloadStoryAudio();
    };
  }, [startTracking, stopCurrentStory, unloadStoryAudio]);

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
        [
          {
            text: "I understand",
            onPress: () => router.replace("/(tabs)"),
          },
        ],
        { cancelable: false },
      );
    });

    return () => {
      try {
        off();
      } catch {}
    };
  }, [running, router, stopCurrentStory, unloadStoryAudio]);

  // Tick every second for timer + XP display
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setTick((t) => t + 1),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);

  // ░░░ UI ░░░
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quick Challenge Run</Text>

        <Pressable
          style={styles.changeAudioBtn}
          onPress={() => {
            loadAudioSources();
            setAudioModal(true);
          }}
        >
          <Text style={styles.changeAudioText}>
            Change Audio 🎵
          </Text>
        </Pressable>
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

      {/* AUDIO BAR ABOVE STATS */}
      {audio && (
        <View
          style={{ paddingHorizontal: 12, marginTop: 6 }}
        >
          <AudioBar
            ref={audioRef}
            title={audio.title}
            source={{ uri: audio.uri }}
            visible
          />
        </View>
      )}

      {/* STATS */}
      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>
            {fmtKm(distanceM)} km
          </Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>
            {fmtTime(elapsedSec)}
          </Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>XP</Text>
          <Text style={styles.statValue}>{displayedXp}</Text>
        </View>
      </View>

      {/* STORY STATUS */}
      <View style={styles.storyCard}>
        <Text style={styles.storyLabel}>Story Segments</Text>
        {activeStory ? (
          <>
            <Text
              style={styles.storyTitle}
              numberOfLines={1}
            >
              {activeStory.title}
            </Text>
            <Text style={styles.storyStatus}>
              {storyStatus}
            </Text>
            <Text style={styles.storyHint}>
              0m · 200m · 400m · 600m · 800m
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.storyStatus}>
              No story selected
            </Text>
            <Text style={styles.storyHint}>
              Pick a story before starting to hear
              audio.
            </Text>
          </>
        )}
      </View>

      {/* FINISH */}
      <Pressable
        onPress={finishRun}
        style={({ pressed }) => [
          styles.finishBtn,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.finishText}>Finish</Text>
      </Pressable>

      {/* AUDIO PICKER MODAL */}
      <Modal
        visible={audioModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              Change Audio
            </Text>

            {loading && <Text>Loading...</Text>}

            {!loading && (
              <>
                {/* STORY SERIES */}
                <Text style={styles.sectionTitle}>
                  Story Series
                </Text>
                <FlatList
                  data={storySeriesList}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.audioOption}
                      onPress={() => {
                        applyAudio(item);
                        setAudioModal(false);
                      }}
                    >
                      <Text
                        style={styles.audioOptionText}
                      >
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  )}
                />

                {/* STORIES */}
                <Text style={styles.sectionTitle}>
                  Stories
                </Text>
                <FlatList
                  data={storiesList}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.audioOption}
                      onPress={() => {
                        applyAudio(item);
                        setAudioModal(false);
                      }}
                    >
                      <Text
                        style={styles.audioOptionText}
                      >
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  )}
                />

                {/* NO AUDIO */}
                <TouchableOpacity
                  style={[
                    styles.audioOption,
                    { backgroundColor: "#fee" },
                  ]}
                  onPress={() => {
                    setAudio(null);
                    audioRef.current?.stopAudio();
                    setAudioModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.audioOptionText,
                      { color: "red" },
                    ]}
                  >
                    No Audio
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Pressable
              onPress={() => setAudioModal(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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

  changeAudioBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#34A853",
    borderRadius: 10,
  },
  changeAudioText: { color: "#fff", fontWeight: "800" },

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

  modalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: {
    backgroundColor: "white",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
  },
  modalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 10 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },

  audioOption: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  audioOptionText: { fontSize: 15, fontWeight: "700" },

  closeBtn: {
    marginTop: 16,
    backgroundColor: "#ddd",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  closeText: { fontSize: 16, fontWeight: "800" },
});
