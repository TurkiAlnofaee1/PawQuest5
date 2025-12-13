// app/ChallengesPages/QuickChallengeDetails.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "@/src/lib/firebase";
import {
  loadStoryPickerData,
  SeasonSection,
  StoryOption,
} from "@/src/lib/storyPicker";
import { PET_MAX_LEVEL, PET_XP_PER_LEVEL } from "@/src/lib/playerProgress";
import { formalizeStory } from "@/src/lib/services/aiFormalize";
import { generateVoiceFromElevenLabs } from "@/src/lib/services/ttsEleven";

const bgImage = require("../../assets/images/ImageBackground.jpg");

const QUICK_CHALLENGE_ID = "quick-challenge";
const QUICK_VARIANT_ID: "easy" | "hard" = "easy";

/** AI Story from Firestore */
type AiStory = {
  id: string;
  title: string;
  text: string;
};

/** Payload we send to QuickRun (extends StorySegments) */
type QuickStoryPayload = {
  id: string;
  progressKey: string;
  type: "pet" | "season";
  challengeId: string;
  variantId: "easy" | "hard";
  title: string;
  subtitle?: string | null;
  segmentUrls: string[];
  distanceMeters?: number | null;
  durationMinutes?: number | null;
  estimatedTimeMin?: number | null;
  playMode?: "segments" | "single";
};

const mToKm = (m?: number | null) =>
  typeof m === "number" && Number.isFinite(m)
    ? `${(m / 1000).toFixed(1)} km`
    : "—";

const timeLabelForStory = (story: StoryOption) => {
  const primary =
    typeof story.durationMinutes === "number" && Number.isFinite(story.durationMinutes)
      ? story.durationMinutes
      : typeof story.estimatedTimeMin === "number" && Number.isFinite(story.estimatedTimeMin)
      ? story.estimatedTimeMin
      : null;
  if (primary && primary > 0) return `${Math.round(primary)} min`;
  // Fallback: rough estimate (2 min per segment)
  if (Array.isArray(story.segmentUrls) && story.segmentUrls.length > 0) {
    return `${Math.max(1, Math.round(story.segmentUrls.length * 2))} min`;
  }
  return "--";
};

/** Serialize story to URL-safe string for QuickRun */
function serializeStoryForRun(story: QuickStoryPayload | null): string | null {
  if (!story) return null;
  try {
    return encodeURIComponent(JSON.stringify(story));
  } catch {
    return null;
  }
}

/** Render one Herb-of-Dawn episode row */
const renderStoryOption = (
  story: StoryOption,
  onSelect: (s: StoryOption) => void,
  isSelected: boolean,
) => (
  <Pressable
    key={story.progressKey}
    style={[
      styles.modalItem,
      story.locked && styles.modalItemLocked,
      isSelected && styles.modalItemActive,
    ]}
    onPress={() => {
      if (!story.locked) onSelect(story);
    }}
  >
    <View style={styles.storyRowHeader}>
      <Text
        style={[
          styles.modalItemText,
          story.locked && styles.modalItemTextLocked,
          isSelected && { color: "#0B3D1F" },
        ]}
        numberOfLines={1}
      >
        {story.title}
      </Text>
    </View>
    <Text style={styles.modalItemMeta}>
      {mToKm(story.distanceMeters)} · {timeLabelForStory(story)}
    </Text>
    <View style={styles.modalBadgeRow}>
      {story.completed ? (
        <Text style={styles.completedBadge}>Completed</Text>
      ) : null}
      {story.locked ? <Text style={styles.lockedBadge}>Locked</Text> : null}
    </View>
  </Pressable>
);

export default function QuickChallengeDetails() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  /* ---------------------- Equipped Pet ---------------------- */
  const [equippedPetId, setEquippedPetId] = useState<string | null>(null);
  const [equippedPet, setEquippedPet] = useState<any>(null);

  useEffect(() => {
    if (!uid) return;
    const unsubUser = onSnapshot(doc(db, "Users", uid), (snap) => {
      const eq = (snap.data() as any)?.equippedPetId ?? null;
      setEquippedPetId(typeof eq === "string" ? eq : null);
    });
    return () => unsubUser();
  }, [uid]);

  useEffect(() => {
    if (!uid || !equippedPetId) return setEquippedPet(null);

    const unsubPet = onSnapshot(
      doc(db, "Users", uid, "pets", equippedPetId),
      (snap) => {
        if (!snap.exists()) return setEquippedPet(null);
        const d = snap.data() as any;

        const xp = typeof d?.xp === "number" ? d.xp : 0;
        const evoLvl = Math.min(
          PET_MAX_LEVEL,
          Math.floor(xp / PET_XP_PER_LEVEL),
        );

        const imgs = Array.isArray(d?.images)
          ? d.images.filter((u: string) => typeof u === "string")
          : [];

        const stageIdx =
          imgs.length > 0 ? Math.min(imgs.length - 1, evoLvl) : 0;

        const stageName =
          ["Baby", "Big", "King"][Math.min(2, stageIdx)] ?? "Baby";

        setEquippedPet({
          id: snap.id,
          ...d,
          name: `${stageName} ${d?.name ?? "Pet"}`,
        });
      },
    );

    return () => unsubPet();
  }, [uid, equippedPetId]);

  const levelInfo = useMemo(() => {
    if (!equippedPet)
      return {
        level: 0,
        progressPct: 0,
        remainXp: PET_XP_PER_LEVEL,
        atMax: false,
      };

    const xp = equippedPet.xp ?? 0;
    const lvl = Math.min(
      PET_MAX_LEVEL,
      Math.floor(xp / PET_XP_PER_LEVEL),
    );
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;

    return {
      level: lvl,
      progressPct: progress,
      remainXp:
        lvl >= PET_MAX_LEVEL
          ? 0
          : PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL),
      atMax: lvl >= PET_MAX_LEVEL,
    };
  }, [equippedPet]);

  /* ---------------------- Story Series (Herb of Dawn) ---------------------- */
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [storySections, setStorySections] = useState<SeasonSection[]>([]);
  const [flatStoryOptions, setFlatStoryOptions] = useState<StoryOption[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [selectedStoryKey, setSelectedStoryKey] =
    useState<string | null>(null);
  const [challengeDoc, setChallengeDoc] = useState<Record<string, unknown> | null>(null);

  // Dropdown toggles
  const [openSeason, setOpenSeason] = useState(false);
  const [openAiStories, setOpenAiStories] = useState(false);
  const [openAiSummary, setOpenAiSummary] = useState(false);
  const [openNoAudio, setOpenNoAudio] = useState(false);

  useEffect(() => {
    let active = true;
    setStoriesLoading(true);

    (async () => {
      try {
        // Load challenge doc to pick up estimatedTime/distance defaults
        let docData: Record<string, unknown> | null = challengeDoc;
        if (!docData) {
          try {
            const snap = await getDoc(doc(db, "challenges", QUICK_CHALLENGE_ID));
            docData = snap.exists() ? { id: snap.id, ...snap.data() } : null;
            setChallengeDoc(docData);
          } catch {
            docData = null;
          }
        }

        const result = await loadStoryPickerData({
          challengeId: QUICK_CHALLENGE_ID,
          challengeDoc: docData,
          variantId: QUICK_VARIANT_ID,
          userId: uid,
          includePetStory: false,
          includeSeasonSeries: true,
        });

        if (!active) return;

        // Ensure clean episode titles (Episode 1, 2, 3...)
        const numbered = result.flatStoryOptions.map((s, idx) => ({
          ...s,
          title: `Episode ${idx + 1}`,
        }));

        setFlatStoryOptions(numbered);

        // Keep seasonSections for grouping (Herb of Dawn)
        setStorySections(result.seasonSections);
      } catch {
        if (active) {
          setStorySections([]);
          setFlatStoryOptions([]);
        }
      } finally {
        if (active) setStoriesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, challengeDoc]);

  const selectedStory = useMemo(
    () =>
      flatStoryOptions.find((s) => s.progressKey === selectedStoryKey) ??
      null,
    [flatStoryOptions, selectedStoryKey],
  );

  /* ---------------------- AI Stories ---------------------- */
  const [aiStories, setAiStories] = useState<AiStory[]>([]);
  const [selectedAiStoryId, setSelectedAiStoryId] =
    useState<string | null>(null);
  const [aiStoriesLoading, setAiStoriesLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setAiStoriesLoading(true);
    (async () => {
      try {
        const ref = collection(db, "stories");
        const snap = await getDocs(ref);
        const list: AiStory[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as any;
          const text: string =
            typeof d.text === "string"
              ? d.text.trim()
              : typeof d.meta?.text === "string"
              ? d.meta.text.trim()
              : "";
          if (!text) return;
          const title =
            typeof d.title === "string" && d.title.trim().length > 0
              ? d.title.trim()
              : docSnap.id;
          list.push({ id: docSnap.id, title, text });
        });
        if (active) setAiStories(list);
      } catch {
        if (active) setAiStories([]);
      } finally {
        if (active) setAiStoriesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedAiStory = useMemo(
    () => aiStories.find((s) => s.id === selectedAiStoryId) ?? null,
    [aiStories, selectedAiStoryId],
  );

  /* ---------------------- AI Summary (Gemini + ElevenLabs) ---------------------- */
  const [specialSelection, setSpecialSelection] = useState<
    "AI_SUMMARY" | "NO_AUDIO" | null
  >(null);

  const [aiSummaryModalOpen, setAiSummaryModalOpen] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState("");

  const [aiSummaryGenerating, setAiSummaryGenerating] = useState(false);
  const [aiSummaryAudioUrl, setAiSummaryAudioUrl] =
    useState<string | null>(null);

  const handleGenerateAiSummary = useCallback(async () => {
    const text = aiSummaryText.trim();
    const words = text.length ? text.split(/\s+/).filter(Boolean) : [];
    if (!words.length) {
      Alert.alert("AI Summary", "Please write something first.");
      return;
    }
    if (words.length < 50) {
      Alert.alert("AI Summary", "Please write at least 200 words for a good summary.");
      return;
    }

    try {
      setAiSummaryGenerating(true);

      // Gemini → formal story text
      const storyText = await formalizeStory(text);

      // ElevenLabs → audio
      const audioUrl = await generateVoiceFromElevenLabs(storyText);
      setAiSummaryAudioUrl(audioUrl);

      Alert.alert(
        "AI Summary",
        "Your audio is ready. You can start the quick challenge now.",
      );
      setAiSummaryModalOpen(false);
    } catch (error: any) {
      Alert.alert(
        "AI Summary Error",
        error?.message ?? "Failed to generate AI summary audio.",
      );
    } finally {
      setAiSummaryGenerating(false);
    }
  }, [aiSummaryText]);

  /* ---------------------- Story Bar Label ---------------------- */
  const storyBarLabel = useMemo(() => {
    if (specialSelection === "NO_AUDIO") return "No audio";
    if (specialSelection === "AI_SUMMARY") return "AI Summary";
    if (selectedAiStory) return `AI Story: ${selectedAiStory.title}`;
    if (selectedStory) return `Story: ${selectedStory.title}`;
    return "Choose a Story";
  }, [specialSelection, selectedAiStory, selectedStory]);

  /* ---------------------- Select Story Actions ---------------------- */
  const handleSelectStory = useCallback((story: StoryOption) => {
    if (story.locked) {
      Alert.alert(
        "Locked Episode",
        "Finish the previous episode to unlock this one.",
      );
      return;
    }
    setSelectedStoryKey(story.progressKey);
    setSelectedAiStoryId(null);
    setSpecialSelection(null);
    setStoryPickerOpen(false);
  }, []);

  const handleSelectAiStory = useCallback((item: AiStory) => {
    setSelectedAiStoryId(item.id);
    setSelectedStoryKey(null);
    setSpecialSelection(null);
    setStoryPickerOpen(false);
  }, []);

  const handleSelectNoAudio = useCallback(() => {
    setSelectedStoryKey(null);
    setSelectedAiStoryId(null);
    setSpecialSelection("NO_AUDIO");
    setStoryPickerOpen(false);
  }, []);

  /* ---------------------- Start Quick Challenge ---------------------- */
  const handleStartQuickChallenge = useCallback(() => {
    // 1) NO AUDIO → send sentinel to QuickRun
    if (specialSelection === "NO_AUDIO") {
      router.push({
        pathname: "/ChallengesPages/QuickRun",
        params: { story: "NONE" },
      });
      return;
    }

    // 2) AI SUMMARY selected but audio not generated yet
    if (specialSelection === "AI_SUMMARY" && !aiSummaryAudioUrl) {
      setAiSummaryModalOpen(true);
      Alert.alert(
        "AI Summary",
        "Write your text and generate the audio before starting.",
      );
      return;
    }

    // 3) AI SUMMARY (single audio) → QuickRun
    if (specialSelection === "AI_SUMMARY" && aiSummaryAudioUrl) {
      const quick: QuickStoryPayload = {
        id: "ai-summary",
        progressKey: "ai-summary",
        type: "season",
        challengeId: QUICK_CHALLENGE_ID,
        variantId: QUICK_VARIANT_ID,
        title: "AI Summary",
        subtitle: null,
        segmentUrls: [aiSummaryAudioUrl],
        distanceMeters: null,
        durationMinutes: null,
        estimatedTimeMin: null,
        playMode: "single",
      };

      const encoded = serializeStoryForRun(quick);
      router.push({
        pathname: "/ChallengesPages/QuickRun",
        params: encoded ? { story: encoded } : {},
      });
      return;
    }

    // 4) AI STORY (from Firestore text) → QuickRun with generated audio
    if (selectedAiStory) {
      Alert.alert(
        "Generate audio?",
        `Generate audio for "${selectedAiStory.title}" and start?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes",
            onPress: async () => {
              try {
                const audioUrl = await generateVoiceFromElevenLabs(
                  selectedAiStory.text,
                );

                const q: QuickStoryPayload = {
                  id: selectedAiStory.id,
                  progressKey: `aiStory:${selectedAiStory.id}`,
                  type: "season",
                  challengeId: QUICK_CHALLENGE_ID,
                  variantId: QUICK_VARIANT_ID,
                  title: selectedAiStory.title,
                  subtitle: null,
                  segmentUrls: [audioUrl],
                  distanceMeters: null,
                  durationMinutes: null,
                  estimatedTimeMin: null,
                  playMode: "single",
                };

                const encoded = serializeStoryForRun(q);
                router.push({
                  pathname: "/ChallengesPages/QuickRun",
                  params: encoded ? { story: encoded } : {},
                });
              } catch (err: any) {
                Alert.alert(
                  "AI Story Error",
                  err?.message ?? "Failed to generate audio.",
                );
              }
            },
          },
        ],
      );
      return;
    }

    // 5) HERB OF DAWN STORY (segments mode) → 🚀 MapScreen (same as ChallengeDetails)
    if (selectedStory) {
  const quick: QuickStoryPayload = {
    id: selectedStory.id,
    progressKey: selectedStory.progressKey,
    type: selectedStory.type, // "season"
    challengeId: QUICK_CHALLENGE_ID,
    variantId: QUICK_VARIANT_ID,
    title: selectedStory.title,
    subtitle: selectedStory.subtitle ?? null,
    segmentUrls: selectedStory.segmentUrls,
    distanceMeters: selectedStory.distanceMeters ?? null,
    durationMinutes: selectedStory.durationMinutes ?? null,
    estimatedTimeMin: selectedStory.estimatedTimeMin ?? null,
    playMode: "segments",
  };

  const encoded = serializeStoryForRun(quick);

  router.push({
    pathname: "/ChallengesPages/QuickRun",
    params: encoded ? { story: encoded } : {},
  });

  return;
}


    // Fallback: no selection at all
    Alert.alert(
      "Choose a story",
      "Please pick a Herb of Dawn episode, an AI story, or No Audio first.",
    );
  }, [
    aiSummaryAudioUrl,
    router,
    selectedAiStory,
    selectedStory,
    specialSelection,
  ]);

  /* ---------------------- Render ---------------------- */
  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.h1}>Quick Challenge</Text>
          <Text style={styles.h2}>Start anywhere. Finish anytime.</Text>
        </View>

        {/* Equipped Pet */}
        {equippedPet ? (
          <View style={styles.petCard}>
            <View style={styles.petRow}>
              <Image
                source={
                  Array.isArray(equippedPet.images) &&
                  equippedPet.images?.length > 0
                    ? {
                        uri: equippedPet.images[
                          Math.min(
                            equippedPet.images.length - 1,
                            Math.min(
                              PET_MAX_LEVEL,
                              Math.floor(
                                (equippedPet.xp ?? 0) / PET_XP_PER_LEVEL,
                              ),
                            ),
                          )
                        ],
                      }
                    : equippedPet.imageUrl
                    ? { uri: equippedPet.imageUrl }
                    : require("../../assets/images/icon.png")
                }
                style={styles.petImg}
                resizeMode="contain"
              />

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.petTitle}>Equipped Pet</Text>
                <Text style={styles.petName} numberOfLines={1}>
                  {equippedPet.name?.toUpperCase()}
                </Text>

                {(() => {
                  const xpNow = equippedPet?.xp ?? 0;
                  const evo = Math.floor(xpNow / PET_XP_PER_LEVEL);

                  const imgs = Array.isArray(equippedPet?.images)
                    ? equippedPet.images.filter((u: string) => u)
                    : [];

                  const stageIdx =
                    imgs.length > 0
                      ? Math.min(imgs.length - 1, evo)
                      : 0;

                  const atMaxStage = stageIdx >= 2;
                  const displayLvl = stageIdx + 1;

                  return (
                    <>
                      {!atMaxStage && (
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.round(
                                  levelInfo.progressPct * 100,
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      )}

                      <Text style={styles.levelText}>
                        {atMaxStage
                          ? "Lvl 3 MAX!"
                          : `Lvl ${displayLvl} · Next in ${levelInfo.remainXp} XP`}
                      </Text>
                    </>
                  );
                })()}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.item}>No pet equipped yet.</Text>
          </View>
        )}

        {/* Story Picker Bar */}
        <Pressable
          onPress={() => {
            if (
              !flatStoryOptions.length &&
              !aiStories.length &&
              !specialSelection
            ) {
              Alert.alert(
                "No stories",
                "Story Series and AI Stories will appear here soon.",
              );
              return;
            }
            setStoryPickerOpen(true);
          }}
          style={styles.storyBar}
        >
          <Text style={styles.storyText} numberOfLines={1}>
            {storyBarLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
        </Pressable>

        {/* Instructions */}
        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>
            - Your position and distance are recorded on the map.
          </Text>
          <Text style={styles.item}>
            - Tap Finish whenever you're done.
          </Text>
        </View>

        {/* XP Rules */}
        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- You earn 1 XP per 5 steps.</Text>
          <Text style={styles.item}>
            - Only your equipped pet evolves.
          </Text>
        </View>

        {/* Start Button */}
        <Pressable
          onPress={handleStartQuickChallenge}
          style={({ pressed }) => [
            styles.startBtn,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        {/* ================= STORY PICKER MODAL ================= */}
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

              <ScrollView style={{ maxHeight: 420 }}>
                {storiesLoading && aiStoriesLoading ? (
                  <ActivityIndicator style={{ paddingVertical: 32 }} />
                ) : (
                  <>
                    {/* 1) HERB OF DAWN (SEASON STORIES) - DROPDOWN */}
                    <Pressable
                      style={styles.dropdownHeader}
                      onPress={() => setOpenSeason((v) => !v)}
                    >
                      <Text style={styles.modalSectionTitle}>
                        The Herb of Dawn
                      </Text>
                      <Text style={styles.dropdownArrow}>
                        {openSeason ? "v" : ">"}
                      </Text>
                    </Pressable>

                    {openSeason &&
                      storySections.map((section) => {
                        const allCompleted = section.episodes.every(
                          (ep) => ep.completed,
                        );
                        return (
                          <View
                            key={section.seasonId}
                            style={styles.modalSeason}
                          >
                            <View style={styles.storyRowHeader}>
                              <Text style={styles.modalSectionTitle}>
                                {section.title}
                              </Text>
                              {allCompleted && (
                                <Text style={styles.completedBadge}>
                                  Completed
                                </Text>
                              )}
                            </View>

                            {section.episodes.map((ep) =>
                              renderStoryOption(
                                ep,
                                handleSelectStory,
                                selectedStoryKey === ep.progressKey,
                              ),
                            )}
                          </View>
                        );
                      })}

                    {/* 2) AI STORIES (DROPDOWN) */}
                    {!!aiStories.length && (
                      <>
                        <Pressable
                          style={styles.dropdownHeader}
                          onPress={() => setOpenAiStories((v) => !v)}
                        >
                          <Text style={styles.modalSectionTitle}>
                            AI Stories
                          </Text>
                          <Text style={styles.dropdownArrow}>
                            {openAiStories ? "v" : ">"}
                          </Text>
                        </Pressable>

                        {openAiStories && (
                          <View style={styles.modalSeason}>
                            {aiStories.map((story) => {
                              const active =
                                selectedAiStoryId === story.id;

                              // Compute duration label mm:ss
                              const words = story.text.split(/\s+/).length;
                              const minutesFloat = words / 130;
                              const totalSeconds = Math.max(
                                1,
                                Math.round(minutesFloat * 60),
                              );
                              const mm = String(
                                Math.floor(totalSeconds / 60),
                              ).padStart(2, "0");
                              const ss = String(
                                totalSeconds % 60,
                              ).padStart(2, "0");
                              const durationLabel = `${mm}:${ss}`;

                              return (
                                <Pressable
                                  key={story.id}
                                  style={[
                                    styles.modalItem,
                                    active && styles.modalItemActive,
                                  ]}
                                  onPress={() =>
                                    handleSelectAiStory(story)
                                  }
                                >
                                  <Text
                                    style={styles.modalItemText}
                                    numberOfLines={1}
                                  >
                                    {story.title}
                                  </Text>
                                  <Text style={styles.modalItemMeta}>
                                    {durationLabel}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </>
                    )}

                    {/* 3) AI SUMMARY (DROPDOWN) */}
                    <Pressable
                      style={styles.dropdownHeader}
                      onPress={() => setOpenAiSummary((v) => !v)}
                    >
                      <Text style={styles.modalSectionTitle}>
                        AI Summary
                      </Text>
                      <Text style={styles.dropdownArrow}>
                        {openAiSummary ? "v" : ">"}
                      </Text>
                    </Pressable>

                    {openAiSummary && (
                      <View style={styles.modalSeason}>
                        <Pressable
                          style={[
                            styles.modalItem,
                            specialSelection === "AI_SUMMARY" &&
                              styles.modalItemActive,
                          ]}
                          onPress={() => {
                            setSelectedStoryKey(null);
                            setSelectedAiStoryId(null);
                            setSpecialSelection("AI_SUMMARY");
                            setStoryPickerOpen(false);
                            setAiSummaryModalOpen(true);
                          }}
                        >
                          <Text style={styles.modalItemText}>
                            Write your own text
                          </Text>
                          <Text style={styles.modalItemMeta}>
                            We’ll summarize it and turn it into audio.
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* 4) NO AUDIO (DROPDOWN) */}
                    <Pressable
                      style={styles.dropdownHeader}
                      onPress={() => setOpenNoAudio((v) => !v)}
                    >
                      <Text style={styles.modalSectionTitle}>
                        No Audio
                      </Text>
                      <Text style={styles.dropdownArrow}>
                        {openNoAudio ? "v" : ">"}
                      </Text>
                    </Pressable>

                    {openNoAudio && (
                      <View style={styles.modalSeason}>
                        <Pressable
                          style={[
                            styles.modalItem,
                            specialSelection === "NO_AUDIO" &&
                              styles.modalItemActive,
                          ]}
                          onPress={handleSelectNoAudio}
                        >
                          <Text style={styles.modalItemText}>
                            No audio
                          </Text>
                          <Text style={styles.modalItemMeta}>
                            Start challenge without story audio.
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* ---------------------- AI SUMMARY MODAL ---------------------- */}
        <Modal
          visible={aiSummaryModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setAiSummaryModalOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.aiModalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.aiModalSheet}>
              <Text style={styles.aiModalTitle}>AI Summary</Text>
              <Text style={styles.aiModalSubtitle}>
                Write anything. We’ll summarize it into a short motivational
                audio.
              </Text>

              <ScrollView
                style={{
                  maxHeight: 220,
                  marginTop: 10,
                }}
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  style={styles.aiTextInput}
                  placeholder="Type your text here..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  value={aiSummaryText}
                  onChangeText={setAiSummaryText}
                  textAlignVertical="top"
                />
              </ScrollView>

              <View style={styles.aiButtonsRow}>
                <Pressable
                  style={[
                    styles.aiButton,
                    styles.aiButtonSecondary,
                  ]}
                  onPress={() => setAiSummaryModalOpen(false)}
                  disabled={aiSummaryGenerating}
                >
                  <Text style={styles.aiButtonSecondaryText}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.aiButton}
                  onPress={handleGenerateAiSummary}
                  disabled={aiSummaryGenerating}
                >
                  {aiSummaryGenerating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.aiButtonText}>
                      Generate Audio
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

/* ---------------------- STYLES ---------------------- */
const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  h1: { fontSize: 32, fontWeight: "900", color: "#000" },
  h2: { fontSize: 16, fontWeight: "700", color: "#000", marginTop: 2 },

  /* Cards */
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#BEE3BF",
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B3D1F",
    marginBottom: 8,
  },
  item: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0B3D1F",
    marginVertical: 2,
  },

  /* Start Button */
  startBtn: {
    marginTop: 30,
    marginHorizontal: 20,
    backgroundColor: "#22C55E",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  startText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },

  /* Equipped Pet */
  petCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#BEE3BF",
  },
  petRow: { flexDirection: "row", alignItems: "center" },
  petImg: {
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: "#ECF8F1",
  },
  petTitle: {
    color: "#0B3D1F",
    fontWeight: "800",
    fontSize: 12,
  },
  petName: {
    color: "#0B3D1F",
    fontWeight: "900",
    fontSize: 16,
    marginTop: 4,
  },
  progressBar: {
    marginTop: 6,
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#10B981",
  },
  levelText: {
    marginTop: 6,
    color: "#0B3D1F",
    fontWeight: "800",
  },

  /* Story Picker Bar */
  storyBar: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#EAF8F2",
    borderWidth: 1,
    borderColor: "#C9F0E0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storyText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B3D1F",
    flex: 1,
    marginRight: 10,
  },

  /* Story Picker Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B3D1F",
    marginBottom: 12,
  },

  dropdownHeader: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    marginTop: 4,
  },
  dropdownArrow: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0B3D1F",
  },

  modalSectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0B3D1F",
  },
  storyRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  completedBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#10B981",
  },

  modalSeason: {
    paddingVertical: 4,
    paddingLeft: 4,
    marginBottom: 10,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: {
    backgroundColor: "#E0F2F1",
  },
  modalItemLocked: {
    opacity: 0.45,
  },
  modalItemTextLocked: {
    color: "#6B7280",
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B3D1F",
  },
  modalItemMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 2,
  },
  modalBadgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  completedBadge: {
    backgroundColor: "#D1FAE5",
    color: "#065F46",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "800",
    fontSize: 12,
  },
  lockedBadge: {
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "800",
    fontSize: 12,
  },
  modalEmpty: {
    paddingVertical: 32,
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "600",
  },

  /* AI Summary Modal */
  aiModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  aiModalSheet: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
  },
  aiModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B3D1F",
    marginBottom: 6,
  },
  aiModalSubtitle: {
    fontSize: 13,
    color: "#4B5563",
  },
  aiTextInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 120,
    fontSize: 14,
    color: "#111827",
  },
  aiButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  aiButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#22C55E",
    minWidth: 120,
    alignItems: "center",
  },
  aiButtonText: {
    color: "white",
    fontWeight: "800",
  },
  aiButtonSecondary: {
    backgroundColor: "#E5E7EB",
  },
  aiButtonSecondaryText: {
    color: "#111827",
    fontWeight: "700",
  },
});
