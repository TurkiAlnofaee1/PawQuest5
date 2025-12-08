import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import RatingModal from "@/components/RatingModal";
import { awardPlayerProgress } from "@/src/lib/playerProgress";
import { getUserChallengeRating, upsertChallengeRating } from "@/src/lib/firestoreChallenges";

type RouteParams = {
  challengeId?: string | string[];
  variant?: string | string[];
  title?: string | string[];
  subtitle?: string | string[];
  rewardPet?: string | string[];
  challengeImageUrl?: string | string[];
  petImageUrl?: string | string[];
  rewardPoints?: string | string[];
  variantXp?: string | string[];
  calories?: string | string[];
  steps?: string | string[];
  actualCalories?: string | string[];
  actualSteps?: string | string[];
  estimatedTimeMin?: string | string[];
  variantDistanceM?: string | string[];
  durationSec?: string | string[];
  distanceM?: string | string[];
};

type ChallengeVariant = {
  xp?: number;
  distanceMeters?: number;
  estimatedTimeMin?: number;
  calories?: number;
  steps?: number;
};

type ChallengeMeta = {
  title: string;
  subtitle?: string;
  rewardPet?: string;
  imageUrl?: string | null;
  rewardPoints?: number;
  variant?: ChallengeVariant;
};

const DEFAULT_BG = require("../../assets/images/ImageBackground.jpg");
const BG_BY_CATEGORY: Record<string, any> = {
  city: require("../../assets/images/CityBg.jpg"),
  mountain: require("../../assets/images/mountainss.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/seaa.jpg"),
};

// Category color palettes for Reward screen
const REWARD_PALETTES = {
  city: {
    mid: "#BFC5CE",
    tabBorder: "#BFC5CE",
    rewardCardBg: "#D2D7DD",
    pointsPillBg: "#959ca7ff",
    statsCardBg: "#BFC5CE",
    ctaBg: "#4B5563",
    ctaText: "#FFFFFF",
  },
  mountain: {
    mid: "#F8B4AB",
    tabBorder: "#F8B4AB",
    rewardCardBg: "#F8B4AB",
    pointsPillBg: "#FFECEB",
    statsCardBg: "#FFECEB",
    ctaBg: "#f86459ff",
    ctaText: "#FFFFFF",
  },
  desert: {
    mid: "#F6C995",
    tabBorder: "#F6C995",
    rewardCardBg: "#F6C995",
    pointsPillBg: "#FFF2E0",
    statsCardBg: "#FFF2E0",
    ctaBg: "#D97706",
    ctaText: "#2C1500",
  },
  sea: {
    mid: "#9EDBFF",
    tabBorder: "#9EDBFF",
    rewardCardBg: "#9EDBFF",
    pointsPillBg: "#E6F6FF",
    statsCardBg: "#E6F6FF",
    ctaBg: "#0284C7",
    ctaText: "#FFFFFF",
  },
} as const;

const getRewardPalette = (cat?: string) =>
  REWARD_PALETTES[(cat || "city").toLowerCase() as keyof typeof REWARD_PALETTES] ?? REWARD_PALETTES.city;

const toSingle = (value?: string | string[] | null): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
};

const toNumber = (value?: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatDistance = (m?: number | null) => {
  if (typeof m !== "number" || !Number.isFinite(m)) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
};

const formatDurationSummary = (s?: number | null) => {
  if (typeof s !== "number" || !Number.isFinite(s) || s < 0) return null;
  if (s < 60) return `${Math.round(s)} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.round((s % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatSteps = (steps?: number) => {
  if (typeof steps !== "number" || !Number.isFinite(steps)) return null;
  return `${Math.round(steps).toLocaleString()} steps`;
};

export default function ChallengeReward() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const insets = useSafeAreaInsets();

  const challengeId = toSingle(params.challengeId);
  const variantParam = toSingle(params.variant);
  const normalizedVariant = variantParam?.toLowerCase() === "hard" ? "hard" : "easy";

  const initialMeta: ChallengeMeta = {
    title: toSingle(params.title) ?? "Challenge Completed",
    subtitle: toSingle(params.subtitle),
    rewardPet: toSingle(params.rewardPet),
    imageUrl: toSingle(params.challengeImageUrl) ?? null,
    rewardPoints: toNumber(toSingle(params.rewardPoints)),
    variant: {
      xp: toNumber(toSingle(params.variantXp)),
      distanceMeters: toNumber(toSingle(params.variantDistanceM)),
      estimatedTimeMin: toNumber(toSingle(params.estimatedTimeMin)),
      calories: toNumber(toSingle(params.calories)),
      steps: toNumber(toSingle(params.steps)),
    },
  };

  const [challengeMeta, setChallengeMeta] = useState<ChallengeMeta>(initialMeta);
  const [petImage, setPetImage] = useState<string | null>(toSingle(params.petImageUrl) ?? null);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [initialRating, setInitialRating] = useState<number | undefined>(undefined);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const pal = getRewardPalette(categoryKey ?? undefined);

  const actualDurationSec = useMemo(() => {
    const parsed = toNumber(toSingle(params.durationSec));
    return typeof parsed === "number" && parsed >= 0 ? parsed : null;
  }, [params.durationSec]);

  const actualDistanceMeters = useMemo(() => {
    const parsed = toNumber(toSingle(params.distanceM));
    return typeof parsed === "number" && parsed >= 0 ? parsed : null;
  }, [params.distanceM]);

  useEffect(() => {
    if (!challengeId) return;
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "challenges", challengeId));
        if (!snap.exists() || !active) return;
        const data = snap.data() as any;
        const variantObj = (data?.variants ?? {})[normalizedVariant] ?? {};
        const vPet = variantObj?.pet ?? {};
        const vRewardPet: string | undefined =
          typeof variantObj?.rewardPet === 'string'
            ? variantObj.rewardPet
            : typeof vPet?.name === 'string'
            ? vPet.name
            : typeof vPet?.id === 'string'
            ? vPet.id
            : undefined;
        setChallengeMeta((prev) => ({
          title: typeof data?.title === "string" ? data.title : prev.title,
          subtitle: typeof data?.subtitle === "string" ? data.subtitle : prev.subtitle,
          rewardPet: vRewardPet ?? (typeof data?.rewardPet === "string" ? data.rewardPet : prev.rewardPet),
          imageUrl:
            typeof data?.imageUrl === "string"
              ? data.imageUrl
              : typeof data?.heroImage === "string"
              ? data.heroImage
              : prev.imageUrl ?? null,
          rewardPoints:
            typeof data?.rewardPoints === "number" && Number.isFinite(data.rewardPoints)
              ? data.rewardPoints
              : prev.rewardPoints,
          variant: (() => {
            const variant = data?.variants?.[normalizedVariant] ?? {};
            const prevVariant = prev.variant ?? {};
            return {
              xp:
                typeof variant?.xp === "number" && Number.isFinite(variant.xp)
                  ? variant.xp
                  : prevVariant.xp,
              distanceMeters:
                typeof variant?.distanceMeters === "number"
                  ? variant.distanceMeters
                  : prevVariant.distanceMeters,
              estimatedTimeMin:
                typeof variant?.estimatedTimeMin === "number"
                  ? variant.estimatedTimeMin
                  : prevVariant.estimatedTimeMin,
              calories:
                typeof variant?.calories === "number"
                  ? variant.calories
                  : prevVariant.calories,
              steps:
                typeof variant?.steps === "number" ? variant.steps : prevVariant.steps,
            };
          })(),
        }));
        if (typeof data?.categoryId === "string") {
          setCategoryKey(String(data.categoryId).toLowerCase());
        }
        if (!petImage) {
          // Prefer variant pet image if present
          const vImages = Array.isArray(variantObj?.petImages)
            ? variantObj.petImages
            : Array.isArray(vPet?.images)
            ? vPet.images
            : null;
          const variantImg =
            (Array.isArray(vImages) && vImages.length > 0 && typeof vImages[0] === 'string')
              ? vImages[0]
              : (typeof variantObj?.petImageUrl === 'string' ? variantObj.petImageUrl : (typeof vPet?.imageUrl === 'string' ? vPet.imageUrl : null));
          const fromDoc =
            variantImg ??
            (typeof data?.petImageUrl === "string"
              ? data.petImageUrl
              : typeof data?.imageUrl === "string"
              ? data.imageUrl
              : null);
          if (fromDoc) setPetImage(fromDoc);
        }

        // Ensure pet is recorded in the user's collection if missing
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;
          const petName =
            (typeof variantObj?.rewardPet === 'string' ? variantObj.rewardPet : undefined) ??
            (typeof vPet?.name === 'string' ? vPet.name : undefined) ??
            (typeof vPet?.id === 'string' ? vPet.id : undefined) ??
            (typeof data?.rewardPet === 'string' ? data.rewardPet : undefined);
          if (!petName) return;
          const images: string[] | null = Array.isArray(vPet?.images)
            ? vPet.images
            : Array.isArray(variantObj?.petImages)
            ? variantObj.petImages
            : null;
          const single: string | null =
            typeof vPet?.imageUrl === 'string'
              ? vPet.imageUrl
              : typeof variantObj?.petImageUrl === 'string'
              ? variantObj.petImageUrl
              : null;
          const petDocId = `challenge-${challengeId}-${normalizedVariant}`;
          const petRef = doc(db, 'Users', uid, 'pets', petDocId);
          const petSnap = await getDoc(petRef);
          if (!petSnap.exists()) {
            await setDoc(
              petRef,
              {
                petId: petName,
                name: petName,
                imageUrl: single ?? (Array.isArray(images) && images.length > 0 ? images[0] : null),
                images: Array.isArray(images) ? images : (single ? [single] : []),
                challengeId,
                variant: normalizedVariant,
                collectedAt: serverTimestamp(),
                xp: 0,
                evoLevel: 0,
              },
              { merge: true },
            );
          }

          // If XP has not been applied yet (pet xp is still 0), apply it now as a fallback
          const petAfter = (await getDoc(petRef)).data() as any | undefined;
          const currentXp = typeof petAfter?.xp === 'number' ? petAfter.xp : 0;
          const xpEarned = typeof (data?.variants?.[normalizedVariant]?.xp) === 'number'
            ? data.variants[normalizedVariant].xp
            : undefined;
          if (currentXp === 0 && typeof xpEarned === 'number' && xpEarned > 0) {
            await awardPlayerProgress({
              uid,
              challengeId: challengeId ?? null,
              xpEarned,
              petId: petName,
              petName,
              petImageUrl: single ?? (Array.isArray(images) && images.length > 0 ? images[0] : null),
              evolutionImages: Array.isArray(images) ? images : null,
              variant: normalizedVariant,
            });
          }
        } catch {
          // best effort; non-blocking
        }
      } catch (error) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[ChallengeReward] failed to load challenge metadata", error);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [challengeId, normalizedVariant, petImage]);

  useEffect(() => {
    if (!challengeId || !auth.currentUser?.uid) {
      setRatingVisible(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const existing = await getUserChallengeRating(challengeId, uid);
        if (!cancelled) {
          setInitialRating(existing ?? undefined);
          setRatingVisible(true);
        }
      } catch (error) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[ChallengeReward] failed to load rating", error);
        }
        if (!cancelled) {
          setInitialRating(undefined);
          setRatingVisible(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  const handleSubmitRating = useCallback(
    async (value: number) => {
      const uid = auth.currentUser?.uid;
      if (!challengeId || !uid) {
        setRatingVisible(false);
        return;
      }
      try {
        await upsertChallengeRating(challengeId, uid, value, { variant: normalizedVariant });
        const runRef = doc(db, "Users", uid, "challengeRuns", challengeId);
        await setDoc(
          runRef,
          {
            rating: value,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setInitialRating(value);
        setRatingVisible(false);
      } catch (error: any) {
        const message =
          typeof error?.message === "string"
            ? error.message
            : "We could not save your rating right now.";
        Alert.alert("Rating failed", message);
        throw error;
      }
    },
    [challengeId, normalizedVariant],
  );

  const handleBackHome = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);

  const handleOpenPetInventory = useCallback(() => {
    router.replace("/(tabs)/petinventory");
  }, [router]);

  const summaryItems = useMemo(() => {
    const variant = challengeMeta.variant ?? {};
    const estimatedDuration =
      typeof variant.estimatedTimeMin === "number" ? variant.estimatedTimeMin * 60 : null;
    const items: { key: string; icon: string; label: string }[] = [];

    const durationLabel = formatDurationSummary(actualDurationSec ?? estimatedDuration);
    if (durationLabel) {
      items.push({
        key: "time",
        icon: "time-outline",
        label: durationLabel,
      });
    }

    const distanceLabel = formatDistance(actualDistanceMeters ?? variant.distanceMeters ?? null);
    if (distanceLabel) {
      items.push({
        key: "distance",
        icon: "walk-outline",
        label: distanceLabel,
      });
    }

    const actualCals = toNumber(toSingle(params.actualCalories));
    if (typeof actualCals === "number" && actualCals >= 0) {
      items.push({ key: "calories", icon: "flame-outline", label: `${Math.round(actualCals)} cal` });
    } else if (typeof variant.calories === "number") {
      items.push({
        key: "calories",
        icon: "flame-outline",
        label: `${variant.calories} cal`,
      });
    }

    const actualSteps = toNumber(toSingle(params.actualSteps));
    const stepsLabel = formatSteps(typeof actualSteps === "number" ? actualSteps : variant.steps);
    if (stepsLabel) {
      items.push({
        key: "steps",
        icon: "footsteps-outline",
        label: stepsLabel,
      });
    }

    return items;
  }, [actualDistanceMeters, actualDurationSec, challengeMeta.variant, params.actualCalories, params.actualSteps]);

  const backgroundSource = (() => {
    const byCat = categoryKey ? BG_BY_CATEGORY[categoryKey] : undefined;
    if (byCat) return byCat;
    if (challengeMeta.imageUrl && typeof challengeMeta.imageUrl === "string")
      return { uri: challengeMeta.imageUrl } as any;
    return DEFAULT_BG;
  })();

  const basePoints =
    typeof challengeMeta.rewardPoints === "number"
      ? challengeMeta.rewardPoints
      : typeof challengeMeta.variant?.xp === "number"
      ? challengeMeta.variant.xp
      : null;
  const pointsText =
    basePoints !== null ? `${Math.round(basePoints).toLocaleString()} points` : "XP earned!";

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <ImageBackground source={backgroundSource} style={styles.rewardBackground} resizeMode="cover">
      <View style={[styles.rewardOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.rewardHeader}>
          <Text style={styles.rewardTitle}>{challengeMeta.title}</Text>
          {challengeMeta.subtitle ? (
            <Text style={styles.rewardSubtitle}>{challengeMeta.subtitle}</Text>
          ) : null}
        </View>

        <View style={styles.contentArea}>
          <View style={[styles.rewardCard, { backgroundColor: pal.rewardCardBg, borderColor: pal.tabBorder }]}>
            <View style={[styles.completedPill, { backgroundColor: pal.pointsPillBg, borderColor: pal.tabBorder, borderWidth: 1 }]}>
              <Text style={styles.completedText}>Challenge Completed!</Text>
            </View>

            {petImage ? (
              <Image source={{ uri: petImage }} style={styles.rewardPet} resizeMode="contain" />
            ) : null}

            <View style={styles.rewardMessage}>
              <Text style={styles.rewardMessageTitle}>You've collected a new pet!</Text>
              <Text style={styles.rewardMessageSubtitle}>
                Welcome your newest companion: {challengeMeta.rewardPet ?? "Mystery Friend"}!
              </Text>
            </View>

            <View style={styles.rewardRow}>
              <View style={[styles.rewardBadge, { backgroundColor: pal.mid }]}>
                <Text style={styles.rewardBadgeText}>{pointsText}</Text>
              </View>
              <View style={[styles.rewardBadge, { backgroundColor: pal.mid }]}>
                <Text style={styles.rewardBadgeText}>Leaderboard Update!</Text>
                <Text style={styles.rewardBadgeSub}>Keep climbing the ranks!</Text>
              </View>
            </View>

            <View style={[styles.summaryBlock, { backgroundColor: pal.statsCardBg }] }>
              <Text style={styles.summaryTitle}>Challenge Summary</Text>
              <View style={styles.summaryRow}>
                {summaryItems.length ? (
                summaryItems.map((item) => (
                  <View key={item.key} style={[styles.summaryItem, { backgroundColor: pal.pointsPillBg }]}>
                    <Ionicons name={item.icon as any} size={16} color="#000000ff" />
                    <Text style={styles.summaryItemText}>{item.label}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.summaryFallback}>Great effort out there!</Text>
              )}
              </View>
            </View>
          </View>

        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
          <TouchableOpacity
            style={[styles.homeButton, { backgroundColor: pal.ctaBg }]}
            onPress={handleOpenPetInventory}
          >
            <Text style={[styles.homeButtonText, { color: pal.ctaText }]}>Pet Inventory</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.homeButton, { backgroundColor: pal.ctaBg }]}
            onPress={handleBackHome}
          >
            <Text style={[styles.homeButtonText, { color: pal.ctaText }]}>Back to Home</Text>
          </TouchableOpacity>
        </View>

        <RatingModal
          visible={ratingVisible}
          onClose={() => setRatingVisible(false)}
          onSubmit={handleSubmitRating}
          initialValue={initialRating}
          allowSkip={false}
        />
      </View>
    </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  rewardBackground: { flex: 1 },
  rewardOverlay: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: "flex-start",
    gap: 12,
  },
  rewardHeader: { alignItems: "center", gap: 6, marginBottom: 8 },
  backButton: {
    position: "absolute",
    left: 0,
    top: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contentArea: { flex: 1 },
  scrollContent: { paddingBottom: 24, gap: 16 },
  footer: { gap: 10, marginTop: 8 },
  rewardTitle: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  rewardSubtitle: {
    color: "rgba(248,250,252,0.9)",
    fontSize: 14,
    textAlign: "center",
  },
  rewardCard: {
    backgroundColor: "rgba(235, 244, 245, 0.95)",
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  completedPill: {
    backgroundColor: "#D0F0D5",
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  completedText: {
    color: "#000000ff",
    fontWeight: "800",
    fontSize: 16,
  },
  rewardPet: { width: 140, height: 140 },
  rewardMessage: { alignItems: "center", paddingHorizontal: 8 },
  rewardMessageTitle: { fontSize: 18, fontWeight: "800", color: "#000000ff" },
  rewardMessageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#000000ff",
    textAlign: "center",
  },
  rewardRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "space-between",
  },
  rewardBadge: {
    flex: 1,
    backgroundColor: "#BEE3BF",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    gap: 4,
  },
  rewardBadgeText: { fontSize: 16, fontWeight: "800", color: "#000000ff" },
  rewardBadgeSub: { fontSize: 12, color: "#000000ff" },
  summaryBlock: {
    width: "100%",
    backgroundColor: "#D2EDE0",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 12,
  },
  summaryTitle: { fontSize: 15, fontWeight: "800", color: "#000000ff" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECF8F1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  summaryItemText: { fontSize: 13, fontWeight: "700", color: "#000000ff" },
  summaryFallback: { fontSize: 13, color: "#000000ff" },
  homeButton: {
    backgroundColor: "#CBE8F5",
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  homeButtonText: { fontSize: 18, fontWeight: "800", color: "#000000ff" },
});
