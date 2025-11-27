// FULL UPDATED QuickChallengeDetails.tsx
// Story Picker + Herb of Dawn kept, Stories + No Audio added inside Story Picker

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { PET_MAX_LEVEL, PET_XP_PER_LEVEL } from "@/src/lib/playerProgress";
import { loadStoryPickerData, SeasonSection, StoryOption } from "@/src/lib/storyPicker";

const bgImage = require("../../assets/images/ImageBackground.jpg");

const QUICK_CHALLENGE_ID = "quick-challenge";
const QUICK_VARIANT_ID: "easy" | "hard" = "easy";

type QuickAudio = {
  id: string;
  title: string;
  uri: string;
};

export default function QuickChallengeDetails() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  /* -------------------------------
      Equipped Pet
  ------------------------------- */
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
    if (!uid || !equippedPetId) {
      setEquippedPet(null);
      return;
    }
    const unsubPet = onSnapshot(
      doc(db, "Users", uid, "pets", equippedPetId),
      (snap) => {
        if (!snap.exists()) return setEquippedPet(null);
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
      }
    );
    return () => unsubPet();
  }, [uid, equippedPetId]);

  const levelInfo = useMemo(() => {
    if (!equippedPet) {
      return { level: 0, progressPct: 0, remainXp: PET_XP_PER_LEVEL, atMax: false };
    }
    const xp = equippedPet.xp ?? 0;
    const evoLevel = Math.floor(xp / PET_XP_PER_LEVEL);
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
    return {
      level: evoLevel,
      progressPct: progress,
      remainXp: PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL || 0),
      atMax: evoLevel >= PET_MAX_LEVEL,
    };
  }, [equippedPet]);

  /* -------------------------------
      STORY PICKER SYSTEM
      (FireStore Stories/Season/Episodes)
  ------------------------------- */
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
          includePetStory: false,
          includeSeasonSeries: true,
        });

        if (!active) return;
        setStorySections(result.seasonSections);
        setFlatStoryOptions(result.flatStoryOptions);

        setSelectedStoryKey((prev) => {
          if (
            prev &&
            result.flatStoryOptions.some(
              (s) => s.progressKey === prev && !s.locked,
            )
          ) {
            return prev;
          }
          return result.flatStoryOptions.find((s) => !s.locked)?.progressKey ?? null;
        });
      } catch (err) {
        setStorySections([]);
        setFlatStoryOptions([]);
        setSelectedStoryKey(null);
      } finally {
        if (active) setStoriesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  const selectedStory = useMemo(
    () => flatStoryOptions.find((s) => s.progressKey === selectedStoryKey) ?? null,
    [flatStoryOptions, selectedStoryKey]
  );

  const storyBarLabel =
    hasUserChosenStory && selectedStory
      ? `Story: ${selectedStory.title}`
      : "Choose a Story";

  const handleSelectStory = (story: StoryOption) => {
    if (story.locked) {
      Alert.alert("Locked Episode", "Finish the previous episode first.");
      return;
    }
    setHasUserChosenStory(true);
    setSelectedStoryKey(story.progressKey);
    setStoryPickerOpen(false);
  };

  /* -------------------------------
      AUDIO STATE FOR QuickRun
      (used by Stories + No Audio)
  ------------------------------- */
  const [selectedAudio, setSelectedAudio] = useState<QuickAudio | null>(null);

  /* -------------------------------
      HERB OF DAWN — CLEAN + ORDERED
      (kept as is, NOT touched)
  ------------------------------- */

  const [audioPickerOpen, setAudioPickerOpen] = useState(false); // no longer used in UI
  const [pickerStep, setPickerStep] = useState<"root" | "herb" | "stories">("root");
  const [seriesOptions, setSeriesOptions] = useState<
    { episodeKey: string; episodeLabel: string; parts: QuickAudio[] }[]
  >([]);
  const [storiesOptions, setStoriesOptions] = useState<QuickAudio[]>([]);
  const [loading, setLoading] = useState(false);

  // Herb of Dawn loader (unchanged)
  const loadHerbOfDawn = async () => {
    if (seriesOptions.length > 0) {
      setPickerStep("herb");
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, "Story Series", "The herb of dawn");
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        console.log("❌ Herb of Dawn not found");
        setSeriesOptions([]);
        setPickerStep("herb");
        return;
      }

      const data = snap.data() as Record<string, any>;

      const orderedEpisodes = [
        "Episode1",
        "Episode2",
        "Episode3",
        "Episode4",
        "Episode5",
      ];

      const grouped = orderedEpisodes
        .filter((ep) => data[ep])
        .map((episodeKey, i) => {
          const rawParts = data[episodeKey];
          const parts: QuickAudio[] = [];

          if (Array.isArray(rawParts)) {
            rawParts.forEach((url, idx) => {
              if (typeof url === "string" && url.length > 0) {
                parts.push({
                  id: `${episodeKey}-part-${idx}`,
                  title: `Part ${idx + 1}`,
                  uri: url,
                });
              }
            });
          }

          return {
            episodeKey,
            episodeLabel: `Episode ${i + 1}`,
            parts,
          };
        });

      setSeriesOptions(grouped);
      setPickerStep("herb");
    } catch (err) {
      console.error("🔥 Error loading Herb of Dawn:", err);
      setSeriesOptions([]);
      setPickerStep("herb");
    } finally {
      setLoading(false);
    }
  };

  // Stories loader (AI saved) — reused both by old audio system and new Story Picker section
  const loadStories = async () => {
    if (storiesOptions.length > 0) {
      setPickerStep("stories");
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "stories"));
      const list: QuickAudio[] = [];

      snap.forEach((docSnap) => {
        const raw = docSnap.data() as any;
        const uri = raw?.audioUrl || raw?.audioURI || raw?.audio;
        if (typeof uri === "string" && uri.length > 0) {
          list.push({
            id: docSnap.id,
            title: String(raw?.title ?? "Story"),
            uri,
          });
        }
      });

      setStoriesOptions(list);
      setPickerStep("stories");
    } catch {
      setStoriesOptions([]);
      setPickerStep("stories");
    } finally {
      setLoading(false);
    }
  };

  // When Story Picker opens, make sure audio "Stories" are loaded once
  useEffect(() => {
    if (storyPickerOpen && storiesOptions.length === 0) {
      loadStories().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyPickerOpen]);

  /* -------------------------------
      Start Quick Run
  ------------------------------- */
  const handleStart = () => {
    router.push({
      pathname: "/ChallengesPages/QuickRun",
      params: {
        audioUri: selectedAudio ? selectedAudio.uri : "",
        audioTitle: selectedAudio ? selectedAudio.title : "",
      },
    });
  };

  /* -------------------------------
      FINAL UI
  ------------------------------- */

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.h1}>Quick Challenge</Text>
          <Text style={styles.h2}>Start anywhere. Finish anytime.</Text>
        </View>

        {/* Equipped pet */}
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
                  {(equippedPet.name ?? "Pet").toUpperCase()}
                </Text>

                {/* Level progress */}
                {(() => {
                  const stageIdx = Math.min(
                    2,
                    Math.floor((equippedPet.xp ?? 0) / PET_XP_PER_LEVEL),
                  );
                  const atMax = stageIdx >= 2;
                  return (
                    <>
                      {!atMax && (
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
                        {atMax
                          ? "Lvl 3 MAX!"
                          : `Lvl ${stageIdx + 1} · Next in ${levelInfo.remainXp} XP`}
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
            if (!flatStoryOptions.length) {
              Alert.alert("No stories", "Story Series episodes coming soon.");
              return;
            }
            setStoryPickerOpen(true);
          }}
          style={styles.storyBar}
        >
          <Text style={styles.storyText} numberOfLines={1}>
            {storyBarLabel}
          </Text>
          {flatStoryOptions.length > 0 && (
            <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
          )}
        </Pressable>

        {/* Cards */}
        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>- Your distance is recorded on the map.</Text>
          <Text style={styles.item}>- Tap Finish whenever you’re done.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- 1 XP per 5 steps.</Text>
          <Text style={styles.item}>- Only equipped pet evolves.</Text>
        </View>

        {/* Start Button */}
        <Pressable
          onPress={handleStart}
          style={({ pressed }) => [
            styles.startBtn,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        {/* Story Picker Modal (now includes Stories + No Audio at bottom) */}
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
                {storiesLoading ? (
                  <Text style={styles.modalEmpty}>Loading...</Text>
                ) : flatStoryOptions.length === 0 ? (
                  <Text style={styles.modalEmpty}>No stories found</Text>
                ) : (
                  <>
                    {/* Seasons / Episodes (Herb-style story picker) */}
                    {storySections.map((section) => {
                      const expanded = expandedSeasonId === section.seasonId;
                      return (
                        <View key={section.seasonId} style={styles.modalSeason}>
                          <Pressable
                            onPress={() =>
                              setExpandedSeasonId(expanded ? null : section.seasonId)
                            }
                          >
                            <View style={styles.modalHeaderRow}>
                              <View style={{ flexShrink: 1 }}>
                                <Text style={styles.modalSectionTitle}>{section.title}</Text>
                                <Text style={styles.modalSectionSubtitle}>
                                  {section.episodes.length} Episodes
                                </Text>
                              </View>
                              <Ionicons
                                name={expanded ? "chevron-up" : "chevron-down"}
                                size={18}
                                color="#0B3D1F"
                              />
                            </View>
                          </Pressable>

                          {expanded &&
                            section.episodes.map((story) => {
                              const active = selectedStoryKey === story.progressKey;
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
                                      story.locked && styles.modalItemTextLocked,
                                    ]}
                                  >
                                    {story.title}
                                  </Text>
                                </Pressable>
                              );
                            })}
                        </View>
                      );
                    })}

                    {/* Divider */}
                    <View style={{ height: 1, backgroundColor: "#E5E7EB", marginVertical: 8 }} />

                    {/* STORIES (Audio) + NO AUDIO inside same modal */}
                    <View style={styles.modalSeason}>
                      <Text style={styles.modalSectionTitle}>Stories (Audio)</Text>

                      {loading && storiesOptions.length === 0 ? (
                        <Text style={styles.modalEmpty}>Loading audio stories...</Text>
                      ) : storiesOptions.length === 0 ? (
                        <Text style={styles.modalEmpty}>No audio stories found</Text>
                      ) : (
                        storiesOptions.map((audio) => (
                          <Pressable
                            key={audio.id}
                            style={styles.modalItem}
                            onPress={() => {
                              setSelectedAudio(audio);
                              setStoryPickerOpen(false);
                            }}
                          >
                            <Text style={styles.modalItemText}>{audio.title}</Text>
                          </Pressable>
                        ))
                      )}

                      {/* No Audio option */}
                      <Pressable
                        style={[
                          styles.modalItem,
                          { backgroundColor: "#FEE2E2", marginTop: 8 },
                        ]}
                        onPress={() => {
                          setSelectedAudio(null);
                          setStoryPickerOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.modalItemText,
                            { color: "#991B1B" },
                          ]}
                        >
                          🚫 No Audio
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

/* -------------------------------
      Styles
------------------------------- */
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
  },
  title: { fontSize: 18, fontWeight: "900", color: "#0B3D1F", marginBottom: 8 },
  item: { fontSize: 15, fontWeight: "700", color: "#0B3D1F", marginVertical: 2 },

  startBtn: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: "#22C55E",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  // Equipped pet
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

  // Story bar
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

  // Modals
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
    maxHeight: "60%",
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

  modeBtn: {
    backgroundColor: "#E5F9E7",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  modeTitle: { fontSize: 16, fontWeight: "900", color: "#0B3D1F" },
  modeSubtitle: { fontSize: 13, color: "#374151", marginTop: 2 },

  audioOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  audioOptionText: { fontSize: 15, fontWeight: "700", color: "#111827" },
});
