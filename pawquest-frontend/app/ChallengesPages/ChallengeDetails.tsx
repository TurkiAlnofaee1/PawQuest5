// app/ChallengesPages/ChallengeDetails.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Platform,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../src/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  QueryDocumentSnapshot,
} from "firebase/firestore";

/* ------------------------ category backgrounds ------------------------ */
const defaultBg = require("../../assets/images/ImageBackground.jpg");
const bgByCategory: Record<string, any> = {
  city: require("../../assets/images/Al-Balad.jpg"),
  mountain: require("../../assets/images/ImageBackground.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/ImageBackground.jpg"),
};

/* ------------------------ category palettes ------------------------ */
const PALETTES = {
  city:    { light: "#E8F1FF", mid: "#C7DAFF", strong: "#3B82F6", textOnStrong: "#FFFFFF" },
  mountain:{ light: "#EAF8F2", mid: "#C9F0E0", strong: "#10B981", textOnStrong: "#0B281C" },
  desert:  { light: "#FFF3E7", mid: "#FAD9BB", strong: "#FB923C", textOnStrong: "#2E1A09" },
  sea:     { light: "#EAF2FF", mid: "#C8D8FF", strong: "#2563EB", textOnStrong: "#FFFFFF" },
} as const;
const getPalette = (cat?: string) =>
  PALETTES[(cat || "city").toLowerCase() as keyof typeof PALETTES] ?? PALETTES.city;

/* ----------------------------- types ----------------------------- */
type Variant = {
  xp: number;
  distanceMeters: number;
  estimatedTimeMin: number;
  calories: number;
  steps: number;
  hiitType?: string;
};

type Story = {
  id: string;
  title: string;
  distanceMeters?: number;
  estimatedTimeMin?: number;
  calories?: number;
  hiitType?: string;
};

type ChallengeDoc = {
  title: string;
  categoryId: string;
  imageUrl?: string;
  rewardPet?: string;
  isLocked?: boolean;
  completedCount?: number;
  variants?: { easy?: Variant; hard?: Variant };
  stats?: { storyPlays?: number; challengePlays?: number; rating?: number };
};

/* --------------------------- helpers --------------------------- */
const mToKm = (m?: number) =>
  typeof m === "number" ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : "—";

/* -------------------------- component -------------------------- */
export default function ChallengeDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, category, title } =
    useLocalSearchParams<{ id?: string; category?: string; title?: string }>();

  const [data, setData] = useState<ChallengeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"easy" | "hard">("easy");

  // stories
  const [stories, setStories] = useState<Story[]>([]);
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  // fetch challenge + stories
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) return;

        // challenge
        const ref = doc(db, "challenges", String(id));
        const snap = await getDoc(ref);
        if (snap.exists() && active) {
          const d = snap.data() as ChallengeDoc;
          setData(d);
          if (d.variants?.hard && !d.variants?.easy) setTab("hard");
        }

        // optional stories subcollection
        const sref = collection(db, "challenges", String(id), "stories");
        const ssnap = await getDocs(sref);
        const list: Story[] = ssnap.docs.map((d: QueryDocumentSnapshot) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            title: String(raw?.title ?? "Untitled"),
            distanceMeters: typeof raw?.distanceMeters === "number" ? raw.distanceMeters : undefined,
            estimatedTimeMin: typeof raw?.estimatedTimeMin === "number" ? raw.estimatedTimeMin : undefined,
            calories: typeof raw?.calories === "number" ? raw.calories : undefined,
            hiitType: typeof raw?.hiitType === "string" ? raw.hiitType : undefined,
          };
        });

        if (active) {
          setStories(list);
          if (list.length > 0) setSelectedStoryId(list[0].id);
        }
      } catch (e) {
        console.error("Failed to load challenge:", e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const effectiveCategory = (category || data?.categoryId || "city").toString().toLowerCase();
  const pal = getPalette(effectiveCategory);
  const bgSource = bgByCategory[effectiveCategory] ?? defaultBg;

  const variant: Variant | undefined = useMemo(() => data?.variants?.[tab], [data, tab]);

  const selectedStory = useMemo(
    () => stories.find((s) => s.id === selectedStoryId) || null,
    [stories, selectedStoryId]
  );

  // Stats displayed = story override FIRST, fallback to variant
  const statDistance = selectedStory?.distanceMeters ?? variant?.distanceMeters;
  const statCalories = selectedStory?.calories ?? variant?.calories;
  const statTime = selectedStory?.estimatedTimeMin ?? variant?.estimatedTimeMin;
  const statHiit = selectedStory?.hiitType ?? variant?.hiitType;

  const handleStart = () => {
    router.push({
      pathname: "/ChallengesPages/map",
      params: {
        challengeId: String(id),
        title: data?.title || title || "Challenge",
        category: effectiveCategory,
        difficulty: tab,
        storyId: selectedStory?.id ?? "",
      },
    });
  };

  /* ------------------ loading / not found ------------------ */
  if (loading) {
    return (
      <ImageBackground source={bgSource} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={safeAreaStyle}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (!data) {
    return (
      <ImageBackground source={bgSource} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={safeAreaStyle}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.center}>
            <Text>Challenge not found.</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  /* ------------------------------ UI ------------------------------ */
  return (
    <ImageBackground source={bgSource} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={safeAreaStyle}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} // leave room for fixed footer CTA
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { backgroundColor: "rgba(255,255,255,0.9)" }]}
            >
              <Ionicons name="chevron-back" size={22} color="#0B3D1F" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.titleTop, { color: pal.textOnStrong }]} numberOfLines={1}>
                {data.title || title || "Challenge"}
              </Text>
              <Text style={[styles.subtitle, { color: pal.textOnStrong }]}>
                {effectiveCategory.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(["easy", "hard"] as const).map((t) => {
              const enabled = Boolean(data.variants?.[t]);
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  disabled={!enabled}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tabBtn,
                    { backgroundColor: active ? pal.strong : pal.light, borderColor: pal.mid },
                    !enabled && { opacity: 0.45 },
                  ]}
                >
                  <Text style={[styles.tabText, { color: active ? pal.textOnStrong : "#1F2937" }]}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* (Smartwatch banner removed by request) */}

          {/* BIG Rewards Card (square-ish feature) */}
          <View
            style={[
              styles.rewardCard,
              { borderColor: pal.mid, backgroundColor: "rgba(255,255,255,0.96)" },
            ]}
          >
            <Text style={styles.rewardLabel}>Rewards</Text>
            <View style={styles.rewardSquare}>
              <MaterialCommunityIcons name="bird" size={72} color="#0B3D1F" />
            </View>
            <Text style={styles.rewardPetName}>{data.rewardPet ?? "—"}</Text>
            <View style={[styles.pointsPill, { backgroundColor: pal.light, borderColor: pal.mid }]}>
              <Text style={styles.pointsText}>{variant?.xp ?? 0} points</Text>
            </View>
          </View>

          {/* Choose Story — its own bar */}
          <Pressable
            onPress={() => setStoryPickerOpen(true)}
            style={[
              styles.storyBar,
              { backgroundColor: pal.light, borderColor: pal.mid },
            ]}
          >
            <Text style={styles.storyBarText} numberOfLines={1}>
              {selectedStory?.title ? `Story: ${selectedStory.title}` : "Choose a Story"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
          </Pressable>

          {/* Stats/info card */}
          <View
            style={[
              styles.statsCard,
              { borderColor: pal.mid, backgroundColor: "rgba(255,255,255,0.96)" },
            ]}
          >
            <View style={styles.statsRow}>
              <Text style={styles.statItem}>👣 {mToKm(statDistance)}</Text>
              <Text style={styles.statItem}>🔥 {statCalories ?? "—"} cal</Text>
              <Text style={styles.statItem}>
                <Ionicons name="time-outline" size={14} /> {statTime ?? "—"} min
              </Text>
              <Text style={styles.statItem}>HIIT: {statHiit ?? "—"}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: pal.mid }]} />

            <View style={styles.metaRow}>
              <Text style={styles.smallDim}>
                {(data.stats?.storyPlays ?? 0).toLocaleString()} story plays
              </Text>
              <Text style={styles.smallDim}>
                {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge plays
              </Text>
              <Text style={styles.smallDim}>★ {data.stats?.rating ?? 4.0}</Text>
            </View>
          </View>

          {/* (Connectivity row removed by request) */}
        </ScrollView>

        {/* Fixed footer CTA */}
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable style={styles.cta} onPress={handleStart}>
            <Text style={styles.ctaText}>Start Challenge</Text>
          </Pressable>
        </View>

        {/* Story Picker */}
        <Modal
          visible={storyPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setStoryPickerOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setStoryPickerOpen(false)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choose a Story</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {stories.length === 0 ? (
                  <Text style={styles.modalEmpty}>No stories found</Text>
                ) : (
                  stories.map((s) => {
                    const active = s.id === selectedStoryId;
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.modalItem, active && styles.modalItemActive]}
                        onPress={() => {
                          setSelectedStoryId(s.id);
                          setStoryPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.modalItemText, active && { color: pal.strong }]}>
                          {s.title}
                        </Text>
                        <Text style={styles.modalItemMeta}>
                          {mToKm(s.distanceMeters)} · {s.estimatedTimeMin ?? "—"} min
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

/* ----------------------------- styles ---------------------------- */
const styles = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  titleTop: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "800", opacity: 0.9 },

  tabs: { flexDirection: "row", gap: 12, paddingHorizontal: 12, marginTop: 8 },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 9999, borderWidth: 1 },
  tabText: { fontSize: 15, fontWeight: "900" },

  /* Big rewards feature card */
  rewardCard: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  rewardLabel: { fontSize: 12, color: "#374151", fontWeight: "800", marginBottom: 6 },
  rewardSquare: {
    width: 160,
    height: 160,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  rewardPetName: { marginTop: 10, fontSize: 22, fontWeight: "900", color: "#0B3D1F" },
  pointsPill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pointsText: { fontSize: 14, fontWeight: "900", color: "#0B3D1F" },

  /* Standalone story bar */
  storyBar: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storyBarText: { fontSize: 16, fontWeight: "900", color: "#0B3D1F", flex: 1, marginRight: 10 },

  /* Info card */
  statsCard: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statItem: { fontSize: 14, color: "#111827" },
  divider: { height: 1, marginVertical: 12, opacity: 0.6 },
  metaRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  smallDim: { fontSize: 12, color: "#4B5563" },

  /* fixed footer CTA */
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  cta: {
    backgroundColor: "#BEE3BF",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  ctaText: { fontSize: 16, fontWeight: "900", color: "#0b3d1f" },

  // Picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0B3D1F", marginBottom: 10 },
  modalEmpty: { fontSize: 13, color: "#4B5563", paddingVertical: 10 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: { backgroundColor: "#EFF6FF" },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#0B3D1F" },
  modalItemMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === "ios" ? 12 : 10,
};
