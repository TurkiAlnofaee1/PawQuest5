// app/(tabs)/ChallengesPages/ChallengeDetails.tsx
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

const bgImage = require("../../assets/images/ImageBackground.jpg");

/* ---------- Types ---------- */
type Variant = {
  xp: number;
  distanceMeters: number;
  estimatedTimeMin: number;
  calories: number;
  steps: number;
  hiitType?: string;
  smartwatchRequired?: boolean;
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
  info?: { smartwatch?: string; gps?: string; headphones?: string };
};

/* ---------- Helpers ---------- */
const mToKm = (m?: number) =>
  typeof m === "number" ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : "—";

/* ---------- Component ---------- */
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

        // stories subcollection (optional)
        const sref = collection(db, "challenges", String(id), "stories");
        const ssnap = await getDocs(sref);
        const list: Story[] = ssnap.docs.map((d: QueryDocumentSnapshot) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            title: String(raw?.title ?? "Untitled"),
            distanceMeters:
              typeof raw?.distanceMeters === "number" ? raw.distanceMeters : undefined,
            estimatedTimeMin:
              typeof raw?.estimatedTimeMin === "number" ? raw.estimatedTimeMin : undefined,
            calories: typeof raw?.calories === "number" ? raw.calories : undefined,
            hiitType: typeof raw?.hiitType === "string" ? raw.hiitType : undefined,
          };
        });

        if (active) {
          setStories(list);
          // default to first story if exists
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

  const variant: Variant | undefined = useMemo(
    () => data?.variants?.[tab],
    [data, tab]
  );

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
        category: category || data?.categoryId || "",
        difficulty: tab,
        storyId: selectedStory?.id ?? "",
      },
    });
  };

  /* ---------- Loading / Not found ---------- */
  if (loading) {
    return (
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
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
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={safeAreaStyle}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.center}>
            <Text>Challenge not found.</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  /* ---------- UI ---------- */
  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={safeAreaStyle}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#0B3D1F" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.titleTop}>{data.title || title || "Challenge"}</Text>
              <Text style={styles.subtitle}>
                {category ? String(category).toUpperCase() : ""}
              </Text>
            </View>
          </View>

          {/* Tabs — spaced out a bit more */}
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
                    active && styles.tabActive,
                    !enabled && { opacity: 0.45 },
                  ]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Banner (different colors) */}
          {variant?.smartwatchRequired ? (
            <View style={[styles.banner, styles.bannerRequired]}>
              <Text style={styles.bannerTitle}>Smartwatch required</Text>
              <Text style={styles.bannerSub}>
                This level needs a connected smartwatch to track heart rate or HIIT workout.
              </Text>
            </View>
          ) : (
            <View style={[styles.banner, styles.bannerBefore]}>
              <Text style={styles.bannerTitle}>BEFORE YOU START</Text>
              <Text style={styles.bannerSub}>
                For best results, connect a smartwatch and headphones.
              </Text>
            </View>
          )}

          {/* Reward card */}
          <View style={styles.rewardCard}>
            <Text style={styles.rewardLabel}>Rewards</Text>
            <View style={styles.rewardPet}>
              <MaterialCommunityIcons name="bird" size={36} color="#0B3D1F" />
              <Text style={styles.rewardPetName}>{data.rewardPet ?? "—"}</Text>
            </View>
            <View style={styles.pointsPill}>
              <Text style={styles.pointsText}>{variant?.xp ?? 0} points</Text>
            </View>
          </View>

          {/* Stats card with Story picker */}
          <View style={styles.statsCard}>
            {/* Story header line */}
            <Pressable
              style={styles.statsHeader}
              onPress={() => setStoryPickerOpen(true)}
            >
              <Text style={styles.statsTitle}>
                {selectedStory?.title ?? "Choose a Story"}{" "}
                <Text style={{ color: "#0B3D1F" }}>▾</Text>
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Text style={styles.smallDim}>
                  {(data.stats?.storyPlays ?? 0).toLocaleString()} story plays
                </Text>
                <Text style={styles.smallDim}>
                  {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge plays
                </Text>
                <Text style={styles.smallDim}>★ {data.stats?.rating ?? 4.0}</Text>
              </View>
            </Pressable>

            <View style={styles.statsRow}>
              <Text style={styles.statItem}>👣 {mToKm(statDistance)}</Text>
              <Text style={styles.statItem}>🔥 {statCalories ?? "—"} cal</Text>
              <Text style={styles.statItem}>
                <Ionicons name="time-outline" size={14} /> {statTime ?? "—"} min
              </Text>
              <Text style={styles.statItem}>HIIT: {statHiit ?? "—"}</Text>
            </View>
          </View>

          {/* Connectivity line */}
          <View style={styles.connectLine}>
            <Text style={styles.connectText}>
              Smartwatch: {data.info?.smartwatch ?? "Not Connected"}
            </Text>
            <Text style={styles.connectText}>GPS: {data.info?.gps ?? "Active"}</Text>
            <Text style={styles.connectText}>
              Headphones: {data.info?.headphones ?? "Connected"}
            </Text>
          </View>

          {/* CTA */}
          <Pressable style={styles.cta} onPress={handleStart}>
            <Text style={styles.ctaText}>Start Challenge</Text>
          </Pressable>
        </ScrollView>

        {/* Story Picker (scrollable) */}
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
                        <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>
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

/* ---------- Styles ---------- */
const SKY_50 = "#EFF6FF";
const SKY_100 = "#DBEAFE";
const SKY_200 = "#BFDBFE";
const SKY_300 = "#93C5FD";
const SKY_700 = "#1D4ED8";
const AMBER_100 = "#FEF3C7";

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
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  titleTop: { fontSize: 22, fontWeight: "800", color: "#0B3D1F" },
  subtitle: { fontSize: 12, fontWeight: "700", color: "#2563EB" },

  tabs: {
    flexDirection: "row",
    gap: 12, // more spacing between buttons
    paddingHorizontal: 12,
    marginTop: 8,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: SKY_100, // sky
    borderWidth: 1,
    borderColor: SKY_200,
  },
  tabActive: { backgroundColor: SKY_300 },
  tabText: { fontSize: 15, fontWeight: "800", color: "#1F2937" },
  tabTextActive: { color: "white" },

  banner: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  bannerBefore: {
    backgroundColor: SKY_50,
    borderColor: SKY_200,
  },
  bannerRequired: {
    backgroundColor: AMBER_100,
    borderColor: "#FCD34D",
  },
  bannerTitle: { fontSize: 13, fontWeight: "900", color: "#111827" },
  bannerSub: { fontSize: 12, color: "#374151", marginTop: 6 },

  rewardCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: SKY_200,
    alignItems: "center",
    gap: 8,
  },
  rewardLabel: { fontSize: 12, color: "#374151", fontWeight: "800" },
  rewardPet: { flexDirection: "row", alignItems: "center", gap: 10 },
  rewardPetName: { fontSize: 16, fontWeight: "900", color: "#0B3D1F" },
  pointsPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: SKY_100,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: SKY_200,
  },
  pointsText: { fontSize: 12, fontWeight: "900", color: "#0B3D1F" },

  statsCard: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: SKY_200,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statsTitle: { fontSize: 15, fontWeight: "900", color: "#0B3D1F" },
  smallDim: { fontSize: 12, color: "#4B5563" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statItem: { fontSize: 13, color: "#111827" },

  connectLine: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: SKY_50,
    borderWidth: 1,
    borderColor: SKY_200,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  connectText: { fontSize: 12, color: "#0B3D1F", fontWeight: "700" },

  cta: {
    marginHorizontal: 16,
    marginTop: 16,
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
  modalItemActive: { backgroundColor: SKY_50 },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#0B3D1F" },
  modalItemTextActive: { color: SKY_700 },
  modalItemMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === "ios" ? 12 : 10,
};
