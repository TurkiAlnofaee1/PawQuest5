import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { db } from "../../src/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase/firestore";

type Challenge = {
  id: string;
  title: string;
  district?: string;
  description?: string;
  imageUrl?: string;
  distanceMeters?: number;
  estimatedTimeMin?: number;
  difficulty?: "easy" | "hard";
  rewardPet?: string;
  completedCount?: number;
  isLocked?: boolean;
};

type Props = {
  category: string;
  headerTitle: string;
  onSelect?: (id: string, title: string) => void;
};

// Per-category card color (adjust to your palette)
const CARD_COLORS: Record<string, string> = {
  city:   "rgba(219, 216, 216, 0.95)",
  mountain: "rgba(190, 227, 191, 0.95)",
  desert: "rgba(255, 209, 164, 0.95)",
  sea:    "rgba(180, 205, 255, 0.95)",
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

    return {
      id: snap.id,
      title: String(d?.title ?? ""),
      district: typeof d?.district === "string" ? d.district : undefined,
      description: typeof d?.description === "string" ? d.description : undefined,
      imageUrl: typeof d?.imageUrl === "string" ? d.imageUrl : undefined,
      distanceMeters: typeof d?.distanceMeters === "number" ? d.distanceMeters : undefined,
      estimatedTimeMin,
      difficulty: (["easy", "hard"] as const).includes(d?.difficulty) ? d.difficulty : undefined,
      rewardPet: typeof d?.rewardPet === "string" ? d.rewardPet : undefined,
      completedCount: typeof d?.completedCount === "number" ? d.completedCount : 0,
      isLocked: Boolean(d?.isLocked),
    };
  },
};

const metersToKm = (m?: number) =>
  typeof m === "number" ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : "—";
const minutesText = (min?: number) =>
  typeof min === "number" ? `${min} min` : "—";

export default function CListCore({ category, headerTitle, onSelect }: Props) {
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const base = collection(db, "challenges").withConverter(converter);
        const snap = await getDocs(query(base, where("categoryId", "==", category)));
        const list = snap.docs.map((d) => d.data());
        if (mounted) setItems(list);
      } catch (e) {
        console.error("Load challenges failed:", e);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [category]);

  const renderItem = ({ item }: { item: Challenge }) => (
    <Pressable
      onPress={() => onSelect?.(item.id, item.title)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: CARD_COLORS[category] ?? "rgba(255,255,255,0.95)" },
        pressed && { opacity: 0.96 },
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

          <Text style={styles.meta}>
            <Ionicons name="walk-outline" size={14} /> {metersToKm(item.distanceMeters)} ·{" "}
            <Ionicons name="time-outline" size={14} /> {minutesText(item.estimatedTimeMin)}
          </Text>

          <Text style={styles.meta}>
            <Ionicons name="paw-outline" size={14} /> {item.rewardPet ?? "—"}
          </Text>
        </View>
      </View>

      {item.isLocked ? (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed-outline" size={16} color="#111" />
          <Text style={styles.lockText}>Locked</Text>
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
      data={items}
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

  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: "#F3F4F6",
  },
  lockText: { fontSize: 12, fontWeight: "700", color: "#1F2937" },
});
