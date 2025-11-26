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

const serializeStoryForRun = (story: StoryOption | null): string | null => {
  if (!story) return null;
  const { locked, ...payload } = story;
  try {
    return encodeURIComponent(JSON.stringify(payload));
  } catch {
    return null;
  }
};

type QuickAudio = {
  id: string;
  title: string;
  uri: string;
};

type PickerStep = "root" | "series" | "stories";

export default function QuickChallengeDetails() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  // Equipped pet
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

  // Stories
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
              (story) => story.progressKey === prev && !story.locked,
            )
          ) {
            return prev;
          }
          return result.flatStoryOptions.find((story) => !story.locked)?.progressKey ?? null;
        });
      } catch (error) {
        if (__DEV__) console.warn("[QuickChallenge] Failed to load Story Series", error);
        if (active) {
          setStorySections([]);
          setFlatStoryOptions([]);
          setSelectedStoryKey(null);
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
    () => flatStoryOptions.find((story) => story.progressKey === selectedStoryKey) ?? null,
    [flatStoryOptions, selectedStoryKey],
  );

  const storyBarLabel = useMemo(() => {
    if (hasUserChosenStory && selectedStory) return `Story: ${selectedStory.title}`;
    return "Choose a Story";
  }, [hasUserChosenStory, selectedStory]);

  const handleSelectStory = useCallback((story: StoryOption) => {
    if (story.locked) {
      Alert.alert("Locked Episode", "Finish the previous episode to unlock this one.");
      return;
    }
    setHasUserChosenStory(true);
    setSelectedStoryKey(story.progressKey);
    setStoryPickerOpen(false);
  }, []);

  // Audio picker
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<PickerStep>("root");
  const [selectedAudio, setSelectedAudio] = useState<QuickAudio | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<QuickAudio[]>([]);
  const [storiesOptions, setStoriesOptions] = useState<QuickAudio[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSeries = async () => {
    if (seriesOptions.length > 0) {
      setPickerStep("series");
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, "Story Series", "The herb of dawn");
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.log("❌ Story Series doc not found");
        setSeriesOptions([]);
        setPickerStep("series");
        return;
      }

      const data = snap.data() as Record<string, unknown>;
      const list: QuickAudio[] = [];

      Object.entries(data).forEach(([episodeKey, value]) => {
        if (Array.isArray(value)) {
          (value as unknown[]).forEach((url, index) => {
            if (typeof url === "string" && url.length > 0) {
              list.push({
                id: `${episodeKey}-${index}`,
                title: `${episodeKey} • Part ${index + 1}`,
                uri: url,
              });
            }
          });
        }
      });

      setSeriesOptions(list);
      setPickerStep("series");
    } catch (err) {
      console.error("🔥 Error loading Story Series:", err);
      setSeriesOptions([]);
      setPickerStep("series");
    } finally {
      setLoading(false);
    }
  };

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
        const uri: unknown = raw?.audioUrl || raw?.audioURI || raw?.audio;
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
    } catch (err) {
      console.error("🔥 Error loading stories:", err);
      setStoriesOptions([]);
      setPickerStep("stories");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    router.push({
      pathname: "/ChallengesPages/QuickRun",
      params: {
        audioUri: selectedAudio ? selectedAudio.uri : "",
        audioTitle: selectedAudio ? selectedAudio.title : "",
      },
    });
  };

  const openAudioPicker = () => {
    setPickerStep("root");
    setAudioPickerOpen(true);
  };

  const closeAudioPicker = () => {
    setAudioPickerOpen(false);
    setPickerStep("root");
  };

  const renderRootStep = () => (
    <>
      <TouchableOpacity style={styles.modeBtn} onPress={loadSeries} activeOpacity={0.9}>
        <Text style={styles.modeTitle}>📚 Story Series</Text>
        <Text style={styles.modeSubtitle}>Listen in episodes from a series.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.modeBtn} onPress={loadStories} activeOpacity={0.9}>
        <Text style={styles.modeTitle}>📖 Stories</Text>
        <Text style={styles.modeSubtitle}>Pick from saved AI stories.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeBtn, { backgroundColor: "#FEE2E2" }]}
        onPress={() => {
          setSelectedAudio(null);
          closeAudioPicker();
        }}
        activeOpacity={0.9}
      >
        <Text style={[styles.modeTitle, { color: "#991B1B" }]}>🚫 No Audio</Text>
        <Text style={[styles.modeSubtitle, { color: "#7F1D1D" }]}>
          Run silently without any story.
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderListStep = (data: QuickAudio[], emptyLabel: string) => (
    <>
      <TouchableOpacity onPress={() => setPickerStep("root")} style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: "700", color: "#2563EB" }}>← Back</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 16 }} />
      ) : data.length === 0 ? (
        <Text style={{ marginTop: 16, color: "#4B5563" }}>{emptyLabel}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.audioOption}
              onPress={() => {
                setSelectedAudio(item);
                closeAudioPicker();
              }}
            >
              <Text style={styles.audioOptionText}>{item.title}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </>
  );

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
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
                  const xpNow = typeof equippedPet?.xp === "number" ? equippedPet.xp : 0;
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
            if (!flatStoryOptions.length) {
              Alert.alert("No stories", "Story Series episodes will appear here soon.");
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

        {/* How it works */}
        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>- Your position and distance are recorded on the map.</Text>
          <Text style={styles.item}>- Tap Finish whenever you're done.</Text>
        </View>

        {/* XP Rules */}
        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- You earn 1 XP for every 5 steps.</Text>
          <Text style={styles.item}>- Partial kms don’t count (1.5 km → 1 km).</Text>
          <Text style={styles.item}>- Only your equipped pet evolves.</Text>
        </View>

        {/* Audio summary + button */}
        <Pressable onPress={openAudioPicker} style={styles.audioBtn}>
          <Text style={styles.audioBtnText}>
            {selectedAudio ? `Audio: ${selectedAudio.title}` : "Choose Audio 🎵"}
          </Text>
        </Pressable>

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
              <ScrollView style={{ maxHeight: 320 }}>
                {storiesLoading ? (
                  <Text style={styles.modalEmpty}>Loading stories...</Text>
                ) : flatStoryOptions.length === 0 ? (
                  <Text style={styles.modalEmpty}>No stories found</Text>
                ) : (
                  storySections.map((section) => {
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
                                  <View style={styles.modalMetaRow}>
                                    <Text style={styles.modalItemMeta}>
                                      {story.distanceMeters
                                        ? `${(story.distanceMeters / 1000).toFixed(1)} km`
                                        : "-"}{" "}
                                      •{" "}
                                      {story.estimatedTimeMin ??
                                        story.durationMinutes ??
                                        "--"}{" "}
                                      min
                                    </Text>
                                    <View style={styles.badgeRow}>
                                      {story.completed ? (
                                        <Text style={styles.badgeCompleted}>Completed</Text>
                                      ) : null}
                                      {story.locked ? (
                                        <Text style={styles.badgeLocked}>Locked</Text>
                                      ) : null}
                                    </View>
                                  </View>
                                </Pressable>
                              );
                            })
                          : null}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* Audio Picker Modal */}
        <Modal visible={audioPickerOpen} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={closeAudioPicker}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choose Audio</Text>

              {pickerStep === "root" && renderRootStep()}

              {pickerStep === "series" &&
                renderListStep(seriesOptions, "No episodes found in Story Series.")}

              {pickerStep === "stories" &&
                renderListStep(storiesOptions, "No stories with audio found.")}
            </View>
          </Pressable>
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
  },
  title: { fontSize: 18, fontWeight: "900", color: "#0B3D1F", marginBottom: 8 },
  item: { fontSize: 15, fontWeight: "700", color: "#0B3D1F", marginVertical: 2 },

  audioBtn: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: "#A5D6A7",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  audioBtnText: { fontSize: 16, fontWeight: "800", color: "#0B3D1F" },

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
