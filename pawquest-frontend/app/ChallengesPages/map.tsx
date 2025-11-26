// app/map.tsx — DB-driven start/end, smart ORS, split route, HUD + Audio
import AudioBar, { AudioBarHandle } from "../../components/AudioBar";
import ChallengeHUD from "../../components/ChallengeHUD";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  TouchableOpacity,
} from "react-native";
import MapView, { LatLng, Marker, Polyline } from "react-native-maps";

// Firestore
import { auth, db } from "../../src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  beginChallengeSession,
  endChallengeSessionAndPersist,
  onChallengeViolation,
} from "../../src/lib/backgroundTracking";
import {
  extractVariantCompletion,
  isChallengeFullyLocked,
  VariantCompletionFlags,
} from "../../src/lib/challengeRuns";
import {
  STORY_SEGMENT_COUNT,
  StorySegments,
  loadPetStoryForVariant,
  loadSeasonEpisodesForVariant,
  saveStoryCompletion,
} from "../../src/lib/stories";

// ORS key
const ORS_API_KEY =
  "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjNhYmYxMzBmODQwNzQ2ODM4Mzk3M2RmNjcyNzExMzAyIiwiaCI6Im11cm11cjY0In0=";

const PROXIMITY_M = 50;
const MOVE_RECALC_M = 8;
const RECALC_MIN_GAP_MS = 5000;
const RECALC_TIMER_SEC = 10;

type RouteSummary = {
  distanceM: number;
  durationS: number;
  nextInstruction?: string;
};

type RunStats = {
  startAt: number | null;
  distance: number;
  lastPoint: LatLng | null;
};

type GeoPointLike = {
  latitude?: number;
  longitude?: number;
  _lat?: number;
  _long?: number;
  lat?: number;
  lng?: number;
};

type VariantDoc = {
  start?: GeoPointLike;
  end?: GeoPointLike;
  [key: string]: any;
};

type ChallengeDoc = {
  title?: string;
  start?: GeoPointLike;
  end?: GeoPointLike;
  audioUrl?: string;
  variants?: {
    easy?: VariantDoc;
    hard?: VariantDoc;
  };
  [key: string]: any;
};

const toLatLng = (value: unknown): LatLng | null => {
  if (!value || typeof value !== "object") return null;
  const geo = value as GeoPointLike;

  const lat = geo.latitude ?? geo._lat ?? geo.lat;
  const lng = geo.longitude ?? geo._long ?? geo.lng;

  if (typeof lat === "number" && typeof lng === "number") {
    return { latitude: lat, longitude: lng };
  }
  return null;
};

const readVariant = (doc: ChallengeDoc, key: string | undefined) => {
  if (!key) return null;
  return doc.variants?.[key] || (doc[key] as VariantDoc) || null;
};

// Helpers
const haversineM = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const dφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dλ = ((b.longitude - a.longitude) * Math.PI) / 180;

  const s =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

const formatDuration = (s: number) => {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m2 = min % 60;
  return `${h}h ${m2}m`;
};

function nearestRouteIndex(route: LatLng[], you: LatLng) {
  let best = Infinity;
  let idx = 0;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i].latitude - you.latitude;
    const dy = route[i].longitude - you.longitude;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      idx = i;
    }
  }
  return idx;
}

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  const params = useLocalSearchParams<any>();

  const challengeId = Array.isArray(params.challengeId)
    ? params.challengeId[0]
    : params.challengeId ?? null;

  const difficultyRaw = Array.isArray(params.difficulty)
    ? params.difficulty[0]
    : params.difficulty;

  const variantParam =
    typeof difficultyRaw === "string" &&
    difficultyRaw.toLowerCase() === "hard"
      ? "hard"
      : "easy";

  const normalize = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

  const storyType = normalize(params.storyType);
  const storySeasonId = normalize(params.storySeasonId);
  const storyEpisodeId = normalize(params.storyEpisodeId);
  const storyPetKey = normalize(params.storyPetKey);

  const storyTypeSelection =
    storyType === "season" || storyType === "pet" ? storyType : null;

  const userId = auth.currentUser?.uid ?? null;

  // DB + challenge state
  const [challengeTitle, setChallengeTitle] = useState<string | undefined>();
  const [challengeDoc, setChallengeDoc] = useState<ChallengeDoc | null>(null);
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<LatLng | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [variantCompletions, setVariantCompletions] =
    useState<VariantCompletionFlags>({ easy: false, hard: false });
  const [locksReady, setLocksReady] = useState(false);

  // Map & location
  const [region, setRegion] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  // Challenge gating
  const [nearStart, setNearStart] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [challengeStarted, setChallengeStarted] = useState(false);

  // ORS routing
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [initialRouteDistanceM, setInitialRouteDistanceM] =
    useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Refs
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchAtRef = useRef(0);
  const lastRouteOriginRef = useRef<LatLng | null>(null);
  const lockAlertShownRef = useRef(false);
  const runStatsRef = useRef<RunStats>({
    startAt: null,
    distance: 0,
    lastPoint: null,
  });

  const navigatingRef = useRef(false);

  // Pre-start routing
  const [showStartPrompt, setShowStartPrompt] = useState(false);
  const [preStartRouteCoords, setPreStartRouteCoords] = useState<LatLng[]>([]);
  const preStartAbortRef = useRef<AbortController | null>(null);
  const preStartLastOriginRef = useRef<LatLng | null>(null);
  const preStartLastFetchAtRef = useRef(0);

  // YOU pulse
  const pulse = useRef(new Animated.Value(0)).current;
  const [variantImageUrl, setVariantImageUrl] = useState<string | null>(null);

  // Story mode
  const [activeStory, setActiveStory] = useState<StorySegments | null>(null);
  const [storyStatus, setStoryStatus] = useState("Ready");
  const [storyPlaying, setStoryPlaying] = useState(false);
  const storySoundsRef = useRef<Audio.Sound[]>([]);
  const triggeredSegmentsRef = useRef(
    Array(STORY_SEGMENT_COUNT).fill(false)
  );
  const currentStorySegmentRef = useRef<number | null>(null);

  const audioRef = useRef<AudioBarHandle>(null);
}
  // Pulse animation for YOU marker
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.6],
  });

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });

  // Story playback controls
  const pauseStoryPlayback = useCallback(async () => {
    const idx = currentStorySegmentRef.current;
    if (idx === null) return;

    const sound = storySoundsRef.current[idx];
    if (!sound) return;

    try {
      await sound.pauseAsync();
    } catch {}

    setStoryPlaying(false);
    setStoryStatus("Paused");
  }, []);

  const resumeStoryPlayback = useCallback(async () => {
    const idx = currentStorySegmentRef.current;
    if (idx === null) return;

    const sound = storySoundsRef.current[idx];
    if (!sound) return;

    try {
      await sound.playAsync();
      setStoryPlaying(true);
      setStoryStatus(`Segment ${idx + 1} playing`);
    } catch (err) {
      console.warn("[MapScreen] resume failed", err);
    }
  }, []);

  const stopStoryPlayback = useCallback(async () => {
    const idx = currentStorySegmentRef.current;
    if (idx !== null) {
      try {
        await storySoundsRef.current[idx]?.stopAsync();
      } catch {}
    }
    currentStorySegmentRef.current = null;
    setStoryPlaying(false);
    setStoryStatus("Ready");
  }, []);

  const playSegmentAtIndex = useCallback(
    async (targetIndex: number) => {
      if (!activeStory || !storySoundsRef.current[targetIndex]) return;

      const currentIdx = currentStorySegmentRef.current;

      // Stop previous segment
      if (currentIdx !== null && currentIdx !== targetIndex) {
        try {
          await storySoundsRef.current[currentIdx]?.stopAsync();
        } catch {}
      }

      currentStorySegmentRef.current = targetIndex;
      triggeredSegmentsRef.current[targetIndex] = true;

      try {
        await storySoundsRef.current[targetIndex]?.setPositionAsync(0);
        await storySoundsRef.current[targetIndex]?.playAsync();

        setStoryPlaying(true);
        setStoryStatus(`Segment ${targetIndex + 1} playing`);
      } catch (err) {
        console.warn("[MapScreen] failed to play segment", err);
        setStoryStatus("Audio unavailable");
      }
    },
    [activeStory]
  );

  // Auto pause when app backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state.match(/inactive|background/) && storyPlaying) {
        void pauseStoryPlayback();
      }
    });

    return () => sub.remove();
  }, [storyPlaying, pauseStoryPlayback]);

  // Reset story state when challenge restarts
  useEffect(() => {
    if (!challengeStarted) {
      triggeredSegmentsRef.current = Array(STORY_SEGMENT_COUNT).fill(false);
      currentStorySegmentRef.current = null;
      setStoryPlaying(false);
      setStoryStatus("Ready");
    }
  }, [challengeStarted]);

  // Hide navigation bar during challenge
  useEffect(() => {
    navigation.setOptions({ headerShown: !challengeStarted });
  }, [challengeStarted]);

  // Challenge lock logic
  const challengeLocked = useMemo(
    () => isChallengeFullyLocked(variantCompletions),
    [variantCompletions]
  );

  const storyModeActive = useMemo(
    () => Boolean(activeStory && activeStory.segmentUrls.length === STORY_SEGMENT_COUNT),
    [activeStory]
  );

  const variantLocked = useMemo(() => {
    if (challengeLocked) return true;
    return variantParam === "hard"
      ? variantCompletions.hard
      : variantCompletions.easy;
  }, [variantCompletions, challengeLocked, variantParam]);

  const canStartChallenge = locksReady && !challengeLocked && !variantLocked;

  // Load user progress (completions)
  useEffect(() => {
    let active = true;

    if (!challengeId || !userId) {
      setVariantCompletions({ easy: false, hard: false });
      setLocksReady(true);
      return () => {
        active = false;
      };
    }

    setLocksReady(false);

    (async () => {
      try {
        const ref = doc(db, "Users", userId, "challengeRuns", challengeId);
        const snap = await getDoc(ref);

        if (!active) return;

        if (snap.exists()) {
          setVariantCompletions(extractVariantCompletion(snap.data()));
        } else {
          setVariantCompletions({ easy: false, hard: false });
        }
      } catch {
        if (active) {
          setVariantCompletions({ easy: false, hard: false });
        }
      } finally {
        if (active) setLocksReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [challengeId, userId]);

  // Alert if locked
  useEffect(() => {
    if (!locksReady) return;

    if (!(challengeLocked || variantLocked)) {
      lockAlertShownRef.current = false;
      return;
    }

    if (lockAlertShownRef.current) return;
    lockAlertShownRef.current = true;

    const msg = challengeLocked
      ? "You've already completed this challenge on both easy and hard."
      : `You've already completed the ${variantParam} mode.`;

    Alert.alert("Challenge locked", msg, [
      {
        text: "OK",
        onPress: () => router.replace("/(tabs)/challenges"),
      },
    ]);
  }, [locksReady, challengeLocked, variantLocked]);

  // Load challenge from DB
  useEffect(() => {
    let mounted = true;
    setChallengeDoc(null);

    (async () => {
      try {
        const id = challengeId || "default";
        const snap = await getDoc(doc(db, "challenges", id));

        if (!snap.exists()) {
          Alert.alert("Not found", "Challenge document does not exist.");
          return;
        }

        const data = snap.data() as ChallengeDoc;
        if (!mounted) return;

        setChallengeDoc(data);
        setChallengeTitle(data.title);
        setAudioUrl(data.audioUrl);

        // Determine correct variant
        const preferredVariant = readVariant(data, variantParam);
        const easyVariant =
          variantParam === "easy"
            ? preferredVariant
            : readVariant(data, "easy");
        const hardVariant =
          variantParam === "hard"
            ? preferredVariant
            : readVariant(data, "hard");

        const startCandidate =
          toLatLng(preferredVariant?.start) ??
          toLatLng(data.start) ??
          toLatLng(easyVariant?.start) ??
          toLatLng(hardVariant?.start);

        const endCandidate =
          toLatLng(preferredVariant?.end) ??
          toLatLng(data.end) ??
          toLatLng(easyVariant?.end) ??
          toLatLng(hardVariant?.end);

        if (startCandidate && endCandidate) {
          setStartPoint(startCandidate);
          setEndPoint(endCandidate);
        } else {
          Alert.alert(
            "Invalid data",
            "Challenge is missing start/end coordinates."
          );
        }

        // Pet / variant image
        try {
          const sel: any =
            preferredVariant ??
            readVariant(data, variantParam) ??
            easyVariant ??
            hardVariant;

          const petObj: any = sel?.pet ?? {};
          const imgs: string[] | null =
            Array.isArray(sel?.petImages)
              ? sel.petImages
              : Array.isArray(petObj?.images)
              ? petObj.images
              : null;

          const single: string | null =
            typeof sel?.petImageUrl === "string"
              ? sel.petImageUrl
              : typeof petObj?.imageUrl === "string"
              ? petObj.imageUrl
              : null;

          const chosen =
            imgs && imgs.length > 0 && typeof imgs[0] === "string"
              ? imgs[0]
              : single;

          setVariantImageUrl(chosen ?? null);
        } catch {
          setVariantImageUrl(null);
        }
      } catch (err) {
        Alert.alert("DB error", err?.message ?? "Failed to load challenge.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [challengeId, variantParam]);
  // Reset route cache when challenge changes
  const cacheKey = `route:${challengeId || "default"}`;
  useEffect(() => {
    AsyncStorage.multiRemove([
      `${cacheKey}:coords`,
      `${cacheKey}:summary`,
    ]).catch(() => {});
  }, [cacheKey]);

  // Cleanup story audio on unmount
  useEffect(
    () => () => {
      storySoundsRef.current.forEach((sound) => {
        try {
          sound.unloadAsync();
        } catch {}
      });
      storySoundsRef.current = [];
    },
    []
  );

  // Load episodic / pet story
  useEffect(() => {
    let cancelled = false;

    const loadStory = async () => {
      if (!challengeId || !storyTypeSelection || !challengeDoc) {
        setActiveStory(null);
        return;
      }

      const docData = challengeDoc;

      try {
        let story: StorySegments | null = null;

        if (storyTypeSelection === "pet") {
          if (storyPetValue && storyPetValue !== "pigeon") {
            setActiveStory(null);
            return;
          }

          story = await loadPetStoryForVariant(docData, variantParam, {
            challengeId,
          });
        } else {
          const episodes = await loadSeasonEpisodesForVariant(variantParam, {
            challengeId,
            seasonId: storySeasonValue ?? undefined,
          });

          story = episodes.find(
            (episode) =>
              (storySeasonValue ? episode.seasonId === storySeasonValue : true) &&
              (storyEpisodeValue ? episode.episodeId === storyEpisodeValue : true)
          ) ?? null;
        }

        if (!cancelled) {
          setActiveStory(story);
          setStoryStatus("Ready");
          setStoryPlaying(false);

          triggeredSegmentsRef.current = Array(STORY_SEGMENT_COUNT).fill(false);
          currentStorySegmentRef.current = null;
        }
      } catch (err) {
        console.warn("[MapScreen] story load failed", err);
        if (!cancelled) setActiveStory(null);
      }
    };

    loadStory();
    return () => {
      cancelled = true;
    };
  }, [
    challengeDoc,
    challengeId,
    storyTypeSelection,
    storySeasonValue,
    storyEpisodeValue,
    storyPetValue,
    variantParam,
  ]);

  // Permissions + initial location + watcher
  useEffect(() => {
    if (!startPoint || !endPoint) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setUserLocation(coords);
      setRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });

      await Location.watchPositionAsync(
        challengeStarted
          ? { accuracy: Location.Accuracy.Highest, distanceInterval: 3 }
          : { accuracy: Location.Accuracy.Balanced, distanceInterval: 8 },
        (newLoc) => {
          const c = {
            latitude: newLoc.coords.latitude,
            longitude: newLoc.coords.longitude,
          };

          setUserLocation(c);

          if (startPoint) setNearStart(haversineM(c, startPoint) < PROXIMITY_M);
          if (endPoint) setNearEnd(haversineM(c, endPoint) < PROXIMITY_M);

          if (!challengeStarted) return;

          // Add distance for stats
          const stats = runStatsRef.current;

          if (!stats.startAt) stats.startAt = Date.now();

          if (stats.lastPoint) {
            const delta = haversineM(stats.lastPoint, c);
            if (Number.isFinite(delta) && delta > 0.2) {
              stats.distance += delta;
            }
          }

          stats.lastPoint = c;

          // Dynamic recalc
          if (
            !lastRouteOriginRef.current ||
            haversineM(lastRouteOriginRef.current, c) > MOVE_RECALC_M
          ) {
            fetchRouteSafe(c, endPoint);
          }
        }
      );
    })();
  }, [
    challengeStarted,
    startPoint?.latitude,
    startPoint?.longitude,
    endPoint?.latitude,
    endPoint?.longitude,
  ]);

  // Periodic recalc (every X sec)
  useEffect(() => {
    if (!challengeStarted || !userLocation || !endPoint) return;

    const t = setInterval(
      () => fetchRouteSafe(userLocation, endPoint),
      RECALC_TIMER_SEC * 1000
    );

    return () => clearInterval(t);
  }, [
    challengeStarted,
    userLocation?.latitude,
    userLocation?.longitude,
    endPoint?.latitude,
    endPoint?.longitude,
  ]);

  // Auto-stop audio when near end
  useEffect(() => {
    if (!challengeStarted || !nearEnd) return;

    if (storyModeActive) {
      void stopStoryPlayback();
    } else {
      audioRef.current?.fadeOut();
    }
  }, [challengeStarted, nearEnd, storyModeActive, stopStoryPlayback]);

  // Pre-start prompt visibility
  useEffect(() => {
    if (challengeStarted) {
      setShowStartPrompt(false);
      return;
    }

    if (startPoint && canStartChallenge) {
      setShowStartPrompt(true);
    } else {
      setShowStartPrompt(false);
    }
  }, [challengeStarted, startPoint, canStartChallenge]);

  // Reset route when stopped
  useEffect(() => {
    if (!challengeStarted) {
      setRouteCoords([]);
      setSummary(null);
      setInitialRouteDistanceM(null);
      lastRouteOriginRef.current = null;
      setShowAudioBar(false);
    }
  }, [challengeStarted]);

  // Overspeed violation → end challenge
  useEffect(() => {
    const unsub = onChallengeViolation(async () => {
      if (!challengeStarted) return;

      setChallengeStarted(false);

      if (storyModeActive) {
        await stopStoryPlayback();
      } else {
        audioRef.current?.fadeOut();
      }

      Alert.alert(
        "Warning",
        "Using transportation is not allowed.",
        [
          {
            text: "I understand",
            onPress: () => router.replace("/(tabs)"),
          },
        ],
        { cancelable: false }
      );
    });

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [challengeStarted, storyModeActive, stopStoryPlayback, router]);

  // Cleanup pre-start fetcher
  useEffect(
    () => () => {
      if (preStartAbortRef.current) {
        preStartAbortRef.current.abort();
      }
    },
    []
  );

  // Fetch pre-start walking route (YOU → Start)
  const fetchPreStartRouteSafe = useCallback(
    async (origin: LatLng, destination: LatLng) => {
      const now = Date.now();
      if (now - preStartLastFetchAtRef.current < RECALC_MIN_GAP_MS) return;

      preStartLastFetchAtRef.current = now;

      if (preStartAbortRef.current) preStartAbortRef.current.abort();
      const ac = new AbortController();
      preStartAbortRef.current = ac;

      try {
        const url =
          `https://api.openrouteservice.org/v2/directions/foot-walking` +
          `?api_key=${encodeURIComponent(ORS_API_KEY)}` +
          `&start=${origin.longitude},${origin.latitude}` +
          `&end=${destination.longitude},${destination.latitude}`;

        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/geo+json" },
          signal: ac.signal,
        });

        if (!res.ok) return;

        const json = await res.json();

        const coordsLL: LatLng[] =
          json?.features?.[0]?.geometry?.coordinates?.map(
            (pt: [number, number]) => ({
              latitude: pt[1],
              longitude: pt[0],
            })
          ) ?? [];

        setPreStartRouteCoords(coordsLL.length > 1 ? coordsLL : []);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.log("Pre-start ORS failed", e);
        }
      } finally {
        if (preStartAbortRef.current === ac) {
          preStartAbortRef.current = null;
        }
      }
    },
    []
  );

  // Maintain walking route to Start (before challenge begins)
  useEffect(() => {
    if (challengeStarted) {
      setPreStartRouteCoords([]);
      preStartLastOriginRef.current = null;
      preStartLastFetchAtRef.current = 0;

      if (preStartAbortRef.current) {
        preStartAbortRef.current.abort();
        preStartAbortRef.current = null;
      }
      return;
    }

    if (!startPoint || !userLocation) {
      setPreStartRouteCoords([]);
      preStartLastOriginRef.current = null;
      preStartLastFetchAtRef.current = 0;
      return;
    }

    const distanceToStart = haversineM(userLocation, startPoint);

    if (!Number.isFinite(distanceToStart) || distanceToStart < PROXIMITY_M) {
      setPreStartRouteCoords([]);
      preStartLastOriginRef.current = null;
      preStartLastFetchAtRef.current = 0;
      return;
    }

    const movedEnough =
      !preStartLastOriginRef.current ||
      haversineM(preStartLastOriginRef.current, userLocation) > MOVE_RECALC_M;

    if (movedEnough) {
      preStartLastOriginRef.current = userLocation;
      fetchPreStartRouteSafe(userLocation, startPoint);
    }
  }, [
    challengeStarted,
    startPoint?.latitude,
    startPoint?.longitude,
    userLocation?.latitude,
    userLocation?.longitude,
    fetchPreStartRouteSafe,
  ]);

  const handleStartPromptPress = useCallback(() => {
    if (!challengeStarted && userLocation && startPoint) {
      fetchPreStartRouteSafe(userLocation, startPoint);
    }
  }, [
    challengeStarted,
    userLocation?.latitude,
    userLocation?.longitude,
    startPoint?.latitude,
    startPoint?.longitude,
    fetchPreStartRouteSafe,
  ]);

  // SMART ROUTE FETCH (with throttle + abort + cache)
  const fetchRouteSafe = async (origin: LatLng, destination: LatLng) => {
    const now = Date.now();

    if (now - lastFetchAtRef.current < RECALC_MIN_GAP_MS) return;
    lastFetchAtRef.current = now;

    if (abortRef.current) abortRef.current.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setRouteLoading(true);

      const url =
        `https://api.openrouteservice.org/v2/directions/foot-walking` +
        `?api_key=${encodeURIComponent(ORS_API_KEY)}` +
        `&start=${origin.longitude},${origin.latitude}` +
        `&end=${destination.longitude},${destination.latitude}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/geo+json" },
        signal: ac.signal,
      });

      if (!res.ok) {
        const txt = await res.text();
        console.log("ORS ERROR", txt);
        return;
      }

      const json = await res.json();

      const coordsLL: LatLng[] =
        json?.features?.[0]?.geometry?.coordinates?.map(
          (pt: [number, number]) => ({
            latitude: pt[1],
            longitude: pt[0],
          })
        ) ?? [];

      const seg = json?.features?.[0]?.properties?.segments?.[0];
      const sum = json?.features?.[0]?.properties?.summary;

      const nextInstruction = seg?.steps?.[0]?.instruction || undefined;

      if (coordsLL.length > 1 && sum) {
        setRouteCoords(coordsLL);
        setSummary({
          distanceM: sum.distance ?? 0,
          durationS: sum.duration ?? 0,
          nextInstruction,
        });

        if (!initialRouteDistanceM)
          setInitialRouteDistanceM(sum.distance ?? 0);

        lastRouteOriginRef.current = origin;

        try {
          await AsyncStorage.multiSet([
            [`${cacheKey}:coords`, JSON.stringify(coordsLL)],
            [
              `${cacheKey}:summary`,
              JSON.stringify({
                distanceM: sum.distance ?? 0,
                durationS: sum.duration ?? 0,
                nextInstruction,
              }),
            ],
          ]);
        } catch {}
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.log("ORS fetch failed", err);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRouteLoading(false);
    }
  };

  // Split route into DONE + TODO segments
  let doneSeg: LatLng[] = [];
  let todoSeg: LatLng[] = [];

  if (challengeStarted && routeCoords.length > 1 && userLocation) {
    const idx = nearestRouteIndex(routeCoords, userLocation);

    doneSeg = routeCoords.slice(0, Math.max(1, idx));
    todoSeg = routeCoords.slice(Math.max(0, idx - 1));
  }

  const hasPreStartRoute =
    !challengeStarted && preStartRouteCoords.length > 1;

  const fallbackApproachLine =
    !challengeStarted &&
    !nearStart &&
    userLocation &&
    startPoint &&
    !hasPreStartRoute
      ? [userLocation, startPoint]
      : null;

  const remainingM = summary?.distanceM ?? null;
  const totalM = initialRouteDistanceM ?? null;

  const progress =
    remainingM !== null && totalM !== null && totalM > 0
      ? Math.min(1, Math.max(0, 1 - remainingM / totalM))
      : 0;

  const totalStoryDistance = useMemo(() => {
    if (initialRouteDistanceM && initialRouteDistanceM > 0)
      return initialRouteDistanceM;

    if (activeStory?.distanceMeters && activeStory.distanceMeters > 0)
      return activeStory.distanceMeters;

    return null;
  }, [initialRouteDistanceM, activeStory?.distanceMeters]);

  // Auto-play story segments based on progress
  useEffect(() => {
    if (
      !storyModeActive ||
      !challengeStarted ||
      !totalStoryDistance ||
      totalStoryDistance <= 0
    )
      return;

    const thresholds = Array.from(
      { length: STORY_SEGMENT_COUNT },
      (_, idx) =>
        idx === 0 ? 0 : (idx * totalStoryDistance) / STORY_SEGMENT_COUNT
    );

    const distanceCovered = totalStoryDistance * progress;

    thresholds.forEach((threshold, idx) => {
      if (
        distanceCovered >= threshold &&
        !triggeredSegmentsRef.current[idx]
      ) {
        void playSegmentAtIndex(idx);
      }
    });
  }, [
    challengeStarted,
    playSegmentAtIndex,
    progress,
    storyModeActive,
    totalStoryDistance,
  ]);
  // Not ready yet (missing DB coordinates or location permission)
  if (!startPoint || !endPoint || !hasPermission || !region || !userLocation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.info}>Loading map…</Text>
      </View>
    );
  }

  // Start challenge (unified version)
  const handleStartChallenge = async () => {
    if (!canStartChallenge) {
      const lockMsg = challengeLocked
        ? "You've already completed this challenge on both easy and hard modes."
        : `You've already completed the ${
            variantParam === "hard" ? "hard" : "easy"
          } mode.`;

      Alert.alert("Challenge locked", lockMsg);
      return;
    }

    setChallengeStarted(true);

    // Background tracking start
    beginChallengeSession();

    // Reset stats
    runStatsRef.current = {
      startAt: Date.now(),
      distance: 0,
      lastPoint: userLocation ?? null,
    };

    // Story or classic audio
    const useStoryAudio =
      storyModeActive &&
      activeStory &&
      activeStory.segmentUrls.length === STORY_SEGMENT_COUNT;

    if (useStoryAudio) {
      triggeredSegmentsRef.current = Array(STORY_SEGMENT_COUNT).fill(false);
      currentStorySegmentRef.current = null;
      setStoryStatus("Ready");
      setStoryPlaying(false);
      void playSegmentAtIndex(0);
    } else if (audioSourceUri) {
      // regular challenge audio
      setShowAudioBar(true);
      setTimeout(() => {
        audioBarRef.current?.play();
      }, 350);
    }

    if (userLocation && endPoint) {
      await fetchRouteSafe(userLocation, endPoint);
    }
  };

  // Final render
  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation>
        {/* Pre-start walking route */}
        {hasPreStartRoute && (
          <Polyline
            coordinates={preStartRouteCoords}
            strokeWidth={4}
            strokeColor="#2F80ED"
          />
        )}

        {/* fallback straight line */}
        {!challengeStarted && fallbackApproachLine && (
          <Polyline
            coordinates={fallbackApproachLine}
            strokeWidth={4}
            strokeColor="#2F80ED"
            lineDashPattern={[6, 6]}
          />
        )}

        {/* After challenge starts — done segment */}
        {challengeStarted && doneSeg.length > 1 && (
          <Polyline
            coordinates={doneSeg}
            strokeWidth={6}
            strokeColor="rgba(47,128,237,0.3)"
            lineCap="round"
          />
        )}

        {/* After challenge starts — todo segment */}
        {challengeStarted && todoSeg.length > 1 && (
          <Polyline
            coordinates={todoSeg}
            strokeWidth={6}
            strokeColor="#2F80ED"
            lineCap="round"
          />
        )}

        {/* Start marker */}
        <Marker coordinate={startPoint} title="Start" zIndex={2000}>
          <Image
            source={require("../../assets/images/start-flag.png")}
            style={styles.icon}
          />
        </Marker>

        {/* End marker */}
        <Marker coordinate={endPoint} title="Goal" zIndex={2000}>
          <Image
            source={require("../../assets/images/End_Point.png")}
            style={styles.icon}
          />
        </Marker>

        {/* YOU marker with pulse */}
        <Marker
          coordinate={userLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={999}
        >
          <View style={{ alignItems: "center" }}>
            <Animated.View
              style={[styles.pulseCircle, { transform: [{ scale }], opacity }]}
            />
            <View style={styles.youBubble}>
              <Text style={styles.youText}>YOU</Text>
            </View>
          </View>
        </Marker>
      </MapView>

      {/* Start prompt (walk to Start) */}
      {showStartPrompt && !challengeStarted && canStartChallenge && (
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.startPromptCard}
          onPress={handleStartPromptPress}
        >
          <Text style={styles.startPromptTitle}>Head to the start point</Text>

          <Text style={styles.startPromptMessage}>
            {nearStart
              ? "You're in range. Tap Start when you're ready."
              : "Follow the blue line to reach the starting flag."}
          </Text>

          <Text style={styles.startPromptCta}>
            {nearStart
              ? "Tap Start below to begin."
              : "Tap to refresh directions."}
          </Text>
        </TouchableOpacity>
      )}

      {/* HUD */}
      {challengeStarted && (
        <ChallengeHUD
          mode={nearEnd ? "complete" : "active"}
          distanceText={
            remainingM !== null ? formatDistance(remainingM) : "—"
          }
          timeText={summary ? formatDuration(summary.durationS) : "—"}
          progress={progress}
          instruction={summary?.nextInstruction}
          loading={routeLoading}
          onCapture={async () => {
            if (navigatingRef.current) return;
            navigatingRef.current = true;

            if (storyModeActive) {
              await stopStoryPlayback();
            } else {
              audioBarRef.current?.fadeOut();
            }

            let sessionTotals = { steps: 0, calories: 0 };

            try {
              sessionTotals = await endChallengeSessionAndPersist();
            } catch {}

            const stats = runStatsRef.current;

            const durationSec =
              stats.startAt !== null
                ? Math.max(
                    0,
                    Math.round((Date.now() - stats.startAt) / 1000)
                  )
                : null;

            let dist = stats.distance;

            if (stats.lastPoint && userLocation) {
              const tail = haversineM(stats.lastPoint, userLocation);
              if (Number.isFinite(tail)) dist += tail;
            }

            const roundedDistance =
              Number.isFinite(dist) && dist > 0
                ? Math.round(dist)
                : null;

            const params: Record<string, string> = {};

            if (variantParam) params.variant = variantParam;
            if (challengeTitle) params.title = challengeTitle;
            if (durationSec !== null)
              params.durationSec = String(durationSec);
            if (roundedDistance !== null)
              params.distanceM = String(roundedDistance);
            if (challengeId) params.challengeId = challengeId;

            if (Number.isFinite(sessionTotals.steps))
              params.actualSteps = String(
                Math.max(0, Math.round(sessionTotals.steps))
              );
            if (Number.isFinite(sessionTotals.calories))
              params.actualCalories = String(
                Math.max(0, Math.round(sessionTotals.calories))
              );

            if (variantImageUrl)
              params.imageUrl = variantImageUrl;

            if (userId && activeStory) {
              try {
                await saveStoryCompletion(userId, activeStory);
              } catch (err) {
                console.warn("Failed to save story completion", err);
              }
            }

            router.push({
              pathname: "/ChallengesPages/ARPetScreen",
              params,
            });
          }}
        />
      )}

      {/* Start button (must be inside 50m) */}
      {!challengeStarted && nearStart && canStartChallenge && (
        <TouchableOpacity
          style={styles.startBtn}
          onPress={handleStartChallenge}
        >
          <Text style={styles.btnText}>
            Start {challengeTitle ? `– ${challengeTitle}` : "Challenge"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Audio bar */}
      {audioSourceUri && (
        <AudioBar
          ref={audioBarRef}
          title={
            storyModeActive && activeStory
              ? activeStory.title
              : challengeTitle || "The Lost Letter"
          }
          source={
            storyModeActive
              ? undefined
              : { uri: audioSourceUri }
          }
          visible={
            challengeStarted &&
            (!storyModeActive || Boolean(activeStory))
          }
          controlledState={
            storyModeActive
              ? {
                  isPlaying: storyPlaying,
                  statusText: storyStatus,
                  onPlay: () => void resumeStoryPlayback(),
                  onPause: () => void pauseStoryPlayback(),
                }
              : undefined
          }
        />
      )}
    </View>
  );
  
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  info: { color: "#fff", marginTop: 8 },

  icon: { width: 52, height: 52, resizeMode: "contain" },

  pulseCircle: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#78C8F9",
  },

  youBubble: {
    backgroundColor: "#9ADAF8",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#6CC3E0",
  },

  youText: { color: "#1B5C79", fontWeight: "800" },

  startBtn: {
    position: "absolute",
    bottom: 210,
    alignSelf: "center",
    backgroundColor: "#22C55E",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  btnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  startPromptCard: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderWidth: 1,
    borderColor: "#3B82F6",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 50,
  },

  startPromptTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  startPromptMessage: {
    color: "#E5E7EB",
    fontSize: 14,
    marginTop: 6,
  },

  startPromptCta: {
    color: "#93C5FD",
    fontSize: 13,
    marginTop: 10,
    fontWeight: "600",
  },
});


