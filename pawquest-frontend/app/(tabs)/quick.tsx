// app/ChallengesPages/QuickChallengeDetails.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "@/src/lib/firebase";
import { PET_MAX_LEVEL, PET_XP_PER_LEVEL } from "@/src/lib/playerProgress";
import {
  loadStoryPickerData,
  SeasonSection,
  StoryOption,
} from "@/src/lib/storyPicker";
import { formalizeStory } from "@/src/lib/services/aiFormalize";
import { generateVoiceFromElevenLabs } from "@/src/lib/services/ttsEleven";

const bgImage = require("../../assets/images/ImageBackground.jpg");
const QUICK_CHALLENGE_ID = "quick-challenge";
const QUICK_VARIANT_ID: "easy" | "hard" = "easy";

// 🔹 نوع AI Story: من فايربيس يكون فيها نص فقط
type AiStory = {
  id: string;
  title: string;
  text: string;
  distanceMeters?: number | null;
  estimatedTimeMin?: number | null;
  durationMinutes?: number | null;
};

const serializeStoryForRun = (story: any | null): string | null => {
  if (!story) return null;
  const { locked, ...payload } = story ?? {};
  try {
    return encodeURIComponent(JSON.stringify(payload));
  } catch {
    return null;
  }
};

export default function QuickChallengeDetails() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  /* ---------------------- Equipped pet ---------------------- */
  const [equippedPetId, setEquippedPetId] = useState<string | null>(null);
  const [equippedPet, setEquippedPet] = useState<{
    id: string;
    name?: string | null;
    imageUrl?: string | null;
    images?: string[] | null;
    xp?: number | null;
    evoLevel?: number | null;
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsubUser = onSnapshot(doc(db, "Users", uid), (snap) => {
      const eq = (snap.data() as any)?.equippedPetId ?? null;
      setEquippedPetId(typeof eq === "string" ? eq : null);
    });
    return () => unsubUser();
  }, [uid]);

  useEffect(() => {
    if (!uid || !equippedPetId) {
      setEquippedPet(null);
      return;
    }
    const unsubPet = onSnapshot(doc(db, "Users", uid, "pets", equippedPetId), (snap) => {
      if (!snap.exists()) {
        setEquippedPet(null);
        return;
      }
      const d = snap.data() as any;
      const xp = typeof d?.xp === "number" ? d.xp : 0;
      const evoLvl = Math.min(PET_MAX_LEVEL, Math.floor(xp / PET_XP_PER_LEVEL));
      const imgs: string[] = Array.isArray(d?.images)
        ? d.images.filter((u: any) => typeof u === "string" && u.length > 0)
        : [];
      const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evoLvl) : 0;
      const stageName = ["Baby", "Big", "King"][Math.min(2, stageIdx)] ?? "Baby";
      const baseName = (d?.name ?? "Pet").toString();
      setEquippedPet({ id: snap.id, ...d, name: `${stageName} ${baseName}` });
    });
    return () => unsubPet();
  }, [uid, equippedPetId]);

  const levelInfo = useMemo(() => {
    if (!equippedPet) {
      return {
        level: 0,
        progressPct: 0,
        remainXp: PET_XP_PER_LEVEL,
        atMax: false,
      };
    }
    const xp = typeof equippedPet.xp === "number" ? equippedPet.xp : 0;
    const evoLevelRaw = Math.floor(xp / PET_XP_PER_LEVEL);
    const evoLevel = Math.min(PET_MAX_LEVEL, evoLevelRaw);
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
    const atMax = evoLevel >= PET_MAX_LEVEL;
    const remain = atMax ? 0 : PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL || 0);
    return {
      level: evoLevel,
      progressPct: Math.max(0, Math.min(1, progress)),
      remainXp: remain,
      atMax,
    };
  }, [equippedPet]);

  /* ---------------------- Stories: Herb / Series ---------------------- */
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [storySections, setStorySections] = useState<SeasonSection[]>([]);
  const [flatStoryOptions, setFlatStoryOptions] = useState<StoryOption[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null);
  const [expandedSeasonId, setExpandedSeasonId] = useState<string | null>(null);
  const [hasUserChosenStory, setHasUserChosenStory] = useState(false);

  useEffect(() => {
    let active = true;
    setStoriesLoading(true);
    (async () => {
      try {
        const result = await loadStoryPickerData({
          challengeId: QUICK_CHALLENGE_ID,
          challengeDoc: null,
          variantId: QUICK_VARIANT_ID,
          userId: uid,
          includePetStory: false,       // ❗ Quick لا يحتوي على pet story
          includeSeasonSeries: true,
        });
        if (!active) return;

        setStorySections(result.seasonSections);
        setFlatStoryOptions(result.flatStoryOptions);

        // اختار أول حلقة غير مقفولة تلقائياً
        const defaultKey =
          result.flatStoryOptions.find((story) => !story.locked)?.progressKey ?? null;
        setSelectedStoryKey(defaultKey);
        if (defaultKey) {
          setHasUserChosenStory(true);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn("[QuickChallenge] Failed to load Story Series", error);
        }
        if (active) {
          setStorySections([]);
          setFlatStoryOptions([]);
          setSelectedStoryKey(null);
          setHasUserChosenStory(false);
        }
      } finally {
        if (active) setStoriesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  const selectedStory = useMemo(
    () =>
      flatStoryOptions.find((story) => story.progressKey === selectedStoryKey) ?? null,
    [flatStoryOptions, selectedStoryKey],
  );

  
  /* ---------------------- AI Stories from Firestore ---------------------- */
const [aiStories, setAiStories] = useState<AiStory[]>([]);
const [selectedAiStoryId, setSelectedAiStoryId] = useState<string | null>(null);

useEffect(() => {
  let active = true;

  (async () => {
    try {
      const ref = collection(db, "stories");
      const snap = await getDocs(ref);

      if (!active) return;

      const list: AiStory[] = [];

      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;

        // 🔥 نقرأ البيانات من meta
        const meta = d?.meta ?? {};

        const title =
          typeof meta?.title === "string" && meta.title.trim().length > 0
            ? meta.title.trim()
            : "AI Story";

        const text =
          typeof meta?.text === "string" && meta.text.trim().length > 0
            ? meta.text.trim()
            : null;

        // ❗❗ أزلنا الشرط الذي يمنع ظهور القصص
        // كان هنا سبب المشكلة:
        // if (!text && !audioUrl) return;

        list.push({
          id: docSnap.id,
          title,
          text,
          distanceMeters: d?.distanceMeters ?? null,
          estimatedTimeMin: d?.estimatedTimeMin ?? null,
          durationMinutes: d?.durationMinutes ?? null,
        });
      });

      console.log("🔥 Loaded AI Stories:", list);
      setAiStories(list);
    } catch (error) {
      console.log("[QuickChallenge] Failed to load AI Stories", error);
      if (active) setAiStories([]);
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
  const [aiSummaryAudioUrl, setAiSummaryAudioUrl] = useState<string | null>(null);

  const handleGenerateAiSummary = useCallback(async () => {
    const text = aiSummaryText.trim();
    if (!text) {
      Alert.alert("AI Summary", "Please write something first.");
      return;
    }

    try {
      setAiSummaryGenerating(true);
      // 1) Gemini: يحوّل النص لقصة قصيرة تحفيزية
      const storyText = await formalizeStory(text);

      // 2) ElevenLabs: يحوّل القصة لصوت واحد كامل
      const audioUrl = await generateVoiceFromElevenLabs(storyText);

      setAiSummaryAudioUrl(audioUrl);
      Alert.alert("AI Summary", "Your audio is ready. You can start the quick challenge now.");
      setAiSummaryModalOpen(false);
    } catch (error: any) {
      const msg = error?.message ?? "Failed to generate AI summary audio.";
      Alert.alert("AI Summary Error", msg);
    } finally {
      setAiSummaryGenerating(false);
    }
  }, [aiSummaryText]);

  /* ---------------------- Story bar label ---------------------- */
  const storyBarLabel = useMemo(() => {
    if (specialSelection === "NO_AUDIO") return "No audio";
    if (specialSelection === "AI_SUMMARY") return "AI Summary";
    if (selectedAiStory) return `AI Story: ${selectedAiStory.title}`;
    if (hasUserChosenStory && selectedStory) return `Story: ${selectedStory.title}`;
    return "Choose a Story";
  }, [specialSelection, selectedAiStory, hasUserChosenStory, selectedStory]);

  const handleSelectStory = useCallback((story: StoryOption) => {
    if (story.locked) {
      Alert.alert("Locked Episode", "Finish the previous episode to unlock this one.");
      return;
    }
    setHasUserChosenStory(true);
    setSelectedStoryKey(story.progressKey);
    setSelectedAiStoryId(null);
    setSpecialSelection(null);
    setStoryPickerOpen(false);
  }, []);

  const handleSelectAiStory = useCallback((item: AiStory) => {
    setSelectedAiStoryId(item.id);
    setSelectedStoryKey(null);
    setSpecialSelection(null);
    setHasUserChosenStory(true);
    setStoryPickerOpen(false);
  }, []);

  /* ---------------------- Start button handler ---------------------- */
  const handleStartQuickChallenge = useCallback(() => {
    // لا نمنع المستخدم من البدء بأي خيار
    // فقط نتأكد أن AI Summary عنده audio جاهز
    if (specialSelection === "AI_SUMMARY" && !aiSummaryAudioUrl) {
      setAiSummaryModalOpen(true);
      Alert.alert(
        "AI Summary",
        "Write your text and generate the audio before starting the quick challenge.",
      );
      return;
    }

    const label =
      specialSelection === "NO_AUDIO"
        ? "No audio"
        : specialSelection === "AI_SUMMARY"
        ? "AI Summary"
        : selectedAiStory
        ? `AI Story: ${selectedAiStory.title}`
        : selectedStory
        ? selectedStory.title
        : null;

    Alert.alert(
      "Ready to start?",
      label ? `Start "${label}"?` : "Start this quick challenge?",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Yes, start",
          onPress: () => {
            (async () => {
              let storyParam: string | null = null;

              if (specialSelection === "NO_AUDIO") {
                // بدون صوت نهائياً
                storyParam = null;
              } else if (specialSelection === "AI_SUMMARY" && aiSummaryAudioUrl) {
                // AI Summary: ملف صوتي واحد + AudioBar في QuickRun
                const quickStory = {
                  id: "ai-summary",
                  progressKey: "ai-summary",
                  type: "season" as const,
                  challengeId: QUICK_CHALLENGE_ID,
                  variantId: QUICK_VARIANT_ID,
                  title: "AI Summary",
                  subtitle: null,
                  segmentUrls: [aiSummaryAudioUrl],
                  playMode: "single" as const, // ❗ مهم: يخبر QuickRun أن هذه قصة بصوت واحد + AudioBar
                  distanceMeters: null,
                  durationMinutes: null,
                  estimatedTimeMin: null,
                };
                storyParam = serializeStoryForRun(quickStory);
              } else if (selectedAiStory) {
                // AI Story من فايربيس: عند البدء نولّد الصوت مباشرة بـ ElevenLabs
                try {
                  const audioUrl = await generateVoiceFromElevenLabs(
                    selectedAiStory.text,
                  );

                  const quickStory = {
                    id: selectedAiStory.id,
                    progressKey: `aiStory:${selectedAiStory.id}`,
                    type: "season" as const,
                    challengeId: QUICK_CHALLENGE_ID,
                    variantId: QUICK_VARIANT_ID,
                    title: selectedAiStory.title || "AI Story",
                    subtitle: null,
                    segmentUrls: [audioUrl],
                    playMode: "single" as const, // ❗ AudioBar
                    distanceMeters:
                      typeof selectedAiStory.distanceMeters === "number"
                        ? selectedAiStory.distanceMeters
                        : null,
                    durationMinutes:
                      typeof selectedAiStory.durationMinutes === "number"
                        ? selectedAiStory.durationMinutes
                        : selectedAiStory.estimatedTimeMin ?? null,
                    estimatedTimeMin:
                      typeof selectedAiStory.estimatedTimeMin === "number"
                        ? selectedAiStory.estimatedTimeMin
                        : null,
                  };

                  storyParam = serializeStoryForRun(quickStory);
                } catch (e: any) {
                  const msg =
                    e?.message ?? "Failed to generate audio for this AI Story.";
                  Alert.alert("AI Story Error", msg);
                  return;
                }
              } else if (selectedStory) {
                // The Herb of Dawn / Story Series (سيستم segments القديم)
                const quickStory = {
                  ...selectedStory,
                  playMode: "segments" as const, // ❗ QuickRun يستعمل المسافة والـ segments
                };
                storyParam = serializeStoryForRun(quickStory);
              }

              if (storyParam) {
                router.push({
                  pathname: "/ChallengesPages/QuickRun",
                  params: { story: storyParam },
                });
              } else {
                // No audio
                router.push({
                  pathname: "/ChallengesPages/QuickRun",
                });
              }
            })();
          },
        },
      ],
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
        <View style={styles.header}>
          <Text style={styles.h1}>Quick Challenge</Text>
          <Text style={styles.h2}>Start anywhere. Finish anytime.</Text>
        </View>

        {/* Equipped pet summary */}
        {equippedPet ? (
          <View style={styles.petCard}>
            <View style={styles.petRow}>
              <Image
                source={
                  Array.isArray(equippedPet.images) && equippedPet.images.length > 0
                    ? {
                        uri: equippedPet.images[
                          Math.min(
                            equippedPet.images.length - 1,
                            Math.min(
                              PET_MAX_LEVEL,
                              Math.floor((equippedPet.xp ?? 0) / PET_XP_PER_LEVEL),
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
                  {(equippedPet.name ?? "Pet").toString().toUpperCase()}
                </Text>
                {(() => {
                  const xpNow =
                    typeof equippedPet?.xp === "number" ? equippedPet.xp : 0;
                  const evo = Math.floor(xpNow / PET_XP_PER_LEVEL);
                  const imgs: string[] = Array.isArray(equippedPet?.images)
                    ? (equippedPet!.images as string[]).filter(
                        (u) => typeof u === "string" && u.length > 0,
                      )
                    : [];
                  const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evo) : 0;
                  const atMaxStage = stageIdx >= 2;
                  const displayLvl = stageIdx + 1;
                  return (
                    <>
                      {!atMaxStage && (
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${Math.round(levelInfo.progressPct * 100)}%` },
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

        {/* Story picker bar */}
        <Pressable
          onPress={() => {
            if (
              !flatStoryOptions.length &&
              !aiStories.length &&
              specialSelection === null
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

        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>
            - Your position and distance are recorded on the map.
          </Text>
          <Text style={styles.item}>- Tap Finish whenever you're done.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- You earn 1 XP for every 5 steps.</Text>
          <Text style={styles.item}>
            - Partial kms don’t count (1.5 km → 1 km).
          </Text>
          <Text style={styles.item}>- Only your equipped pet evolves.</Text>
        </View>

        <Pressable
          onPress={handleStartQuickChallenge}
          style={({ pressed }) => [
            styles.startBtn,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        {/* Story picker modal */}
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
              <ScrollView style={{ maxHeight: 360 }}>
                {storiesLoading ? (
                  <ActivityIndicator style={{ paddingVertical: 16 }} />
                ) : (
                  <>
                    {/* AI Stories section */}
                    {aiStories.length > 0 && (
                      <View style={styles.modalSeason}>
                        <Text style={styles.modalSectionTitle}>AI Stories</Text>
                        <Text style={styles.modalSectionSubtitle}>
                          Tap any AI-generated story to play a full audio track.
                        </Text>
                        {aiStories.map((item) => {
                          const active = selectedAiStoryId === item.id;
                          return (
                            <Pressable
                              key={item.id}
                              style={[
                                styles.modalItem,
                                active && styles.modalItemActive,
                              ]}
                              onPress={() => handleSelectAiStory(item)}
                            >
                              <Text style={styles.modalItemText}>
                                {item.title}
                              </Text>
                              <Text style={styles.modalItemMeta}>
                                {item.distanceMeters
                                  ? `${(item.distanceMeters / 1000).toFixed(1)} km`
                                  : "-"}{" "}
                                •{" "}
                                {item.estimatedTimeMin ??
                                  item.durationMinutes ??
                                  "--"}{" "}
                                min
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    {/* Herb / Story Series sections */}
                    {storySections.map((section) => {
                      const expanded = expandedSeasonId === section.seasonId;
                      return (
                        <View key={section.seasonId} style={styles.modalSeason}>
                          <Pressable
                            onPress={() =>
                              setExpandedSeasonId(
                                expanded ? null : section.seasonId,
                              )
                            }
                          >
                            <View style={styles.modalHeaderRow}>
                              <View style={{ flexShrink: 1 }}>
                                <Text style={styles.modalSectionTitle}>
                                  {section.title}
                                </Text>
                                <Text style={styles.modalSectionSubtitle}>
                                  {section.episodes.length} Episode
                                  {section.episodes.length === 1 ? "" : "s"}
                                </Text>
                              </View>
                              <Ionicons
                                name={expanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color="#0B3D1F"
                              />
                            </View>
                          </Pressable>

                          {expanded
                            ? section.episodes.map((story) => {
                                const active =
                                  selectedStoryKey === story.progressKey;
                                return (
                                  <Pressable
                                    key={story.progressKey}
                                    style={[
                                      styles.modalItem,
                                      active && styles.modalItemActive,
                                      story.locked && styles.modalItemLocked,
                                    ]}
                                    onPress={() => handleSelectStory(story)}
                                  >
                                    <Text
                                      style={[
                                        styles.modalItemText,
                                        story.locked &&
                                          styles.modalItemTextLocked,
                                      ]}
                                    >
                                      {story.title}
                                    </Text>
                                    <View style={styles.modalMetaRow}>
                                      <Text style={styles.modalItemMeta}>
                                        {story.distanceMeters
                                          ? `${(
                                              story.distanceMeters / 1000
                                            ).toFixed(1)} km`
                                          : "-"}{" "}
                                        •{" "}
                                        {story.estimatedTimeMin ??
                                          story.durationMinutes ??
                                          "--"}{" "}
                                        min
                                      </Text>
                                      <View style={styles.badgeRow}>
                                        {story.completed ? (
                                          <Text style={styles.badgeCompleted}>
                                            Completed
                                          </Text>
                                        ) : null}
                                        {story.locked ? (
                                          <Text style={styles.badgeLocked}>
                                            Locked
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  </Pressable>
                                );
                              })
                            : null}
                        </View>
                      );
                    })}

                    {/* AI Summary + No Audio options */}
                    <View style={[styles.modalSeason, { marginTop: 4 }]}>
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
                        <Text style={styles.modalItemText}>AI Summary</Text>
                        <Text style={styles.modalItemMeta}>
                          Type any text and let AI summarize and convert it to a
                          short audio.
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.modalItem,
                          specialSelection === "NO_AUDIO" &&
                            styles.modalItemActive,
                        ]}
                        onPress={() => {
                          setSelectedStoryKey(null);
                          setSelectedAiStoryId(null);
                          setSpecialSelection("NO_AUDIO");
                          setStoryPickerOpen(false);
                        }}
                      >
                        <Text style={styles.modalItemText}>No audio</Text>
                        <Text style={styles.modalItemMeta}>
                          Start quick challenge with no story audio.
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* AI Summary popup (TextInput + Generate) */}
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
                Write any text, notes, or story idea. We’ll summarize it into a
                short motivational audio for your quick challenge.
              </Text>
              <ScrollView
                style={{ maxHeight: 220, marginTop: 10 }}
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
                  style={[styles.aiButton, styles.aiButtonSecondary]}
                  onPress={() => setAiSummaryModalOpen(false)}
                  disabled={aiSummaryGenerating}
                >
                  <Text style={styles.aiButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.aiButton}
                  onPress={handleGenerateAiSummary}
                  disabled={aiSummaryGenerating}
                >
                  {aiSummaryGenerating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.aiButtonText}>Generate Audio</Text>
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

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  h1: { fontSize: 32, fontWeight: "900", color: "#000" },
  h2: { fontSize: 16, fontWeight: "700", color: "#000", marginTop: 2 },

  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#BEE3BF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: "900", color: "#0B3D1F", marginBottom: 8 },
  item: { fontSize: 15, fontWeight: "700", color: "#0B3D1F", marginVertical: 2 },

  startBtn: {
    marginTop: 30,
    marginHorizontal: 20,
    backgroundColor: "#22C55E",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  startText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  // Equipped pet block
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
  petTitle: { color: "#0B3D1F", fontWeight: "800", fontSize: 12 },
  petName: { color: "#0B3D1F", fontWeight: "900", fontSize: 16, marginTop: 4 },
  progressBar: {
    marginTop: 6,
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#10B981" },
  levelText: { marginTop: 6, color: "#0B3D1F", fontWeight: "800" },

  // Story bar + modal
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
  modalSeason: { marginBottom: 20 },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalSectionTitle: { fontSize: 18, fontWeight: "900", color: "#0B3D1F" },
  modalSectionSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 2,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: { backgroundColor: "#E0F2F1" },
  modalItemLocked: { opacity: 0.6 },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#0B3D1F" },
  modalItemTextLocked: { color: "#6B7280" },
  modalMetaRow: { marginTop: 4 },
  modalItemMeta: { fontSize: 13, color: "#4B5563" },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  badgeCompleted: {
    fontSize: 12,
    color: "#065F46",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeLocked: {
    fontSize: 12,
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },

  // AI Summary modal
  aiModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  aiModalSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  aiButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  aiButtonSecondary: {
    backgroundColor: "#E5E7EB",
  },
  aiButtonSecondaryText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
});
