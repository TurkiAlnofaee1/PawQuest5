import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { auth, db } from "../../src/lib/firebase";
import { useAppLocation } from "../../src/hooks";
import {
  collection,
  getDocs,
  query,
  where,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { ChallengeStats } from "../../src/lib/firestoreChallenges";
import { useFocusEffect } from "expo-router";
import {
  extractVariantCompletion,
  isChallengeFullyLocked,
  VariantCompletionFlags,
} from "../../src/lib/challengeRuns";

type Challenge = {
  id: string;
  title: string;
  district?: string;
  description?: string;
  imageUrl?: string;
  location?: { lat: number; lng: number };
  distanceMeters?: number;
  estimatedTimeMin?: number;
  difficulty?: "easy" | "hard";
  rewardPet?: string;
  completedCount?: number;
  isLocked?: boolean;
  stats?: ChallengeStats;
  ratingAvg: number;
  ratingCount: number;
  ratingTotal: number;
  userCompletion?: VariantCompletionFlags;
};

type Props = {
  category: string;
  headerTitle: string;
  onSelect?: (id: string, title: string) => void;
  onCountChange?: (count: number) => void;
};

// Per-category card color (adjust to your palette)
const CARD_COLORS: Record<string, string> = {
  city:   "rgba(219, 219, 219, 0.95)",
  mountain: "rgba(255, 196, 181, 0.95)",
  desert: "rgba(255, 209, 164, 0.95)",
  sea:    "rgba(142, 219, 255, 0.95)",
};

const converter: FirestoreDataConverter<Challenge> = {
  toFirestore: (c) => c as any,
  fromFirestore: (snap: QueryDocumentSnapshot) => {
    const d = snap.data() as any;

    let estimatedTimeMin: number | undefined = undefined;
    if (typeof d?.variants?.easy?.estimatedTimeMin === "number") {
      estimatedTimeMin = d.variants.easy.estimatedTimeMin;
    } else if (typeof d?.estimatedTimeMin === "number") {
      estimatedTimeMin = d.estimatedTimeMin;
    }

    const statsRaw = d?.stats ?? {};
    const ratingCount =
      typeof statsRaw?.ratingCount === "number" && Number.isFinite(statsRaw.ratingCount)
        ? Math.max(0, Math.floor(statsRaw.ratingCount))
        : 0;
    const ratingTotal =
      typeof statsRaw?.ratingTotal === "number" && Number.isFinite(statsRaw.ratingTotal)
        ? statsRaw.ratingTotal
        : 0;
    const ratingAvg =
      typeof statsRaw?.ratingAvg === "number" && Number.isFinite(statsRaw.ratingAvg)
        ? statsRaw.ratingAvg
        : ratingCount > 0
        ? ratingTotal / ratingCount
        : 0;
    const stats: ChallengeStats | undefined =
      ratingCount > 0 || ratingTotal > 0 || typeof statsRaw?.ratingAvg === "number"
        ? { ratingAvg, ratingCount, ratingTotal }
        : undefined;

    // Prefer variant.easy pet name and image for list cards
    const vEasy: any = d?.variants?.easy ?? {};
    const vEasyPet: any = vEasy?.pet ?? {};
    const easyImages: string[] | undefined = Array.isArray(vEasy?.petImages)
      ? vEasy.petImages
      : Array.isArray(vEasyPet?.images)
      ? vEasyPet.images
      : undefined;
    const easyImageUrl: string | undefined =
      typeof vEasy?.petImageUrl === 'string'
        ? vEasy.petImageUrl
        : typeof vEasyPet?.imageUrl === 'string'
        ? vEasyPet.imageUrl
        : Array.isArray(easyImages) && easyImages.length > 0 && typeof easyImages[0] === 'string'
        ? easyImages[0]
        : undefined;
    const easyPetName: string | undefined =
      typeof vEasy?.rewardPet === 'string'
        ? vEasy.rewardPet
        : typeof vEasyPet?.name === 'string'
        ? vEasyPet.name
        : typeof vEasyPet?.id === 'string'
        ? vEasyPet.id
        : undefined;

    return {
      id: snap.id,
      title: String(d?.title ?? ""),
      district: typeof d?.district === "string" ? d.district : undefined,
      description: typeof d?.description === "string" ? d.description : undefined,
      imageUrl: typeof easyImageUrl === 'string' ? easyImageUrl : (typeof d?.imageUrl === 'string' ? d.imageUrl : undefined),
      // Accept several shapes for the challenge start coordinates so distance can be
      // computed even if the field is named differently in the DB (GeoPoint, start, startLat/startLng, location)
      location: (() => {
        // Firestore GeoPoint objects expose .latitude and .longitude
        if (d?.location && typeof d.location.latitude === 'number' && typeof d.location.longitude === 'number') {
          return { lat: d.location.latitude, lng: d.location.longitude };
        }
        if (d?.start && typeof d.start.latitude === 'number' && typeof d.start.longitude === 'number') {
          return { lat: d.start.latitude, lng: d.start.longitude };
        }
        // legacy / map shapes
        if (d?.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number') {
          return { lat: d.location.lat, lng: d.location.lng };
        }
        if (d?.start && typeof d.start.lat === 'number' && typeof d.start.lng === 'number') {
          return { lat: d.start.lat, lng: d.start.lng };
        }
        if (typeof d?.startLat === 'number' && typeof d?.startLng === 'number') {
          return { lat: d.startLat, lng: d.startLng };
        }
        // fallback: some datasets expose flat lat/lng fields
        if (typeof d?.lat === 'number' && typeof d?.lng === 'number') {
          return { lat: d.lat, lng: d.lng };
        }
        return undefined;
      })(),
      distanceMeters: typeof d?.distanceMeters === "number" ? d.distanceMeters : undefined,
      estimatedTimeMin,
      difficulty: (["easy", "hard"] as const).includes(d?.difficulty) ? d.difficulty : undefined,
      rewardPet: easyPetName ?? (typeof d?.rewardPet === 'string' ? d.rewardPet : undefined),
      completedCount: typeof d?.completedCount === "number" ? d.completedCount : 0,
      isLocked: Boolean(d?.isLocked),
      stats,
      ratingAvg,
      ratingCount,
      ratingTotal,
    };
  },
};

const metersToKm = (m?: number) =>
  typeof m === "number" ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : "—";
const minutesText = (min?: number) =>
  typeof min === "number" ? `${min} min` : "—";

export default function CListCore({ category, headerTitle, onSelect, onCountChange }: Props) {
  const [items, setItems] = useState<Challenge[]>([]);
  const [displayItems, setDisplayItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const { location: appLocation } = useAppLocation();
  const [userRuns, setUserRuns] = useState<Record<string, VariantCompletionFlags>>({});
  const [runsReady, setRunsReady] = useState(false);
  const userId = auth.currentUser?.uid ?? null;

  const loadUserRuns = useCallback(async () => {
    setRunsReady(false);
    if (!userId) {
      setUserRuns({});
      setRunsReady(true);
      return;
    }
    try {
      const runsSnap = await getDocs(collection(db, "Users", userId, "challengeRuns"));
      const map: Record<string, VariantCompletionFlags> = {};
      runsSnap.forEach((docSnap) => {
        map[docSnap.id] = extractVariantCompletion(docSnap.data());
      });
      setUserRuns(map);
    } catch {
      setUserRuns({});
    } finally {
      setRunsReady(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadUserRuns();
    }, [loadUserRuns]),
  );

  

  // Fetch challenges
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const base = collection(db, 'challenges').withConverter(converter);
        const snap = await getDocs(query(base, where('categoryId', '==', category)));
        const list = snap.docs.map((d) => d.data());
        if (!mounted) return;

        setItems(list);
        onCountChange?.(list.length);
      } catch (e) {
        console.error('Load challenges failed:', e);
        if (mounted) {
          setItems([]);
          onCountChange?.(0);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      onCountChange?.(0);
    };
  }, [category, onCountChange]);

  useEffect(() => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000; // meters
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(hav));
    };

    const loc = appLocation ?? null;
    const augmented = items.map((c) => {
      const cLoc = c.location;
      const dist = loc && cLoc ? haversine(loc, cLoc) : c.distanceMeters ?? Infinity;
      const distanceMeters =
        typeof dist === "number" && Number.isFinite(dist) ? Math.round(dist) : c.distanceMeters;
      const completion = userRuns[c.id];
      const fullyLocked = completion ? isChallengeFullyLocked(completion) : false;
      return {
        ...c,
        distanceMeters,
        isLocked: Boolean(c.isLocked) || fullyLocked,
        userCompletion: completion,
      };
    });

    augmented.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    setDisplayItems(augmented);
  }, [items, appLocation, userRuns]);

  const handleCardPress = useCallback(
    (item: Challenge) => {
      if (!runsReady) return;
      if (item.isLocked || (item.userCompletion && isChallengeFullyLocked(item.userCompletion))) {
        Alert.alert("Challenge locked", "You've already completed this challenge.");
        return;
      }
      onSelect?.(item.id, item.title);
    },
    [onSelect, runsReady],
  );

  const renderItem = ({ item }: { item: Challenge }) => (
    <Pressable
      onPress={() => handleCardPress(item)}
      disabled={!runsReady || item.isLocked}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: CARD_COLORS[category] ?? "rgba(255,255,255,0.95)" },
        pressed && { opacity: 0.96 },
        (item.isLocked || !runsReady) && { opacity: 0.6 },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.imageWrap}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <MaterialCommunityIcons name="map-marker-path" size={30} color="rgba(0,0,0,0.7)" />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>

          {!!item.district && (
            <Text style={styles.metaStrong} numberOfLines={1}>
              <Ionicons name="location-outline" size={14} /> {item.district}
            </Text>
          )}

          <View style={styles.statsRow}>
            <Text style={styles.meta}>
              <Ionicons name="walk-outline" size={14} /> {metersToKm(item.distanceMeters)}
            </Text>
            <Text style={styles.meta}>
              <Ionicons name="time-outline" size={14} /> {minutesText(item.estimatedTimeMin)}
            </Text>
            {item.ratingCount > 0 ? (
              <Text style={styles.meta}>
                <Ionicons name="star" size={14} color="#F59E0B" /> {item.ratingAvg.toFixed(1)} ({item.ratingCount})
              </Text>
            ) : null}
          </View>

          <Text style={styles.meta}>
            <Ionicons name="paw-outline" size={14} /> {item.rewardPet ?? "-"}
          </Text>
        </View>
      </View>

      {item.isLocked ? (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed-outline" size={16} color="#111" />
          <Text style={styles.lockText}>Completed</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={20} />
      )}
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No {headerTitle} challenges yet</Text>
        <Text style={styles.emptySub}>
          Add docs to “challenges” with categoryId = “{category}”.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={displayItems}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#1a1a1a" },
  emptySub: { fontSize: 14, color: "#4b5563", textAlign: "center" },

  card: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 115,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    position: "relative",
  },
  left: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  imageWrap: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  title: { fontSize: 20, fontWeight: "900", color: "#0b1d22" },
  metaStrong: { fontSize: 13.5, color: "#0f172a", marginTop: 2, fontWeight: "700" },
  meta: { fontSize: 13.5, color: "#374151", marginTop: 2 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },

  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: "#F3F4F6",
    position: "absolute",
    top: 12,
    right: 12,
  },
  lockText: { fontSize: 12, fontWeight: "700", color: "#1F2937" },
});
