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
  Alert,
  KeyboardAvoidingView,
  TextInput,
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import {
  ChallengeStats,
  getChallengeRatingStats,
  getUserChallengeRating,
} from "../../src/lib/firestoreChallenges";
import {
  extractVariantCompletion,
  isChallengeFullyLocked,
  VariantCompletionFlags,
} from "../../src/lib/challengeRuns";
import { describeSegmentsMeta } from "../../src/lib/stories";
import {
  loadStoryPickerData,
  SeasonSection,
  StoryOption,
} from "../../src/lib/storyPicker";
import { generateVoiceFromElevenLabs } from "../../src/lib/services/ttsEleven";
import { formalizeStory } from "../../src/lib/services/aiFormalize";

/* ------------------------ category backgrounds ------------------------ */
const defaultBg = require("../../assets/images/ImageBackground.jpg");
const bgByCategory: Record<string, any> = {
  city: require("../../assets/images/CityBg.jpg"),
  mountain: require("../../assets/images/mountainss.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/seaa.jpg"),
};

/* ------------------------ category palettes ------------------------ */
const PALETTES = {
  city: {
    light: "#EDEEF0",
    mid: "#BFC5CE",
    strong: "#4B5563",
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
    light: "#FFECEB",
    mid: "#F8B4AB",
    strong: "#E11D48",
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
    light: "#FFF2E0",
    mid: "#F6C995",
    strong: "#D97706",
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
    light: "#E6F6FF",
    mid: "#9EDBFF",
    strong: "#0284C7",
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

type AiStoryDoc = {
  id: string;
  title: string;
  text: string;
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
  const userId = auth.currentUser?.uid ?? null;
  const normalizedId = useMemo(() => {
    if (typeof id === "string") return id;
    if (Array.isArray(id)) return id[0] ?? null;
    if (typeof id === "number") return String(id);
    return null;
  }, [id]);

  const [data, setData] = useState<ChallengeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"easy" | "hard">("easy");
  const [ratingStats, setRatingStats] = useState<ChallengeStats | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);

  // segmented stories (Herb / Pet)
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [petStoryOptions, setPetStoryOptions] = useState<StoryOption[]>([]);
  const [seasonSections, setSeasonSections] = useState<SeasonSection[]>([]);
  const [flatStoryOptions, setFlatStoryOptions] = useState<StoryOption[]>([]);
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null);

  // AI Stories (from Firestore collection "stories")
  const [aiStories, setAiStories] = useState<AiStoryDoc[]>([]);
  const [aiStoriesLoading, setAiStoriesLoading] = useState(false);
  const [selectedAiStoryId, setSelectedAiStoryId] = useState<string | null>(
    null,
  );
  const [aiStoryAudioCache, setAiStoryAudioCache] = useState<
    Record<string, string>
  >({});
  const [aiStoryGeneratingId, setAiStoryGeneratingId] = useState<string | null>(
    null,
  );
  const [aiStoryAudioUrl, setAiStoryAudioUrl] = useState<string | null>(null);

  // AI Summary
  const [aiSummaryModalOpen, setAiSummaryModalOpen] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [aiSummaryGenerating, setAiSummaryGenerating] = useState(false);
  const [aiSummaryAudioUrl, setAiSummaryAudioUrl] = useState<string | null>(
    null,
  );

  // selection mode
  const [selectionKind, setSelectionKind] = useState<
    "segments" | "aiStory" | "aiSummary" | "noAudio" | null
  >(null);
  const [hasUserChosenStory, setHasUserChosenStory] = useState(false);

  // locks
  const [variantCompletions, setVariantCompletions] =
    useState<VariantCompletionFlags>({
      easy: false,
      hard: false,
    });
  const [locksReady, setLocksReady] = useState(false);
  const lockedNavRef = useRef(false);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const rewardAnim = useRef(new Animated.Value(0)).current;
  const statsAnim = useRef(new Animated.Value(0)).current;

  /* ------------------ fetch challenge doc ------------------ */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!normalizedId) return;
        const ref = doc(db, "challenges", normalizedId);
        const snap = await getDoc(ref);
        if (snap.exists() && active) {
          const d = snap.data() as ChallengeDoc;
          setData(d);
          if (d.variants?.hard && !d.variants?.easy) setTab("hard");
        } else if (active) {
          setData(null);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn("Failed to load challenge:", e);
        }
        if (active) {
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [normalizedId]);

  /* ------------------ header animations ------------------ */
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

  /* ------------------ ratings ------------------ */
  useFocusEffect(
    useCallback(() => {
      let active = true;
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
            console.warn("[ChallengeDetails] rating stats fetch failed", error);
          }
        }
      })();

      return () => {
        active = false;
      };
    }, [normalizedId]),
  );

  /* ------------------ variant completions (locks) ------------------ */
  useEffect(() => {
    let active = true;

    if (!normalizedId || !userId) {
      setVariantCompletions({ easy: false, hard: false });
      setLocksReady(true);
      return () => {
        active = false;
      };
    }

    setLocksReady(false);
    (async () => {
      try {
        const runRef = doc(db, "Users", userId, "challengeRuns", normalizedId);
        const snap = await getDoc(runRef);
        if (!active) return;
        if (snap.exists()) {
          const flags = extractVariantCompletion(snap.data());
          setVariantCompletions(flags);
        } else {
          setVariantCompletions({ easy: false, hard: false });
        }
      } catch {
        if (active) {
          setVariantCompletions({ easy: false, hard: false });
        }
      } finally {
        if (active) setLocksReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [normalizedId, userId]);

  /* ------------------ load segmented stories (Herb + Pet) ------------------ */
  useEffect(() => {
    let active = true;
    if (!data || !normalizedId) {
      setPetStoryOptions([]);
      setSeasonSections([]);
      setFlatStoryOptions([]);
      setSelectedStoryKey(null);
      setStoriesLoading(false);
      return () => {
        active = false;
      };
    }

    setStoriesLoading(true);
    (async () => {
      try {
        const result = await loadStoryPickerData({
          challengeDoc: data,
          challengeId: normalizedId,
          variantId: tab,
          userId,
        });
        if (!active) return;
        setPetStoryOptions(result.petStoryOptions);
        setSeasonSections(result.seasonSections);
        setFlatStoryOptions(result.flatStoryOptions);

        setSelectedStoryKey((prev) => {
          // لو الاختيار السابق ما عاد موجود أو كان null → نختار أول واحدة
          const stillValid =
            prev &&
            result.flatStoryOptions.some(
              (story) => story.progressKey === prev && !story.locked,
            );
          if (stillValid) return prev;
          const first =
            result.flatStoryOptions.find((story) => !story.locked) ?? null;
          if (first && !selectionKind) {
            setSelectionKind("segments");
            setHasUserChosenStory(true);
          }
          return first?.progressKey ?? null;
        });
      } catch (error) {
        if (__DEV__) {
          console.warn("[ChallengeDetails] failed to load stories", error);
        }
        if (active) {
          setPetStoryOptions([]);
          setSeasonSections([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, normalizedId, tab, userId]);

  /* ------------------ load AI stories (Firestore `stories`) ------------------ */
  useEffect(() => {
    let active = true;
    setAiStoriesLoading(true);
    (async () => {
      try {
        const ref = collection(db, "stories");
        const snap = await getDocs(ref);
        const list: AiStoryDoc[] = [];
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
      } catch (error) {
        if (__DEV__) {
          console.warn("[ChallengeDetails] failed to load AI stories", error);
        }
        if (active) setAiStories([]);
      } finally {
        if (active) setAiStoriesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* ------------------ lock navigation guard ------------------ */
  const challengeLocked = useMemo(
    () => isChallengeFullyLocked(variantCompletions),
    [variantCompletions],
  );

  const currentVariantLocked = useMemo(() => {
    if (challengeLocked) return true;
    return tab === "hard" ? variantCompletions.hard : variantCompletions.easy;
  }, [challengeLocked, tab, variantCompletions]);

  useEffect(() => {
    if (!locksReady || !challengeLocked || lockedNavRef.current) return;
    lockedNavRef.current = true;
    Alert.alert("Challenge locked", "You've already completed both difficulties.", [
      {
        text: "OK",
        onPress: () => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/challenges");
        },
      },
    ]);
  }, [locksReady, challengeLocked, router]);

  /* ------------------ derived values ------------------ */
  const effectiveCategory = (category || data?.categoryId || "city")
    .toString()
    .toLowerCase();
  const pal = getPalette(effectiveCategory);
  const bgSource = bgByCategory[effectiveCategory] ?? defaultBg;

  const variant: Variant | undefined = useMemo(
    () => data?.variants?.[tab],
    [data, tab],
  );

  const selectedStory = useMemo(
    () =>
      flatStoryOptions.find((story) => story.progressKey === selectedStoryKey) ??
      null,
    [flatStoryOptions, selectedStoryKey],
  );

  const selectedAiStory = useMemo(
    () => aiStories.find((s) => s.id === selectedAiStoryId) ?? null,
    [aiStories, selectedAiStoryId],
  );

  const storySegmentDescription = useMemo(
    () =>
      selectionKind === "segments"
        ? describeSegmentsMeta(selectedStory)
        : null,
    [selectedStory, selectionKind],
  );

  const storySelectionRequired =
    flatStoryOptions.length > 0 || aiStories.length > 0;

  const startDisabled = useMemo(() => {
    if (!locksReady || currentVariantLocked) return true;

    // لازم يختار حاجة إذا عندنا قصص
    if (storySelectionRequired && !selectionKind && !hasUserChosenStory) {
      return true;
    }

    // segmented story
    if (selectionKind === "segments") {
      return storySelectionRequired && !selectedStory;
    }

    // AI Story يحتاج audio جاهز
    if (selectionKind === "aiStory") {
      return !aiStoryAudioUrl;
    }

    // AI Summary يحتاج audio
    if (selectionKind === "aiSummary") {
      return !aiSummaryAudioUrl;
    }

    // noAudio أو null
    return false;
  }, [
    locksReady,
    currentVariantLocked,
    storySelectionRequired,
    selectionKind,
    hasUserChosenStory,
    selectedStory,
    aiStoryAudioUrl,
    aiSummaryAudioUrl,
  ]);

  const startLabel = !locksReady
    ? "Loading…"
    : challengeLocked || currentVariantLocked
    ? "Completed"
    : "Start Challenge";

  const storyBarText = useMemo(() => {
    if (storiesLoading || aiStoriesLoading) return "Loading stories...";
    if (!storySelectionRequired)
      return "No stories available yet";

    if (selectionKind === "segments" && selectedStory) {
      return `Story: ${selectedStory.title}`;
    }
    if (selectionKind === "aiStory" && selectedAiStory) {
      return `AI Story: ${selectedAiStory.title}`;
    }
    if (selectionKind === "aiSummary" && aiSummaryAudioUrl) {
      return "AI Summary (custom)";
    }
    if (selectionKind === "noAudio") return "No audio";

    return "Choose a Story";
  }, [
    storiesLoading,
    aiStoriesLoading,
    storySelectionRequired,
    selectionKind,
    selectedStory,
    selectedAiStory,
    aiSummaryAudioUrl,
  ]);

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
    const v: any = data?.variants?.[tab] ?? {};
    const vPet: any = v?.pet ?? {};
    const vImages: string[] | null = Array.isArray(v?.petImages)
      ? v.petImages
      : Array.isArray(vPet?.images)
      ? vPet.images
      : null;
    const fromVariantArray =
      vImages && vImages.length > 0 && typeof vImages[0] === "string"
        ? vImages[0]
        : null;
    const fromVariantSingle =
      typeof v?.petImageUrl === "string"
        ? v.petImageUrl
        : typeof vPet?.imageUrl === "string"
        ? vPet.imageUrl
        : null;
    if (fromVariantArray) return fromVariantArray;
    if (fromVariantSingle) return fromVariantSingle;

    if (typeof data.petImageUrl === "string" && data.petImageUrl.length > 0) {
      return data.petImageUrl;
    }
    if (typeof data.imageUrl === "string" && data.imageUrl.length > 0) {
      return data.imageUrl;
    }
    return null;
  }, [data, tab]);

  const rewardPoints = useMemo(() => {
    if (typeof data?.rewardPoints === "number" && Number.isFinite(data.rewardPoints)) {
      return data.rewardPoints;
    }
    if (typeof variant?.xp === "number" && Number.isFinite(variant.xp)) {
      return variant.xp;
    }
    return null;
  }, [data, variant]);

  const statDistance = selectedStory?.distanceMeters ?? variant?.distanceMeters;
  const statCalories = selectedStory?.calories ?? variant?.calories;
  const statTime = selectedStory?.estimatedTimeMin ?? variant?.estimatedTimeMin;

  /* ------------------ handlers ------------------ */

  const handleSelectStory = useCallback(
    (story: StoryOption) => {
      if (story.locked) {
        Alert.alert(
          "Locked episode",
          "Finish the previous episode to unlock this story.",
        );
        return;
      }
      setHasUserChosenStory(true);
      setSelectionKind("segments");
      setSelectedStoryKey(story.progressKey);
      setSelectedAiStoryId(null);
      setAiStoryAudioUrl(null);
      setAiSummaryAudioUrl(null);
      setStoryPickerOpen(false);
    },
    [],
  );

  const handleSelectAiStory = useCallback(
    async (story: AiStoryDoc) => {
      try {
        setStoryPickerOpen(false);
        setHasUserChosenStory(true);
        setSelectionKind("aiStory");
        setSelectedAiStoryId(story.id);
        setSelectedStoryKey(null);
        setAiSummaryAudioUrl(null);

        setAiStoryGeneratingId(story.id);

        let uri = aiStoryAudioCache[story.id];
        if (!uri) {
          const audio = await generateVoiceFromElevenLabs(story.text);
          uri = audio;
          setAiStoryAudioCache((prev) => ({
            ...prev,
            [story.id]: uri!,
          }));
        }
        setAiStoryAudioUrl(uri);
      } catch (error: any) {
        console.warn("[ChallengeDetails] AI story audio failed", error);
        Alert.alert(
          "AI Story error",
          error?.message ?? "Failed to generate AI story audio.",
        );
        setSelectionKind(null);
        setSelectedAiStoryId(null);
        setAiStoryAudioUrl(null);
      } finally {
        setAiStoryGeneratingId(null);
      }
    },
    [aiStoryAudioCache],
  );

  const openAiSummaryModal = useCallback(() => {
    setAiSummaryModalOpen(true);
  }, []);

  const handleGenerateAiSummary = useCallback(async () => {
    const trimmed = aiSummaryText.trim();
    if (!trimmed) {
      Alert.alert("Write something", "Please enter a short text first.");
      return;
    }
    try {
      setAiSummaryGenerating(true);
      // 1) Gemini يلخص/يحول النص لقصة قصيرة
      const storyText = await formalizeStory(trimmed);
      // 2) ElevenLabs يحوله لصوت واحد كامل
      const audioUrl = await generateVoiceFromElevenLabs(storyText);
      setAiSummaryAudioUrl(audioUrl);
      setAiStoryAudioUrl(null);
      setSelectedAiStoryId(null);
      setSelectedStoryKey(null);
      setSelectionKind("aiSummary");
      setHasUserChosenStory(true);
      setAiSummaryModalOpen(false);
    } catch (error: any) {
      console.warn("[ChallengeDetails] AI summary audio failed", error);
      Alert.alert(
        "AI Summary error",
        error?.message ?? "Failed to generate summary audio.",
      );
    } finally {
      setAiSummaryGenerating(false);
    }
  }, [aiSummaryText]);

  const handleSelectNoAudio = useCallback(() => {
    setSelectionKind("noAudio");
    setHasUserChosenStory(true);
    setSelectedStoryKey(null);
    setSelectedAiStoryId(null);
    setAiStoryAudioUrl(null);
    setAiSummaryAudioUrl(null);
    setStoryPickerOpen(false);
  }, []);

  const handleStart = () => {
    if (!normalizedId) {
      Alert.alert(
        "Missing challenge",
        "We couldn't load this challenge. Please try again.",
      );
      return;
    }
    if (!locksReady) {
      Alert.alert("Please wait", "Checking your challenge status…");
      return;
    }
    if (challengeLocked) {
      Alert.alert(
        "Challenge locked",
        "You've already completed both easy and hard modes.",
      );
      return;
    }
    if (currentVariantLocked) {
      const label = tab === "easy" ? "Easy" : "Hard";
      Alert.alert("Difficulty locked", `You've already completed the ${label} mode.`);
      return;
    }

    if (storySelectionRequired && !selectionKind && !hasUserChosenStory) {
      Alert.alert("Choose a Story", "Select a story or choose No audio.");
      return;
    }

    const params: Record<string, string> = {
      challengeId: normalizedId,
      title: data?.title || title || "Challenge",
      category: effectiveCategory,
      difficulty: tab,
    };

    // 1) segmented stories (Herb / Pet)
    if (selectionKind === "segments" && selectedStory) {
      if (selectedStory.type === "season" || selectedStory.type === "pet") {
        params.storyType = selectedStory.type;
        if (selectedStory.seasonId)
          params.storySeasonId = selectedStory.seasonId;
        if (selectedStory.episodeId)
          params.storyEpisodeId = selectedStory.episodeId;
        if (selectedStory.petKey) params.storyPetKey = selectedStory.petKey;
        params.storyId = selectedStory.id ?? selectedStory.progressKey;
      }
      // (لا نرسل audioUrl هنا – map screen هو اللي يشغل segments)
    }

    // 2) AI Story (صوت واحد كامل من Firestore)
    if (selectionKind === "aiStory" && aiStoryAudioUrl && selectedAiStory) {
      params.audioUrl = aiStoryAudioUrl;
      params.storyTitle = selectedAiStory.title;
    }

    // 3) AI Summary (صوت واحد من نص المستخدم)
    if (selectionKind === "aiSummary" && aiSummaryAudioUrl) {
      params.audioUrl = aiSummaryAudioUrl;
      params.storyTitle = "AI Summary Story";
    }

    // 4) noAudio → ما نضيف شيء

    router.push({
      pathname: "/ChallengesPages/map",
      params,
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
                      backgroundColor: active
                        ? t === "easy"
                          ? pal.easyBg
                          : pal.hardBg
                        : pal.light,
                      borderColor: pal.tabBorder,
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

          {/* Rewards */}
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
            <View
              style={[
                styles.rewardSquare,
                { backgroundColor: pal.rewardSquareBg },
              ]}
            >
              {rewardImage ? (
                <Image
                  source={{ uri: rewardImage }}
                  style={styles.rewardImage}
                  resizeMode="contain"
                />
              ) : (
                <MaterialCommunityIcons name="bird" size={72} color="#0B3D1F" />
              )}
            </View>
            <Text style={styles.rewardPetName}>
              {(() => {
                const v: any = data?.variants?.[tab] ?? {};
                const vPet: any = v?.pet ?? {};
                const vn =
                  typeof v?.rewardPet === "string"
                    ? v.rewardPet
                    : typeof vPet?.name === "string"
                    ? vPet.name
                    : typeof vPet?.id === "string"
                    ? vPet.id
                    : undefined;
                return vn ?? data?.rewardPet ?? "-";
              })()}
            </Text>
            <View
              style={[
                styles.pointsPill,
                { backgroundColor: pal.pointsPillBg, borderColor: pal.tabBorder },
              ]}
            >
              <Text style={styles.pointsText}>
                {rewardPoints !== null
                  ? `${Math.round(rewardPoints).toLocaleString()} points`
                  : "Reward awaits!"}
              </Text>
            </View>
          </Animated.View>

          {/* Choose Story bar */}
          <Pressable
            onPress={() => setStoryPickerOpen(true)}
            style={[
              styles.storyBar,
              { backgroundColor: pal.storyBarBg, borderColor: pal.tabBorder },
            ]}
          >
            <Text style={styles.storyBarText} numberOfLines={1}>
              {storyBarText}
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
              <Text style={[styles.statItem, styles.statsLeft]}>
                👣 {mToKm(statDistance)}
              </Text>
              <Text style={[styles.statItem, styles.statsCenter]}>
                🔥 {statCalories ?? "--"} cal
              </Text>
              <Text style={[styles.statItem, styles.statsRight]}>
                <Ionicons name="time-outline" size={16} /> {statTime ?? "--"} min
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: pal.divider }]} />

            <View style={styles.metaRow}>
              <Text style={[styles.smallDim, styles.metaCell, styles.metaLeft]}>
                {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge plays
              </Text>
              <View style={[styles.metaCell, styles.metaCenter]}>
                {ratingStats && ratingStats.ratingCount > 0 ? (
                  <View style={styles.ratingInline}>
                    <Ionicons name="star" size={15} color="#F59E0B" />
                    <Text style={styles.smallDim}>
                      {ratingStats.ratingAvg.toFixed(1)} ({ratingStats.ratingCount})
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.metaCell, styles.metaRight]}>
                {userRating ? (
                  <View style={styles.ratingInline}>
                    <Text style={[styles.smallDim, styles.smallDimOwn]}>
                      your rating: {userRating}
                    </Text>
                    <Ionicons name="star" size={15} color="#F59E0B" />
                  </View>
                ) : null}
              </View>
            </View>

            {selectionKind === "segments" && selectedStory && storySegmentDescription ? (
              <>
                <View
                  style={[styles.divider, { backgroundColor: pal.divider }]}
                />
                <View style={styles.storySegmentRow}>
                  <Text style={styles.storySegmentLabel}>Story Segments</Text>
                  <Text style={styles.storySegmentValue}>
                    {storySegmentDescription}
                  </Text>
                </View>
              </>
            ) : null}
          </Animated.View>
        </ScrollView>

        {/* Fixed footer CTA */}
        <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            style={[
              styles.cta,
              { backgroundColor: pal.ctaBg, borderColor: pal.tabBorder },
              startDisabled && styles.ctaDisabled,
            ]}
            onPress={handleStart}
            disabled={startDisabled}
          >
            <Text style={[styles.ctaText, { color: pal.ctaText }]}>
              {startLabel}
            </Text>
          </Pressable>
        </View>

        {/* Story Picker */}
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
                    {/* Herb / Season stories */}
                    {seasonSections.map((section) => {
                      const expanded = true; // نخليها مفتوحة دايم مثل Herb of Dawn
                      return (
                        <View
                          key={section.seasonId}
                          style={styles.modalSeason}
                        >
                          <View style={styles.storyRowHeader}>
                            <Text style={styles.modalSectionTitle}>
                              {section.title}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {section.episodes.every((episode) => episode.completed) ? (
                                <Text style={styles.completedBadge}>
                                  Completed
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {expanded
                            ? section.episodes.map((ep) =>
                                renderStoryOption(ep, handleSelectStory, pal, selectedStoryKey),
                              )
                            : null}
                        </View>
                      );
                    })}

                    {/* Pet Story */}
                    {petStoryOptions.length ? (
                      <View style={styles.modalSeason}>
                        <Text style={styles.modalSectionTitle}>Pet Story</Text>
                        {petStoryOptions.map((story) =>
                          renderStoryOption(
                            story,
                            handleSelectStory,
                            pal,
                            selectedStoryKey,
                          ),
                        )}
                      </View>
                    ) : null}

                    {/* AI Stories */}
                    {aiStories.length ? (
                      <View style={styles.modalSeason}>
                        <Text style={styles.modalSectionTitle}>AI Stories</Text>
                        {aiStories.map((story) => {
                          const active = selectedAiStoryId === story.id &&
                            selectionKind === "aiStory";
                          return (
                            <Pressable
                              key={story.id}
                              style={[
                                styles.modalItem,
                                active && styles.modalItemActive,
                              ]}
                              onPress={() => handleSelectAiStory(story)}
                            >
                              <View style={styles.storyRowHeader}>
                                <Text
                                  style={[
                                    styles.modalItemText,
                                    active && { color: pal.strong },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {story.title}
                                </Text>
                                {aiStoryGeneratingId === story.id ? (
                                  <ActivityIndicator size="small" />
                                ) : null}
                              </View>
                              <Text
                                style={styles.modalItemMeta}
                                numberOfLines={2}
                              >
                                Tap to play this AI-generated story.
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    {/* AI Summary */}
                    <View style={styles.modalSeason}>
                      <Text style={styles.modalSectionTitle}>AI Summary</Text>
                      <Pressable
                        style={styles.modalItem}
                        onPress={() => {
                          setStoryPickerOpen(false);
                          openAiSummaryModal();
                        }}
                      >
                        <Text style={styles.modalItemText}>
                          Write your own text
                        </Text>
                        <Text style={styles.modalItemMeta}>
                          We&apos;ll summarize it and turn it into a single audio
                          story.
                        </Text>
                      </Pressable>
                    </View>

                    {/* No audio */}
                    <View style={styles.modalSeason}>
                      <Text style={styles.modalSectionTitle}>Other</Text>
                      <Pressable
                        style={styles.modalItem}
                        onPress={handleSelectNoAudio}
                      >
                        <Text style={styles.modalItemText}>No audio</Text>
                        <Text style={styles.modalItemMeta}>
                          Start the challenge without any audio story.
                        </Text>
                      </Pressable>
                    </View>

                    {!petStoryOptions.length &&
                    !seasonSections.length &&
                    !aiStories.length ? (
                      <Text style={styles.modalEmpty}>No stories found</Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* AI Summary Modal */}
        <Modal
          visible={aiSummaryModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setAiSummaryModalOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.summaryModalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={80}
          >
            <View style={styles.summarySheet}>
              <Text style={styles.modalTitle}>AI Summary</Text>
              <Text style={styles.summaryHintText}>
                ضع النص الذي تريديه وسوف يتم تلخيصه.
              </Text>
              <TextInput
                style={styles.summaryInput}
                placeholder="اكتب هنا..."
                placeholderTextColor="#9CA3AF"
                multiline
                value={aiSummaryText}
                onChangeText={setAiSummaryText}
              />
              <View style={styles.summaryButtonsRow}>
                <Pressable
                  style={[styles.summaryButton, { backgroundColor: "#E5E7EB" }]}
                  onPress={() => setAiSummaryModalOpen(false)}
                  disabled={aiSummaryGenerating}
                >
                  <Text style={[styles.summaryButtonText, { color: "#111827" }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.summaryButton,
                    { backgroundColor: "#22C55E" },
                    aiSummaryGenerating && { opacity: 0.7 },
                  ]}
                  onPress={handleGenerateAiSummary}
                  disabled={aiSummaryGenerating}
                >
                  {aiSummaryGenerating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text
                      style={[styles.summaryButtonText, { color: "#fff" }]}
                    >
                      Generate audio
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

/* ---------- small helper to render segmented story options ---------- */
function renderStoryOption(
  story: StoryOption,
  onSelect: (s: StoryOption) => void,
  pal: ReturnType<typeof getPalette>,
  selectedKey: string | null,
) {
  const active = selectedKey === story.progressKey;
  const timeValue =
    typeof story.durationMinutes === "number"
      ? story.durationMinutes
      : story.estimatedTimeMin;
  const timeLabel = typeof timeValue === "number" ? `${timeValue} min` : "--";

  return (
    <Pressable
      key={story.progressKey}
      style={[
        styles.modalItem,
        active && styles.modalItemActive,
        story.locked && styles.modalItemLocked,
      ]}
      onPress={() => onSelect(story)}
    >
      <View style={styles.storyRowHeader}>
        <Text
          style={[
            styles.modalItemText,
            active && { color: pal.strong },
            story.locked && styles.modalItemTextLocked,
          ]}
          numberOfLines={1}
        >
          {story.title}
        </Text>
      </View>
      <Text style={styles.modalItemMeta}>
        {timeLabel}
      </Text>
      <View style={styles.modalBadgeRow}>
        {story.completed ? (
          <Text style={styles.completedBadge}>Completed</Text>
        ) : null}
        {story.locked ? <Text style={styles.lockedBadge}>Locked</Text> : null}
      </View>
    </Pressable>
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
    color: "#000000ff",
    flex: 1,
    marginRight: 10,
  },

  statsCard: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    justifyContent: "space-between",
  },
  statItem: { fontSize: 14, color: "#000000ff", flex: 1 },
  statsLeft: { textAlign: "left" },
  statsCenter: { textAlign: "center" },
  statsRight: { textAlign: "right" },
  divider: { height: 1, marginVertical: 12, opacity: 0.6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaCell: { flex: 1 },
  metaLeft: { textAlign: "left" },
  metaCenter: { alignItems: "center", justifyContent: "center" },
  metaRight: { alignItems: "flex-end" },
  ratingInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  smallDim: { fontSize: 12, color: "#252525ff" },
  smallDimOwn: {
    fontSize: 12,
    color: "#252525ff",
    opacity: 0.8,
    fontStyle: "italic",
  },

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
  ctaDisabled: { opacity: 0.6 },

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
  modalItemLocked: { opacity: 0.6 },
  modalItemText: { fontSize: 15, fontWeight: "800", color: "#000000ff" },
  modalItemTextLocked: { color: "#6B7280" },
  modalItemMeta: { fontSize: 12, color: "#4B5563", marginTop: 2 },
  modalBadgeRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  modalSeason: { marginBottom: 20 },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  storyRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  completedBadge: {
    fontSize: 12,
    color: "#065F46",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  lockedBadge: {
    fontSize: 12,
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  storySegmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  storySegmentLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B3D1F",
  },
  storySegmentValue: {
    fontSize: 13,
    color: "#1F2937",
    flex: 1,
    textAlign: "right",
  },

  // AI Summary modal
  summaryModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  summarySheet: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  summaryHintText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 8,
  },
  summaryInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
  },
  summaryButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    justifyContent: "flex-end",
  },
  summaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === "ios" ? 12 : 10,
};
