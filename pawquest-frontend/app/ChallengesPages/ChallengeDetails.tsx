// app/ChallengesPages/ChallengeDetails.tsx
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
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db } from "../../src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  ChallengeStats,
  getChallengeRatingStats,
  getUserChallengeRating,
} from "../../src/lib/firestoreChallenges";
import { formalizeStory } from "../../src/lib/services/aiFormalize";
import { generateVoiceFromElevenLabs } from "../../src/lib/services/ttsEleven";

/* ------------------------ category backgrounds ------------------------ */
const defaultBg = require("../../assets/images/ImageBackground.jpg");
const bgByCategory: Record<string, any> = {
  city: require("../../assets/images/Riyadd.jpg"),
  mountain: require("../../assets/images/ImageBackground.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/ImageBackground.jpg"),
};

/* ------------------------ category palettes ------------------------ */
const PALETTES = {
  city: {
    light: "#E8F1FF",
    mid: "#C7DAFF",
    strong: "#3B82F6",
    textOnStrong: "#FFFFFF",
  },
  mountain: {
    light: "#EAF8F2",
    mid: "#C9F0E0",
    strong: "#10B981",
    textOnStrong: "#0B281C",
  },
  desert: {
    light: "#FFF3E7",
    mid: "#FAD9BB",
    strong: "#FB923C",
    textOnStrong: "#2E1A09",
  },
  sea: {
    light: "#EAF2FF",
    mid: "#C8D8FF",
    strong: "#2563EB",
    textOnStrong: "#FFFFFF",
  },
} as const;
const getPalette = (cat?: string) =>
  PALETTES[(cat || "city").toLowerCase() as keyof typeof PALETTES] ??
  PALETTES.city;

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
  typeof m === "number"
    ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`
    : "—";

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

  // ✅ Only these two story options now
  const [stories, setStories] = useState<Story[]>([]);
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  // AI audio modal state
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiSourceText, setAiSourceText] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // audioUri to pass to map (NOT played here)
  const [audioUri, setAudioUri] = useState<string | null>(null);

  // animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const rewardAnim = useRef(new Animated.Value(0)).current;
  const statsAnim = useRef(new Animated.Value(0)).current;

  /* ----------------- fetch challenge + base stories ----------------- */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) return;

        // challenge doc
        const ref = doc(db, "challenges", String(id));
        const snap = await getDoc(ref);
        if (snap.exists() && active) {
          const d = snap.data() as ChallengeDoc;
          setData(d);
          if (d.variants?.hard && !d.variants?.easy) setTab("hard");
        }

        // ✅ Only two options:
        const baseStories: Story[] = [
          { id: "none", title: "🚫 No Audio Story" },
          { id: "ai", title: "🎧 AI Audio Story (paste your text)" },
        ];

        if (active) {
          setStories(baseStories);
          setSelectedStoryId("none");
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

  /* ----------------- animations once data is loaded ----------------- */
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

  /* ----------------- rating stats on focus ----------------- */
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
            console.warn(
              "[ChallengeDetails] rating stats fetch failed",
              error
            );
          }
        }
      })();

      return () => {
        active = false;
      };
    }, [id])
  );

  const effectiveCategory = (
    category || data?.categoryId || "city"
  ).toString().toLowerCase();
  const pal = getPalette(effectiveCategory);
  const bgSource = bgByCategory[effectiveCategory] ?? defaultBg;

  const variant: Variant | undefined = useMemo(
    () => data?.variants?.[tab],
    [data, tab]
  );

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
    [headerAnim]
  );

  const rewardScale = useMemo(
    () =>
      rewardAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1],
      }),
    [rewardAnim]
  );

  const statsTranslateY = useMemo(
    () =>
      statsAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [24, 0],
      }),
    [statsAnim]
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
    if (
      typeof data?.rewardPoints === "number" &&
      Number.isFinite(data.rewardPoints)
    ) {
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

  /* ---------------------- AI modal handlers ---------------------- */

  const handleOpenAiModal = () => {
    if (selectedStoryId === "ai") {
      setAiModalVisible(true);
    } else {
      Alert.alert("AI audio not selected", "Pick 'AI Audio Story' first.");
    }
  };

  const handleSummarize = async () => {
    if (!aiSourceText.trim()) {
      Alert.alert("Add text first", "Paste or type your story or page.");
      return;
    }
    setAiLoading(true);
    try {
      const approxMinutes = statTime ?? 30;
      const prompt = `
You are writing a motivational running audio story.

User provided text:
${aiSourceText}

Task:
- Summarize / adapt this content into an engaging, energetic story
- Target duration when spoken: about ${approxMinutes} minutes
- Insert short motivational lines throughout
- Return only the story text, no explanations.
      `.trim();

      const result = await formalizeStory(prompt);
      const bytes = new TextEncoder().encode(result).length;
      if (bytes > 1_000_000) {
        setAiSummary(
          "⚠️ AI story is too long (over 1MB). Try shorter input or reduce text."
        );
      } else {
        setAiSummary(result);
      }
    } catch (err) {
      console.error("❌ Gemini summarize error:", err);
      Alert.alert("AI Error", "Failed to summarize story.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateAudio = async () => {
    const text = aiSummary.trim() || aiSourceText.trim();
    if (!text) {
      Alert.alert(
        "No story text",
        "Summarize first or provide text for audio."
      );
      return;
    }

    setAiLoading(true);
    try {
      console.log("🎧 Sending text to ElevenLabs...");
      // 👉 Only generate URI, don't play here
      const uri = await generateVoiceFromElevenLabs(text);
      setAudioUri(uri);
      Alert.alert(
        "Audio Ready",
        "ElevenLabs audio is generated and will be available in the challenge screen."
      );
    } catch (err) {
      console.error("🎧 ElevenLabs audio error:", err);
      Alert.alert(
        "Audio Error",
        String(err instanceof Error ? err.message : err)
      );
    } finally {
      setAiLoading(false);
    }
  };

  /* ---------------------- start challenge ---------------------- */

  const handleStart = () => {
    if (!id) {
      Alert.alert("Missing challenge id");
      return;
    }

    // If AI story selected, ensure we have an audioUri
    const finalAudioUri =
      selectedStoryId === "ai" && audioUri ? audioUri : "";

    router.push({
      pathname: "/ChallengesPages/map",
      params: {
        challengeId: String(id),
        title: data?.title || title || "Challenge",
        category: effectiveCategory,
        difficulty: tab,
        storyId: selectedStory?.id ?? "",
        audioUri: finalAudioUri,
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
          contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{ translateY: headerTranslateY }],
              },
            ]}
          >
            <Pressable
              onPress={() => router.back()}
              style={[
                styles.backBtn,
                { backgroundColor: "rgba(255,255,255,0.9)" },
              ]}
            >
              <Ionicons name="chevron-back" size={22} color="#0B3D1F" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.titleTop, { color: pal.textOnStrong }]}
                numberOfLines={1}
              >
                {data.title || title || "Challenge"}
              </Text>
              <Text style={[styles.subtitle, { color: pal.textOnStrong }]}>
                {effectiveCategory.toUpperCase()}
              </Text>
            </View>
          </Animated.View>

          {/* Tabs (easy/hard) */}
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
                      backgroundColor: active ? pal.strong : pal.light,
                      borderColor: pal.mid,
                    },
                    !enabled && { opacity: 0.45 },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? pal.textOnStrong : "#1F2937" },
                    ]}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Rewards Card */}
          <Animated.View
            style={[
              styles.rewardCard,
              {
                borderColor: pal.mid,
                backgroundColor: "rgba(255,255,255,0.96)",
                opacity: rewardAnim,
                transform: [{ scale: rewardScale }],
              },
            ]}
          >
            <Text style={styles.rewardLabel}>Rewards</Text>
            <View style={styles.rewardSquare}>
              {rewardImage ? (
                <Image
                  source={{ uri: rewardImage }}
                  style={styles.rewardImage}
                  resizeMode="contain"
                />
              ) : (
                <MaterialCommunityIcons
                  name="bird"
                  size={72}
                  color="#0B3D1F"
                />
              )}
            </View>
            <Text style={styles.rewardPetName}>
              {data.rewardPet ?? "-"}
            </Text>
            <View
              style={[
                styles.pointsPill,
                { backgroundColor: pal.light, borderColor: pal.mid },
              ]}
            >
              <Text style={styles.pointsText}>
                {rewardPoints !== null
                  ? `${Math.round(rewardPoints).toLocaleString()} points`
                  : "Reward awaits!"}
              </Text>
            </View>
          </Animated.View>

          {/* Story choice bar */}
          <Pressable
            onPress={() => setStoryPickerOpen(true)}
            style={[
              styles.storyBar,
              { backgroundColor: pal.light, borderColor: pal.mid },
            ]}
          >
            <Text style={styles.storyBarText} numberOfLines={1}>
              {selectedStoryId === "none"
                ? "Story: No audio"
                : selectedStoryId === "ai"
                ? "Story: AI Audio Story (tap to configure)"
                : selectedStory?.title
                ? `Story: ${selectedStory.title}`
                : "Choose a Story"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
          </Pressable>

          {/* Small button to open AI modal when AI story selected */}
          {selectedStoryId === "ai" && (
            <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.aiConfigBtn}
                onPress={handleOpenAiModal}
              >
                <Text style={styles.aiConfigText}>
                  ✨ Configure AI Story & Audio
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats / info card */}
          <Animated.View
            style={[
              styles.statsCard,
              {
                borderColor: pal.mid,
                backgroundColor: "rgba(255,255,255,0.96)",
                opacity: statsAnim,
                transform: [{ translateY: statsTranslateY }],
              },
            ]}
          >
            <View style={styles.statsRow}>
              <Text style={styles.statItem}>👣 {mToKm(statDistance)}</Text>
              <Text style={styles.statItem}>🔥 {statCalories ?? "—"} cal</Text>
              <Text style={styles.statItem}>
                <Ionicons name="time-outline" size={14} />{" "}
                {statTime ?? "—"} min
              </Text>
              <Text style={styles.statItem}>HIIT: {statHiit ?? "—"}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: pal.mid }]} />

            <View style={styles.metaRow}>
              <Text style={styles.smallDim}>
                {(data.stats?.storyPlays ?? 0).toLocaleString()} story plays
              </Text>
              <Text style={styles.smallDim}>
                {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge
                plays
              </Text>
              {ratingStats && ratingStats.ratingCount > 0 ? (
                <Text style={styles.smallDim}>
                  ★ {ratingStats.ratingAvg.toFixed(1)} (
                  {ratingStats.ratingCount})
                </Text>
              ) : null}
              {userRating ? (
                <Text style={[styles.smallDim, styles.smallDimOwn]}>
                  your rating: {userRating}★
                </Text>
              ) : null}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Fixed footer CTA */}
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable style={styles.cta} onPress={handleStart}>
            <Text style={styles.ctaText}>Start Challenge</Text>
          </Pressable>
        </View>

        {/* Story Picker Bottom Sheet */}
        <Modal
          visible={storyPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setStoryPickerOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setStoryPickerOpen(false)}
          >
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
                        style={[
                          styles.modalItem,
                          active && styles.modalItemActive,
                        ]}
                        onPress={() => {
                          setSelectedStoryId(s.id);
                          setStoryPickerOpen(false);
                          if (s.id === "ai") {
                            setAiModalVisible(true);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.modalItemText,
                            active && { color: pal.strong },
                          ]}
                        >
                          {s.title}
                        </Text>
                        <Text style={styles.modalItemMeta}>
                          {mToKm(s.distanceMeters)} ·{" "}
                          {s.estimatedTimeMin ?? "—"} min
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* AI Audio Bottom Sheet */}
        <Modal
          visible={aiModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAiModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setAiModalVisible(false)}
          >
            <View style={styles.aiSheet}>
              <Text style={styles.modalTitle}>AI Audio Story</Text>
              <Text style={styles.aiHint}>
                Paste your text or page below. We’ll summarize it to roughly{" "}
                {statTime ?? 30} minutes, then generate audio once with
                ElevenLabs. The audio will be available when you start the
                challenge.
              </Text>

              <TextInput
                style={styles.aiInput}
                placeholder="Paste your text here..."
                placeholderTextColor="#6A6A6A"
                multiline
                value={aiSourceText}
                onChangeText={setAiSourceText}
              />

              <TouchableOpacity
                style={[
                  styles.aiBtn,
                  { backgroundColor: "#111", marginTop: 10 },
                ]}
                onPress={handleSummarize}
                disabled={aiLoading}
                activeOpacity={0.8}
              >
                {aiLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.aiBtnText}>✨ Summarize with AI</Text>
                )}
              </TouchableOpacity>

              {aiSummary ? (
                <View style={styles.aiSummaryBox}>
                  <Text style={styles.aiSummaryTitle}>AI Story Preview</Text>
                  <ScrollView style={{ maxHeight: 160 }}>
                    <Text style={styles.aiSummaryText}>{aiSummary}</Text>
                  </ScrollView>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.aiBtn,
                  { backgroundColor: "#294125", marginTop: 10 },
                ]}
                onPress={handleGenerateAudio}
                disabled={aiLoading}
                activeOpacity={0.8}
              >
                {aiLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.aiBtnText}>
                    🎧 Generate Voice (ElevenLabs)
                  </Text>
                )}
              </TouchableOpacity>
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
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 9999,
    borderWidth: 1,
  },
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
  rewardLabel: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "800",
    marginBottom: 6,
  },
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
  rewardPetName: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "900",
    color: "#0B3D1F",
  },
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
  storyBarText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B3D1F",
    flex: 1,
    marginRight: 10,
  },

  aiConfigBtn: {
    backgroundColor: "rgba(11,61,31,0.9)",
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  aiConfigText: { color: "#fff", fontWeight: "800", fontSize: 14 },

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
  smallDimOwn: {
    fontSize: 12,
    color: "#4B5563",
    opacity: 0.8,
    fontStyle: "italic",
  },

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
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B3D1F",
    marginBottom: 10,
  },
  modalEmpty: { fontSize: 13, color: "#4B5563", paddingVertical: 10 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: { backgroundColor: "#EFF6FF" },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#0B3D1F" },
  modalItemMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },

  /* AI sheet bottom modal */
  aiSheet: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  aiHint: {
    fontSize: 12,
    color: "#4B5563",
    marginBottom: 8,
  },
  aiInput: {
    minHeight: 100,
    maxHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#F9FAFB",
    textAlignVertical: "top",
  },
  aiBtn: {
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 11,
  },
  aiBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  aiSummaryBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    padding: 10,
  },
  aiSummaryTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    color: "#111827",
  },
  aiSummaryText: {
    fontSize: 13,
    color: "#111827",
  },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === "ios" ? 12 : 10,
};
