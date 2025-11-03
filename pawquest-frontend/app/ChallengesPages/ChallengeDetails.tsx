// app/ChallengesPages/ChallengeDetails.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Pressable,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Platform,
  Modal,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../src/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  ChallengeStats,
  getChallengeRatingStats,
  getUserChallengeRating,
} from "../../src/lib/firestoreChallenges";

/* ------------------------ category backgrounds ------------------------ */
const defaultBg = require("../../assets/images/ImageBackground.jpg");
const bgByCategory: Record<string, any> = {
  city: require("../../assets/images/Riyadd.jpg"),
  mountain: require("../../assets/images/mountainss.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/seaa.jpg"),
};

/* ------------------------ category palettes ------------------------ */
// Rich, named palette per category to color every element on the page.
// Keys keep backwards-compat (light/mid/strong/textOnStrong) and add specific roles.
const PALETTES = {
   city: {
    light: "#EDEEF0",      // subtle concrete gray
    mid: "#BFC5CE",        // mid gray-blue accent
    strong: "#4B5563",     // deep slate (headings / buttons)
    textOnStrong: "#FFFFFF",

    easyBg: "#4B5563",
    hardBg: "#4B5563",
    tabBorder: "#BFC5CE",
    rewardCardBg: "#D2D7DD",
    rewardSquareBg: "#EDEEF0",
    pointsPillBg: "#EDEEF0",
    storyBarBg: "#EDEEF0",
    statsCardBg: "#EDEEF0",
    divider: "#000000ff",
    ctaBg: "#4B5563",
    ctaText: "#FFFFFF",
  },

  mountain: {
    light: "#FFECEB",      // gentle rosy fog
    mid: "#F8B4AB",        // light red-coral midtone
    strong: "#E11D48",     // bold crimson accent
    textOnStrong: "#FFFFFF",

    easyBg: "#f86459ff",
    hardBg: "#f86459ff",
    tabBorder: "#F8B4AB",
    rewardCardBg: "#F8B4AB",
    rewardSquareBg: "#FFECEB",
    pointsPillBg: "#FFECEB",
    storyBarBg: "#FFECEB",
    statsCardBg: "#FFECEB",
    divider: "#663232ff",
    ctaBg: "#f86459ff",
    ctaText: "#FFFFFF",
  },

  desert: {
    light: "#FFF2E0",      // pale sand
    mid: "#F6C995",        // golden beige
    strong: "#D97706",     // warm burnt orange
    textOnStrong: "#2C1500",

    easyBg: "#D97706",
    hardBg: "#D97706",
    tabBorder: "#F6C995",
    rewardCardBg: "#F6C995",
    rewardSquareBg: "#FFF2E0",
    pointsPillBg: "#FFF2E0",
    storyBarBg: "#FFF2E0",
    statsCardBg: "#FFF2E0",
    divider: "#834821ff",
    ctaBg: "#D97706",
    ctaText: "#2C1500",
  },

  sea: {
    light: "#E6F6FF",      // soft sky aqua
    mid: "#9EDBFF",        // medium turquoise
    strong: "#0284C7",     // vivid ocean blue
    textOnStrong: "#FFFFFF",

    easyBg: "#0284C7",
    hardBg: "#0284C7",
    tabBorder: "#9EDBFF",
    rewardCardBg: "#9EDBFF",
    rewardSquareBg: "#E6F6FF",
    pointsPillBg: "#E6F6FF",
    storyBarBg: "#E6F6FF",
    statsCardBg: "#E6F6FF",
    divider: "#3f9af0ff",
    ctaBg: "#0284C7",
    ctaText: "#FFFFFF",
  },
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
  petImageUrl?: string;
  rewardPoints?: number;
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
  const [ratingStats, setRatingStats] = useState<ChallengeStats | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);

  // stories
  const [stories, setStories] = useState<Story[]>([]);
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const rewardAnim = useRef(new Animated.Value(0)).current;
  const statsAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (loading || !data) return;
    headerAnim.setValue(0);
    rewardAnim.setValue(0);
    statsAnim.setValue(0);
    Animated.stagger(120, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rewardAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(statsAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [loading, data, headerAnim, rewardAnim, statsAnim]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const normalizedId =
        typeof id === "string"
          ? id
          : Array.isArray(id)
          ? id[0]
          : typeof id === "number"
          ? String(id)
          : null;

      if (!normalizedId) {
        setRatingStats(null);
        setUserRating(null);
        return () => {
          active = false;
        };
      }

      (async () => {
        try {
          const stats = await getChallengeRatingStats(normalizedId);
          const uid = auth.currentUser?.uid ?? null;
          let mine: number | null = null;
          if (uid) {
            mine = await getUserChallengeRating(normalizedId, uid);
          }
          if (active) {
            setRatingStats(stats);
            setUserRating(mine);
          }
        } catch (error) {
          if (active) {
            setRatingStats(null);
          }
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[ChallengeDetails] rating stats fetch failed", error);
          }
        }
      })();

      return () => {
        active = false;
      };
    }, [id]),
  );

  const effectiveCategory = (category || data?.categoryId || "city").toString().toLowerCase();
  const pal = getPalette(effectiveCategory);
  const bgSource = bgByCategory[effectiveCategory] ?? defaultBg;

  const variant: Variant | undefined = useMemo(() => data?.variants?.[tab], [data, tab]);

  const selectedStory = useMemo(
    () => stories.find((s) => s.id === selectedStoryId) || null,
    [stories, selectedStoryId]
  );

  const headerTranslateY = useMemo(
    () =>
      headerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-18, 0],
      }),
    [headerAnim],
  );

  const rewardScale = useMemo(
    () =>
      rewardAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
      }),
    [rewardAnim],
  );

  const statsTranslateY = useMemo(
    () =>
      statsAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [24, 0],
      }),
    [statsAnim],
  );

  const rewardImage = useMemo(() => {
    if (!data) return null;
    if (typeof data.petImageUrl === "string" && data.petImageUrl.length > 0) {
      return data.petImageUrl;
    }
    if (typeof data.imageUrl === "string" && data.imageUrl.length > 0) {
      return data.imageUrl;
    }
    return null;
  }, [data]);

  const rewardPoints = useMemo(() => {
    if (typeof data?.rewardPoints === "number" && Number.isFinite(data.rewardPoints)) {
      return data.rewardPoints;
    }
    if (typeof variant?.xp === "number" && Number.isFinite(variant.xp)) {
      return variant.xp;
    }
    return null;
  }, [data, variant]);

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
          <Animated.View
            style={[
              styles.header,
              { opacity: headerAnim, transform: [{ translateY: headerTranslateY }] },
            ]}
          >
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
          </Animated.View>

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
                    {
                      backgroundColor: active ? (t === "easy" ? pal.easyBg : pal.hardBg) : pal.light,
                      borderColor: pal.tabBorder,
                    },
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
          <Animated.View
            style={[
              styles.rewardCard,
              {
                borderColor: pal.tabBorder,
                backgroundColor: pal.rewardCardBg,
                opacity: rewardAnim,
                transform: [{ scale: rewardScale }],
              },
            ]}
          >
            <Text style={styles.rewardLabel}>Rewards</Text>
            <View style={[styles.rewardSquare, { backgroundColor: pal.rewardSquareBg }]}>
              {rewardImage ? (
                <Image source={{ uri: rewardImage }} style={styles.rewardImage} resizeMode="contain" />
              ) : (
                <MaterialCommunityIcons name="bird" size={72} color="#0B3D1F" />
              )}
            </View>
            <Text style={styles.rewardPetName}>{data.rewardPet ?? "-"}</Text>
            <View style={[styles.pointsPill, { backgroundColor: pal.pointsPillBg, borderColor: pal.tabBorder }]}>
              <Text style={styles.pointsText}>
                {rewardPoints !== null ? `${Math.round(rewardPoints).toLocaleString()} points` : "Reward awaits!"}
              </Text>
            </View>
          </Animated.View>

          {/* Choose Story — its own bar */}
          <Pressable
            onPress={() => setStoryPickerOpen(true)}
            style={[
              styles.storyBar,
              { backgroundColor: pal.storyBarBg, borderColor: pal.tabBorder },
            ]}
          >
            <Text style={styles.storyBarText} numberOfLines={1}>
              {selectedStory?.title ? `Story: ${selectedStory.title}` : "Choose a Story"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
          </Pressable>

          {/* Stats/info card */}
          <Animated.View
            style={[
              styles.statsCard,
              {
                borderColor: pal.tabBorder,
                backgroundColor: pal.statsCardBg,
                opacity: statsAnim,
                transform: [{ translateY: statsTranslateY }],
              },
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

            <View style={[styles.divider, { backgroundColor: pal.divider }]} />

          <View style={styles.metaRow}>
            <Text style={styles.smallDim}>
              {(data.stats?.storyPlays ?? 0).toLocaleString()} story plays
            </Text>
            <Text style={styles.smallDim}>
              {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge plays
            </Text>
            {ratingStats && ratingStats.ratingCount > 0 ? (
              <Text style={styles.smallDim}>
                ★ {ratingStats.ratingAvg.toFixed(1)} ({ratingStats.ratingCount})
              </Text>
            ) : null}
            {userRating ? (
              <Text style={[styles.smallDim, styles.smallDimOwn]}>
                your rating: {userRating}★
              </Text>
            ) : null}
          </View>
        </Animated.View>

          {/* (Connectivity row removed by request) */}
        </ScrollView>

        {/* Fixed footer CTA */}
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            style={[styles.cta, { backgroundColor: pal.ctaBg, borderColor: pal.tabBorder }]}
            onPress={handleStart}
          >
            <Text style={[styles.ctaText, { color: pal.ctaText }]}>Start Challenge</Text>
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
                        style={[styles.modalItem, active && styles.modalItemActive, active && { backgroundColor: pal.light }]}
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
    overflow: "hidden",
  },
  rewardImage: { width: "100%", height: "100%" },
  rewardPetName: { marginTop: 10, fontSize: 22, fontWeight: "900", color: "#000000ff" },
  pointsPill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pointsText: { fontSize: 14, fontWeight: "900", color: "#000000ff" },

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
  storyBarText: { fontSize: 16, fontWeight: "900", color: "#000000ff", flex: 1, marginRight: 10 },

  /* Info card */
  statsCard: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statItem: { fontSize: 14, color: "#000000ff" },
  divider: { height: 1, marginVertical: 12, opacity: 0.6 },
  metaRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  smallDim: { fontSize: 12, color: "#252525ff" },
  smallDimOwn: { fontSize: 12, color: "#252525ff", opacity: 0.8, fontStyle: "italic" },

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
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#000000ff", marginBottom: 10 },
  modalEmpty: { fontSize: 13, color: "#4B5563", paddingVertical: 10 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: { backgroundColor: "#EFF6FF" },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#000000ff" },
  modalItemMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === "ios" ? 12 : 10,
};
