// app/map.tsx — DB-driven start/end, smart ORS, split route, HUD + Audio
import AudioBar, { AudioBarHandle } from "../../components/AudioBar";
import ChallengeHUD from "../../components/ChallengeHUD";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { LatLng, Marker, Polyline } from "react-native-maps";



// 🔥 Firestore
import { db } from "../../src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// 🔑 ORS key (unchanged)
const ORS_API_KEY =
  "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjNhYmYxMzBmODQwNzQ2ODM4Mzk3M2RmNjcyNzExMzAyIiwiaCI6Im11cm11cjY0In0=";

// thresholds
const PROXIMITY_M = 50;
const MOVE_RECALC_M = 8;
const RECALC_MIN_GAP_MS = 5000;
const RECALC_TIMER_SEC = 10;
 
type RouteSummary = {
  distanceM: number;
  durationS: number;
  nextInstruction?: string;
};

type ChallengeDoc = {
  title?: string;
  // Adjust these if you store as GeoPoint or lat/lng keys:
  start?: { latitude: number; longitude: number };
  end?: { latitude: number; longitude: number };
  audioUrl?: string; // remote mp3 (optional)
};

// math helpers
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
  const m = min % 60;
  return `${h}h ${m}m`;
};
function nearestRouteIndex(route: LatLng[], you: LatLng): number {
  if (route.length === 0) return 0;
  let bestI = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i].latitude - you.latitude;
    const dy = route[i].longitude - you.longitude;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bestI = i;
    }
  }
  return bestI;
}
    import * as Speech from "expo-speech";
export default function MapScreen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const { storyId } = useLocalSearchParams<{ storyId?: string }>();


  // From DB
  const [challengeTitle, setChallengeTitle] = useState<string | undefined>(undefined);
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<LatLng | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);

  // Map/Location
  const [region, setRegion] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  // Gating
  const [nearStart, setNearStart] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [challengeStarted, setChallengeStarted] = useState(false);

  // Routing
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [initialRouteDistanceM, setInitialRouteDistanceM] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // smart fetch
  const lastFetchAtRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastRouteOriginRef = useRef<LatLng | null>(null);

  // YOU pulse
  const pulse = useRef(new Animated.Value(0)).current;
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
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  // 🎧 audio control
  const audioRef = useRef<AudioBarHandle>(null);

// 1) Load challenge from DB
useEffect(() => {
  let isMounted = true;
  (async () => {
    try {
      const id = challengeId || "default";
      const snap = await getDoc(doc(db, "challenges", id));
      if (!snap.exists()) {
        Alert.alert("Not found", "Challenge document does not exist.");
        return;
      }
      const data = snap.data() as ChallengeDoc;
      if (data.start && data.end) {
        const s = { latitude: data.start.latitude, longitude: data.start.longitude };
        const e = { latitude: data.end.latitude, longitude: data.end.longitude };
        if (!isMounted) return;
        setStartPoint(s);
        setEndPoint(e);
      } else {
        Alert.alert("Invalid data", "Challenge is missing start/end coordinates.");
      }
      if (isMounted) {
        setChallengeTitle(data.title);
        setAudioUrl(data.audioUrl);
      }
    } catch (e: any) {
      Alert.alert("DB error", e?.message ?? "Failed to load challenge.");
    }
  })();
  return () => { isMounted = false; };
}, [challengeId]);

// 🔹 STEP 3 — Fetch AI Story (add this block right here)
const [aiStoryText, setAiStoryText] = useState<string | null>(null);

useEffect(() => {
  const fetchStory = async () => {
    if (!storyId) return;
    try {
      const ref = doc(db, "stories", storyId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setAiStoryText(data.text || null);
      }
    } catch (e) {
      console.warn("❌ Failed to load AI story:", e);
    }
  };
  fetchStory();
}, [storyId]);

// 2) Start fresh (avoid showing old route before Start)
useEffect(() => {
   const cacheKey = `route:${challengeId || "default"}`;
  AsyncStorage.multiRemove([`${cacheKey}:coords`, `${cacheKey}:summary`]).catch(() => {});
}, [cacheKey]);

  // 3) Permissions + watcher (start after we have DB points)
  useEffect(() => {
    if (!startPoint || !endPoint) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({});
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
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
          const c = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
          setUserLocation(c);

          if (startPoint) setNearStart(haversineM(c, startPoint) < PROXIMITY_M);
          if (endPoint) setNearEnd(haversineM(c, endPoint) < PROXIMITY_M);

          if (challengeStarted && endPoint) {
            if (
              !lastRouteOriginRef.current ||
              haversineM(lastRouteOriginRef.current, c) > MOVE_RECALC_M
            ) {
              fetchRouteSafe(c, endPoint);
            }
          }
        }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeStarted, startPoint?.latitude, startPoint?.longitude, endPoint?.latitude, endPoint?.longitude]);

  // periodic refresh
  useEffect(() => {
    if (!challengeStarted || !userLocation || !endPoint) return;
    const t = setInterval(() => fetchRouteSafe(userLocation, endPoint), RECALC_TIMER_SEC * 1000);
    return () => clearInterval(t);
  }, [challengeStarted, userLocation?.latitude, userLocation?.longitude, endPoint?.latitude, endPoint?.longitude]);

  // auto-stop audio near end
  useEffect(() => {
    if (challengeStarted && nearEnd) audioRef.current?.fadeOut();
  }, [challengeStarted, nearEnd]);

  // reset route UI if stop
  useEffect(() => {
    if (!challengeStarted) {
      setRouteCoords([]);
      setSummary(null);
      setInitialRouteDistanceM(null);
      lastRouteOriginRef.current = null;
    }
  }, [challengeStarted]);

  // smart fetch (throttle + cancel + cache)
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
        const text = await res.text();
        console.log("ORS error", res.status, text);
        if (res.status >= 400 && res.status !== 429) {
          Alert.alert("Routing error", `HTTP ${res.status}: ${text.slice(0, 250)}`);
        }
        return;
      }

      const json = await res.json();
      const coordsLL: LatLng[] =
        json?.features?.[0]?.geometry?.coordinates?.map(
          (pt: [number, number]) => ({ latitude: pt[1], longitude: pt[0] })
        ) ?? [];
      const seg = json?.features?.[0]?.properties?.segments?.[0];
      const sum = json?.features?.[0]?.properties?.summary;
      const nextInstruction: string | undefined = seg?.steps?.[0]?.instruction || undefined;

      if (coordsLL.length > 1 && sum) {
        setRouteCoords(coordsLL);
        setSummary({
          distanceM: sum.distance ?? 0,
          durationS: sum.duration ?? 0,
          nextInstruction,
        });
        if (!initialRouteDistanceM) setInitialRouteDistanceM(sum.distance ?? 0);
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
    } catch (e: any) {
      if (e?.name !== "AbortError") console.log("ORS fetch failed", e?.message ?? e);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setRouteLoading(false);
    }
  };

  // split route (only after start)
  let doneSeg: LatLng[] = [];
  let todoSeg: LatLng[] = [];
  if (challengeStarted && routeCoords.length > 1 && userLocation) {
    const idx = nearestRouteIndex(routeCoords, userLocation);
    doneSeg = routeCoords.slice(0, Math.max(1, idx));
    todoSeg = routeCoords.slice(Math.max(0, idx - 1));
  }

  const remainingM = summary?.distanceM ?? null;
  const totalM = initialRouteDistanceM ?? null;
  const progress =
    remainingM !== null && totalM !== null && totalM > 0
      ? Math.min(1, Math.max(0, 1 - remainingM / totalM))
      : 0;

  // if not ready (need DB points and location)
  if (!startPoint || !endPoint || !hasPermission || !region || !userLocation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.info}>Loading map…</Text>
      </View>
    );
  }

  // Build audio source (allow remote or fallback local asset)
  const audioSource =
    audioUrl && audioUrl.startsWith("http")
      ? { uri: audioUrl }
      : require("../../assets/audio/track.mp3");

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation>
        {/* Route after start only */}
        {challengeStarted && doneSeg.length > 1 && (
          <Polyline coordinates={doneSeg} strokeWidth={6} strokeColor="#9AA3AF" />
        )}
        {challengeStarted && todoSeg.length > 1 && (
          <Polyline coordinates={todoSeg} strokeWidth={6} strokeColor="#2F80ED" />
        )}

        <Marker coordinate={startPoint} title="Start">
          <Image source={require("../../assets/images/start-flag.png")} style={styles.icon} />
        </Marker>
        <Marker coordinate={endPoint} title="Goal">
          <Image source={require("../../assets/images/End_Point.png")} style={styles.icon} />
        </Marker>

        {/* YOU marker with pulsing aura */}
        <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={999}>
          <View style={{ alignItems: "center" }}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale }], opacity }]} />
            <View style={styles.youBubble}><Text style={styles.youText}>YOU</Text></View>
          </View>
        </Marker>
      </MapView>

      {/* HUD: active vs. complete */}
      {challengeStarted && (
        <ChallengeHUD
          mode={nearEnd ? "complete" : "active"}
          distanceText={remainingM !== null ? formatDistance(remainingM) : "—"}
          timeText={summary ? formatDuration(summary.durationS) : "—"}
          progress={progress}
          instruction={summary?.nextInstruction}
          loading={routeLoading}
          onCapture={() => {
            audioRef.current?.fadeOut();
            if (challengeId) {
              router.push({ pathname: "/ChallengesPages/ARPetScreen", params: { challengeId } });
            } else {
              router.push("/ChallengesPages/ARPetScreen");
            }
          }}
        />
      )}

      {/* Start only when inside 20 m of start */}
{!challengeStarted && nearStart && (
  <TouchableOpacity
    style={styles.startBtn}
    onPress={async () => {
      setChallengeStarted(true);

      if (aiStoryText) {
        console.log("🎧 Playing AI-generated story...");
        // Speak the AI story first
        Speech.speak(aiStoryText, {
          language: "en-US",
          rate: 0.95,
          pitch: 1.0,
          onDone: () => {
            console.log("✅ AI story finished, starting background audio");
            audioRef.current?.play();
          },
        });
      } else {
        console.log("🎵 No AI story found, playing default audio...");
        audioRef.current?.play();
      }

      if (userLocation && endPoint) await fetchRouteSafe(userLocation, endPoint);
    }}
  >
    <Text style={styles.btnText}>Start {challengeTitle ? `– ${challengeTitle}` : "Challenge"}</Text>
  </TouchableOpacity>
)}


      {/* Bottom audio bar — only after Start */}
      <AudioBar
        ref={audioRef}
        title={challengeTitle || "The Lost Letter"}
        source={audioSource}
        visible={challengeStarted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  info: { color: "#fff", marginTop: 8 },

  icon: { width: 36, height: 36, resizeMode: "contain" },

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
});
