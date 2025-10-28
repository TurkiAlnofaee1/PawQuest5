import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import RatingModal from "../../components/RatingModal";
import {
  getUserChallengeRating,
  upsertChallengeRating,
} from "../../src/lib/firestoreChallenges";

const bgImage = require("../../assets/images/ImageBackground.jpg");

function toSingle(input?: string | string[] | null): string | null {
  if (!input) return null;
  return Array.isArray(input) ? input[0] ?? null : input;
}

export default function StartedChallenge() {
  const router = useRouter();
  const { id, title, category, difficulty } = useLocalSearchParams<{
    id?: string | string[];
    title?: string | string[];
    category?: string | string[];
    difficulty?: string | string[];
  }>();

  const challengeId = useMemo(() => toSingle(id), [id]);
  const challengeTitle = useMemo(() => toSingle(title) ?? "Challenge", [title]);
  const challengeCategory = useMemo(() => toSingle(category) ?? "-", [category]);
  const variant = useMemo<"easy" | "hard">(() => {
    const raw = String(toSingle(difficulty) ?? "easy").toLowerCase();
    return raw === "hard" ? "hard" : "easy";
  }, [difficulty]);

  const [showFinishPanel, setShowFinishPanel] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [rewardCollected, setRewardCollected] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [initialRating, setInitialRating] = useState<number | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEndChallenge = useCallback(() => {
    setShowFinishPanel(true);
  }, []);

  const showToast = useCallback((message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToastMessage(message);
    toastTimer.current = setTimeout(() => {
      setToastMessage(null);
      toastTimer.current = null;
    }, 2200);
  }, []);

  const handleCollectReward = useCallback(async () => {
    if (!challengeId) {
      Alert.alert("Oops", "Missing challenge identifier.");
      return;
    }

    if (collecting) return;
    setCollecting(true);

    try {
      const user = auth.currentUser;
      if (user) {
        const runRef = doc(db, "Users", user.uid, "challengeRuns", challengeId);
        await setDoc(
          runRef,
          {
            completedAt: serverTimestamp(),
            variant,
          },
          { merge: true },
        );
      }

      setRewardCollected(true);

      if (auth.currentUser?.uid) {
        try {
          const existing = await getUserChallengeRating(challengeId, auth.currentUser.uid);
          setInitialRating(existing ?? undefined);
        } catch {
          setInitialRating(undefined);
        }
        setShowRatingModal(true);
      }
    } catch (error: any) {
      const message =
        typeof error?.message === "string"
          ? error.message
          : "We saved your completion, but the reward flow hit a snag.";
      Alert.alert("Unable to record completion", message);
    } finally {
      setCollecting(false);
    }
  }, [challengeId, collecting, variant]);

  const handleSubmitRating = useCallback(
    async (rating: number) => {
      const user = auth.currentUser;
      if (!challengeId || !user?.uid) {
        setShowRatingModal(false);
        return;
      }

      try {
        await upsertChallengeRating(challengeId, user.uid, rating, { variant });
        const runRef = doc(db, "Users", user.uid, "challengeRuns", challengeId);
        await setDoc(
          runRef,
          {
            rating,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setInitialRating(rating);
        setShowRatingModal(false);
        showToast("Thanks for rating! ⭐");
      } catch (error: any) {
        const message =
          typeof error?.message === "string"
            ? error.message
            : "We could not save your rating right now.";
        Alert.alert("Submit rating failed", message);
        throw error;
      }
    },
    [challengeId, showToast, variant],
  );

  const handleCloseModal = useCallback(() => {
    setShowRatingModal(false);
  }, []);

  const handleBackToChallenges = useCallback(() => {
    router.replace("/(tabs)/challenges");
  }, [router]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
    };
  }, []);

  return (
    <ImageBackground source={bgImage} style={{ flex: 1 }} resizeMode="cover">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.92)" }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1} numberOfLines={1}>
              {challengeTitle}
            </Text>
            <Text style={styles.h2}>
              {challengeCategory.toUpperCase()} • {variant.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.wrap}>
          <View style={styles.statusCard}>
            <MaterialCommunityIcons name="run-fast" size={28} color="#0C2E16" />
            <Text style={styles.statusText}>
              {rewardCollected ? "Reward collected!" : "Challenge in progress"}
            </Text>
            <Text style={styles.subText}>ID: {challengeId ?? "—"}</Text>
          </View>

          {showFinishPanel ? (
            <View style={styles.finishCard}>
              <Text style={styles.finishTitle}>
                {rewardCollected ? "Nice! Reward saved." : "Ready to collect your reward?"}
              </Text>
              <Text style={styles.finishCaption}>
                {rewardCollected
                  ? "You can keep exploring or head back to the challenge list."
                  : "Collecting will mark this run as complete and unlock your pet reward."}
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.collectBtn,
                  pressed && !collecting && { transform: [{ scale: 0.98 }] },
                  (collecting || rewardCollected) && styles.collectBtnDisabled,
                ]}
                onPress={handleCollectReward}
                disabled={collecting || rewardCollected}
              >
                <Text style={styles.collectText}>
                  {collecting ? "Collecting..." : rewardCollected ? "Collected" : "Collect reward"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleBackToChallenges}
                style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.exitText}>Back to challenges</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.controls}>
              <Pressable style={[styles.ctrlBtn, { backgroundColor: "#FCD34D" }]}>
                <Text style={styles.ctrlText}>Pause</Text>
              </Pressable>
              <Pressable
                style={[styles.ctrlBtn, { backgroundColor: "#EF4444" }]}
                onPress={handleEndChallenge}
              >
                <Text style={styles.ctrlText}>End</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <RatingModal
        visible={showRatingModal}
        onClose={handleCloseModal}
        onSubmit={handleSubmitRating}
        initialValue={initialRating}
      />

      {toastMessage ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  h1: { fontSize: 22, fontWeight: "800", color: "#0C2E16" },
  h2: { fontSize: 12, color: "#3F3F46", marginTop: 2 },
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statusText: { fontSize: 16, fontWeight: "800", color: "#0C2E16" },
  subText: { fontSize: 12, color: "#6B7280" },
  controls: { flexDirection: "row", gap: 10, justifyContent: "center" },
  ctrlBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctrlText: { color: "#fff", fontWeight: "800" },
  finishCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 20,
    gap: 12,
  },
  finishTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0C2E16",
  },
  finishCaption: {
    fontSize: 13,
    color: "#475569",
  },
  collectBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  collectBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  collectText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  exitBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  exitText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0C2E16",
  },
  toast: {
    position: "absolute",
    bottom: 36,
    left: 20,
    right: 20,
    backgroundColor: "rgba(17,24,39,0.92)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9999,
    alignItems: "center",
  },
  toastText: {
    color: "#F9FAFB",
    fontWeight: "700",
  },
});
