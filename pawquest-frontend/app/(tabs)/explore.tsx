// app/(tabs)/explore.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { Region } from "react-native-maps";
import * as Location from "expo-location";
import type * as LocationTypes from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { db } from "@/src/lib/firebase";
import { collection, getDocs, QueryDocumentSnapshot } from "firebase/firestore";

// ───────────────── types ─────────────────
type ChallengeStats = {
  rating?: number;
  ratingAvg?: number;
  ratingCount?: number;
  ratingTotal?: number;
  challengePlays?: number;
  title?: string;
};

type ChallengeDoc = {
  title?: string;
  categoryId?: string;
  district?: string;
  start?: { latitude: number; longitude: number } | any;
  estimatedTimeMin?: number | string;
  distanceMeters?: number | string;
  ratingAvg?: number;
  ratingCount?: number;
  petImageUrl?: string;
  stats?: ChallengeStats;
  info?: Record<string, any>;
  metrics?: Record<string, any>;
};

type Pin = {
  id: string;
  title: string;
  categoryId: string;
  district?: string;
  latitude: number;
  longitude: number;
  estimatedTimeMin?: number;
  distanceMeters?: number;
  ratingAvg?: number;
  ratingCount?: number;
  petImageUrl?: string;
};

// ───────────────── constants ─────────────────
const DEFAULT_REGION: Region = {
  latitude: 21.543333,
  longitude: 39.172778,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#eaf5f3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b8f8b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#eaf5f3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe9e5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#b7d3cf" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e3f1ee" }] },
];

// ───────────────── helpers ─────────────────
function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(la1) * Math.cos(la2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function formatDistance(m?: number | null) {
  if (typeof m !== "number" || !isFinite(m)) return "—";
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// normalize numbers coming from Firestore (number | string | undefined)
const toNum = (v: any): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

// scan likely paths for a numeric field
const pickNumber = (obj: any, key: string): number | undefined => {
  if (!obj) return undefined;
  return (
    toNum(obj?.[key]) ??
    toNum(obj?.info?.[key]) ??
    toNum(obj?.metrics?.[key]) ??
    toNum(obj?.stats?.[key])
  );
};

// walk pace used for fallback: ~12 min per km (≈ 5 km/h)
const WALK_MIN_PER_KM = 12;

// ───────────────── child component ─────────────────
function PetMarker({ pin, onPress }: { pin: Pin; onPress: () => void }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      tracksViewChanges={!imgLoaded}
      anchor={{ x: 0.5, y: 1 }}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress();
      }}
    >
      <View style={styles.petPin} collapsable={false}>
        <View style={styles.petPinBubble}>
          {pin.petImageUrl ? (
            <Image
              source={{ uri: pin.petImageUrl }}
              style={styles.petPinImg}
              onLoadEnd={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          ) : (
            <MaterialCommunityIcons
              name="paw"
              size={26}
              color="#0b332f"
              onLayout={() => setImgLoaded(true)}
            />
          )}
        </View>
        <View style={styles.petPinTail} />
      </View>
    </Marker>
  );
}

// ───────────────── component ─────────────────
export default function Explore() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const markerPressRef = useRef(false);

  const insets = useSafeAreaInsets();
  const tabH = useBottomTabBarHeight();

  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<Pin[]>([]);
  const [selected, setSelected] = useState<Pin | null>(null);
  const [userLoc, setUserLoc] = useState<LocationTypes.LocationObject | null>(null);
  const [distanceToSelected, setDistanceToSelected] = useState<number | null>(null);
  const [hasLocationPerm, setHasLocationPerm] = useState<boolean>(false);

  // Permissions + live location
  useEffect(() => {
    let sub: LocationTypes.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasLocationPerm(granted);
      if (granted) {
        const curr = await Location.getCurrentPositionAsync({});
        setUserLoc(curr);
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (u) => setUserLoc(u)
        );
      }
    })();
    return () => sub?.remove();
  }, []);

  // Load challenges (coerce fields + fallbacks)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "challenges"));
      const arr: Pin[] = [];
      snap.forEach((docSnap: QueryDocumentSnapshot) => {
        const d = docSnap.data() as ChallengeDoc;

        // geo
        const geo = d?.start;
        const lat = geo?.latitude ?? geo?._lat;
        const lng = geo?.longitude ?? geo?._long;

        // ratings (prefer nested stats, then compute, then legacy)
        const computedAvg =
          typeof d?.stats?.ratingTotal === "number" &&
          typeof d?.stats?.ratingCount === "number" &&
          d.stats?.ratingCount > 0
            ? d.stats.ratingTotal / d.stats.ratingCount
            : undefined;

        const ratingAvg = d?.stats?.ratingAvg ?? computedAvg ?? d?.ratingAvg;
        const ratingCount = d?.stats?.ratingCount ?? d?.ratingCount;

        // numbers that might be string / on other paths
        const distanceMeters = pickNumber(d, "distanceMeters");
        let estimatedTimeMin = pickNumber(d, "estimatedTimeMin");

        // fallback: compute ETA from distance if missing
        if (estimatedTimeMin === undefined && typeof distanceMeters === "number") {
          estimatedTimeMin = Math.round((distanceMeters / 1000) * WALK_MIN_PER_KM);
        }

        if (typeof lat === "number" && typeof lng === "number") {
          arr.push({
            id: docSnap.id,
            title: d.title ?? d.stats?.title ?? "Challenge",
            categoryId: d.categoryId?.toLowerCase?.() ?? "city",
            district: d.district,
            latitude: lat,
            longitude: lng,
            estimatedTimeMin,
            distanceMeters,
            ratingAvg,
            ratingCount,
            petImageUrl: d.petImageUrl,
          });
        }
      });
      setPins(arr);
      setLoading(false);
    })();
  }, []);

  // Fit all pins
  useEffect(() => {
    if (!mapRef.current || pins.length === 0) return;
    const coords = pins.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 80, bottom: 200, left: 80 },
        animated: true,
      });
    }, 300);
  }, [pins]);

  // Live distance
  useEffect(() => {
    if (!selected || !userLoc) return setDistanceToSelected(null);
    setDistanceToSelected(
      haversineMeters(
        { lat: userLoc.coords.latitude, lon: userLoc.coords.longitude },
        { lat: selected.latitude, lon: selected.longitude }
      )
    );
  }, [selected, userLoc]);

  const initialRegion = useMemo(() => DEFAULT_REGION, []);

  // Helper: navigate to details with robust params (supports both `challengeId` and `id`)
  const goToDetails = (p: Pin) => {
    const id = String(p.id);
    // Send both names to be compatible with either extractor on the details screen
    router.push({
      pathname: "/ChallengesPages/ChallengeDetails",
      params: {
        challengeId: id,
        id, // some screens use `id`, others `challengeId`
        title: p.title || "Challenge", // optional nicety
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.h1}>Map</Text>
        <Text style={styles.h2}>
          {loading ? "Loading challenges…" : `Challenges Available: ${pins.length}`}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={(r) => {
            mapRef.current = r;
          }}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          customMapStyle={MAP_STYLE}
          showsUserLocation={hasLocationPerm}
          showsMyLocationButton
          loadingEnabled
          rotateEnabled
          onPress={(e: any) => {
            if (e?.nativeEvent?.action === "marker-press") return;
            if (markerPressRef.current) {
              markerPressRef.current = false;
              return;
            }
            setSelected(null);
          }}
        >
          {!loading &&
            pins.map((p) => (
              <PetMarker
                key={p.id}
                pin={p}
                onPress={() => {
                  markerPressRef.current = true;
                  setSelected(p);
                }}
              />
            ))}
        </MapView>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        )}
      </View>

      {selected && (
        <View style={[styles.cardWrap, { bottom: insets.bottom + tabH + 8 }]}>
          <View style={styles.cardHandle} />

          <View style={styles.cardRow}>
            {selected.petImageUrl ? (
              <Image source={{ uri: selected.petImageUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <MaterialCommunityIcons name="map-marker" size={28} color="#2b4d49" />
              </View>
            )}

            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={styles.title}>{selected.title || "Challenge"}</Text>
                <Ionicons name="checkmark-circle" size={16} color="#3BA3F8" style={{ marginLeft: 6 }} />
              </View>

              {/* EXACT FIELDS */}
              <View style={styles.infoGroup}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Challenge:</Text>
                  <Text style={styles.infoValue}>{selected.title || "—"}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Estimated Time:</Text>
                  <Text style={styles.infoValue}>
                    {Number.isFinite(selected.estimatedTimeMin as number)
                      ? `${selected.estimatedTimeMin} min`
                      : "—"}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Distance:</Text>
                  <Text style={styles.infoValue}>
                    {Number.isFinite(selected.distanceMeters as number)
                      ? formatDistance(selected.distanceMeters as number)
                      : "—"}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Rating:</Text>
                  <Text style={styles.infoValue}>
                    {typeof selected.ratingAvg === "number" ? selected.ratingAvg.toFixed(1) : "—"}
                  </Text>
                </View>
              </View>

              <View style={styles.bottomRow}>
                <View style={styles.distancePill}>
                  <Ionicons name="navigate-outline" size={16} color="#2b4d49" />
                  <Text style={styles.distanceText}>
                    {formatDistance(distanceToSelected)} from you
                  </Text>
                </View>

                <Pressable onPress={() => goToDetails(selected)} style={styles.startBtn}>
                  <Text style={styles.startText}>Start</Text>
                  <Ionicons name="chevron-forward" size={18} color="#0b332f" />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ───────────────── styles ─────────────────
const PIN_SIZE = 48;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#eaf5f3" },
  header: {
    backgroundColor: "#eaf5f3",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  h1: { fontSize: 28, fontWeight: "900", color: "#2b4d49" },
  h2: { marginTop: 2, fontSize: 14, fontWeight: "600", color: "#6b8f8b" },
  mapWrap: { flex: 1, backgroundColor: "#cfe9e5" },
  loadingOverlay: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    padding: 16,
    borderRadius: 12,
  },
  loadingText: { fontWeight: "700", color: "#2b4d49" },

  petPin: { alignItems: "center" },
  petPinBubble: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "rgba(11,51,47,0.15)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  petPinImg: { width: PIN_SIZE * 0.74, height: PIN_SIZE * 0.74, resizeMode: "contain" },
  petPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ffffff",
    marginTop: 2,
  },

  cardWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 20,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
  },
  cardHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.16)",
    marginBottom: 10,
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 56, height: 56, borderRadius: 14 },
  avatarFallback: { backgroundColor: "#cfe9e5", justifyContent: "center", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "900", color: "#0b332f" },

  infoGroup: { marginTop: 2, gap: 6 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { color: "#6b8f8b", fontSize: 12, fontWeight: "700" },
  infoValue: { color: "#0b332f", fontSize: 13, fontWeight: "900" },

  bottomRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#d9efe9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  distanceText: { color: "#2b4d49", fontWeight: "800" },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#bfe5dc",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  startText: { fontWeight: "900", color: "#0b332f", fontSize: 15 },
});
