import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { Audio } from "expo-av";
import { awardPlayerProgress } from "@/src/lib/playerProgress";


type RouteParams = {
  challengeId?: string | string[];
  imageUrl?: string;
  audioUrl?: string;
  variant?: string | string[];
  title?: string | string[];
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

const toSingle = (value?: string | string[] | null): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
};

export default function ARPetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const challengeId = toSingle(params.challengeId);
  const variantParam = toSingle(params.variant);
  const titleParam = toSingle(params.title);
  const normalizedVariant = variantParam?.toLowerCase() === "hard" ? "hard" : "easy";
  const fallbackTitle =
    titleParam && titleParam.trim().length > 0 ? titleParam.trim() : "Challenge Completed";

  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(true);

  const [petUrl, setPetUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [variantKey, setVariantKey] = useState<"easy" | "hard">(normalizedVariant);
  const [challengeMeta, setChallengeMeta] = useState<ChallengeMeta>({
    title: fallbackTitle,
  });

  const actualDurationSec = useMemo(() => {
    const raw = toSingle(params.durationSec);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [params.durationSec]);

  const actualDistanceMeters = useMemo(() => {
    const raw = toSingle(params.distanceM);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [params.distanceM]);

  // --- Capture animation (scale+fade out)
  const capScale = useRef(new Animated.Value(1)).current;
  const capOpacity = useRef(new Animated.Value(1)).current;

  // --- Idle animation (pulsing + sway)
  const idleScale = useRef(new Animated.Value(1)).current;
  const idleShift = useRef(new Animated.Value(0)).current;
  const idleFloat = useRef(new Animated.Value(0)).current;
  const idleTilt = useRef(new Animated.Value(0)).current;
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);

  const idleRotation = useMemo(
    () =>
      idleTilt.interpolate({
        inputRange: [-1, 1],
        outputRange: ["-4deg", "4deg"],
      }),
    [idleTilt],
  );

  const canCapture = useMemo(
    () => !loading && !imgLoading && !error && !!petUrl && !submitting,
    [loading, imgLoading, error, petUrl, submitting],
  );

  const loadFromFirestore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!challengeId) {
        setError("Missing challengeId in route params.");
        return;
      }

      const snap = await getDoc(doc(db, "challenges", challengeId));
      if (!snap.exists()) {
        setError(`Challenge not found: ${challengeId}`);
        return;
      }

      const data = snap.data() as any;
      const variants = data?.variants ?? {};
      let resolvedVariantKey: "easy" | "hard" = variantKey;
      let resolvedVariant: ChallengeVariant | undefined = variants?.[resolvedVariantKey];

      if (!resolvedVariant) {
        if (variants?.easy) {
          resolvedVariantKey = "easy";
          resolvedVariant = variants.easy;
        } else if (variants?.hard) {
          resolvedVariantKey = "hard";
          resolvedVariant = variants.hard;
        }
      }

      setVariantKey(resolvedVariantKey);

      setChallengeMeta({
        title: typeof data?.title === "string" ? data.title : challengeMeta.title,
        subtitle: typeof data?.subtitle === "string" ? data.subtitle : undefined,
        rewardPet: typeof data?.rewardPet === "string" ? data.rewardPet : undefined,
        imageUrl:
          typeof data?.imageUrl === "string"
            ? data.imageUrl
            : challengeMeta.imageUrl ?? null,
        rewardPoints:
          typeof data?.rewardPoints === "number" && Number.isFinite(data.rewardPoints)
            ? data.rewardPoints
            : challengeMeta.rewardPoints,
        variant: resolvedVariant
          ? {
              xp:
                typeof resolvedVariant?.xp === "number" && Number.isFinite(resolvedVariant.xp)
                  ? resolvedVariant.xp
                  : undefined,
              distanceMeters:
                typeof resolvedVariant?.distanceMeters === "number"
                  ? resolvedVariant.distanceMeters
                  : undefined,
              estimatedTimeMin:
                typeof resolvedVariant?.estimatedTimeMin === "number"
                  ? resolvedVariant.estimatedTimeMin
                  : undefined,
              calories:
                typeof resolvedVariant?.calories === "number"
                  ? resolvedVariant.calories
                  : undefined,
              steps:
                typeof resolvedVariant?.steps === "number" ? resolvedVariant.steps : undefined,
            }
          : undefined,
      });

      const image = data?.petImageUrl ?? data?.imageUrl ?? data?.dragon ?? null;
      if (!image) {
        setError('Add a string field "petImageUrl" to this challenge.');
        return;
      }
      setPetUrl(image);
      setAudioUrl(data?.petAudioUrl ?? null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [challengeId, challengeMeta.imageUrl, challengeMeta.title, variantKey]);

  // initial load
  useEffect(() => {
    const overrideImage = params.imageUrl;
    const overrideAudio = params.audioUrl;
    if (overrideImage) {
      setPetUrl(overrideImage);
      setAudioUrl(overrideAudio ?? null);
      setLoading(false);
      return;
    }
    void loadFromFirestore();
  }, [params.imageUrl, params.audioUrl, loadFromFirestore]);

  // ask permission proactively
  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission, requestPermission]);

  // start/stop idle loop when ready
  useEffect(() => {
    const shouldIdle =
      !loading && !imgLoading && !error && !!petUrl && showCamera && !submitting;
    if (shouldIdle) {
      idleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.spring(idleScale, {
              toValue: 1.1,
              friction: 4,
              tension: 70,
              useNativeDriver: true,
            }),
            Animated.timing(idleShift, {
              toValue: 8,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(idleFloat, {
              toValue: -6,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(idleTilt, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.spring(idleScale, {
              toValue: 0.92,
              friction: 5,
              tension: 65,
              useNativeDriver: true,
            }),
            Animated.timing(idleShift, {
              toValue: -8,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(idleFloat, {
              toValue: 6,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(idleTilt, {
              toValue: -1,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      idleLoop.current.start();
    }
    return () => {
      idleLoop.current?.stop();
      idleScale.setValue(1);
      idleShift.setValue(0);
      idleFloat.setValue(0);
      idleTilt.setValue(0);
    };
  }, [loading, imgLoading, error, petUrl, showCamera, submitting, idleScale, idleShift, idleFloat, idleTilt]);

  const runCaptureAnimation = useCallback(
    () =>
      new Promise<void>((resolve) => {
        idleLoop.current?.stop();
        Animated.parallel([
          Animated.timing(capScale, {
            toValue: 0.6,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(capOpacity, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      }),
    [capOpacity, capScale],
  );

  useEffect(() => {
    if (!petUrl) return;
    let active = true;
    setImgLoading(true);
    Image.prefetch(petUrl)
      .catch(() => {
        if (active) setError((prev) => prev ?? "Failed to load pet image");
      })
      .finally(() => {
        if (active) setImgLoading(false);
      });
    return () => {
      active = false;
    };
  }, [petUrl]);

  const collectPet = useCallback(async () => {
    if (!canCapture) return;
    setSubmitting(true);
    try {
      if (audioUrl) {
        const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((s: any) => s?.didJustFinish && sound.unloadAsync());
      }

      await runCaptureAnimation();

      const uid = auth.currentUser?.uid;
      if (uid && challengeId) {
        try {
          const runRef = doc(db, "Users", uid, "challengeRuns", challengeId);
          const payload: Record<string, any> = {
            completedAt: serverTimestamp(),
            variant: variantKey,
          };
          if (challengeMeta.variant?.xp) payload.earnedXp = challengeMeta.variant.xp;
          if (challengeMeta.rewardPet) payload.rewardPet = challengeMeta.rewardPet;
          if (actualDistanceMeters !== null) payload.distanceMeters = actualDistanceMeters;
          if (actualDurationSec !== null) payload.durationSec = actualDurationSec;
          await setDoc(runRef, payload, { merge: true });
        } catch (err) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[ARPetScreen] Failed to persist completion", err);
          }
        }
        try {
          await runTransaction(db, async (tx) => {
            const challengeRef = doc(db, "challenges", challengeId);
            const snap = await tx.get(challengeRef);
            if (!snap.exists()) return;
            const stats = snap.data()?.stats ?? {};
            const currentPlays =
              typeof stats?.challengePlays === "number" && Number.isFinite(stats.challengePlays)
                ? stats.challengePlays
                : 0;
            tx.update(challengeRef, { "stats.challengePlays": currentPlays + 1 });
          });
        } catch (err) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[ARPetScreen] Failed to increment challenge plays", err);
          }
        }
      }

      if (uid) {
        try {
          await awardPlayerProgress({
            uid,
            challengeId: challengeId ?? null,
            xpEarned: challengeMeta.variant?.xp ?? 0,
            petId: challengeMeta.rewardPet ?? null,
            petName: challengeMeta.rewardPet ?? null,
            petImageUrl: petUrl ?? null,
            variant: variantKey,
          });
        } catch (err) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn("[ARPetScreen] Failed to award player progress", err);
          }
        }
      }

      setShowCamera(false);
      const rewardParams: Record<string, string> = {
        variant: variantKey,
      };
      if (challengeId) rewardParams.challengeId = challengeId;
      if (challengeMeta.title) rewardParams.title = challengeMeta.title;
      if (challengeMeta.subtitle) rewardParams.subtitle = challengeMeta.subtitle;
      if (challengeMeta.rewardPet) rewardParams.rewardPet = challengeMeta.rewardPet;
      if (challengeMeta.imageUrl) rewardParams.challengeImageUrl = challengeMeta.imageUrl;
      if (typeof challengeMeta.rewardPoints === "number")
        rewardParams.rewardPoints = String(challengeMeta.rewardPoints);
      if (typeof challengeMeta.variant?.xp === "number")
        rewardParams.variantXp = String(challengeMeta.variant.xp);
      if (typeof challengeMeta.variant?.calories === "number")
        rewardParams.calories = String(challengeMeta.variant.calories);
      if (typeof challengeMeta.variant?.steps === "number")
        rewardParams.steps = String(challengeMeta.variant.steps);
      if (typeof challengeMeta.variant?.estimatedTimeMin === "number")
        rewardParams.estimatedTimeMin = String(challengeMeta.variant.estimatedTimeMin);
      if (typeof challengeMeta.variant?.distanceMeters === "number")
        rewardParams.variantDistanceM = String(challengeMeta.variant.distanceMeters);
      if (petUrl) rewardParams.petImageUrl = petUrl;
      if (actualDurationSec !== null) rewardParams.durationSec = String(actualDurationSec);
      if (actualDistanceMeters !== null) rewardParams.distanceM = String(actualDistanceMeters);
      router.replace({ pathname: "/ChallengesPages/ChallengeReward", params: rewardParams });
    } finally {
      setSubmitting(false);
    }
  }, [
    canCapture,
    audioUrl,
    runCaptureAnimation,
    challengeId,
    variantKey,
    challengeMeta.variant,
    challengeMeta.rewardPet,
    challengeMeta.rewardPoints,
    challengeMeta.imageUrl,
    actualDistanceMeters,
    actualDurationSec,
    petUrl,
    router,
  ]);

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>We need your permission to use the camera</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showCamera && (
        <View style={styles.cameraContainer}>
          {/* CameraView does not support children; render overlay as an absolutely positioned sibling */}
          <CameraView style={styles.camera} facing="back" />

          <View style={styles.overlayAbsolute} pointerEvents="box-none">
            {loading ? (
              <ActivityIndicator size="large" />
            ) : error ? (
              <>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={[styles.button, { marginTop: 12 }]}
                  onPress={() => void loadFromFirestore()}
                >
                  <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Animated.View
                  style={{
                    transform: [
                      { translateX: idleShift },
                      { translateY: idleFloat },
                      { rotate: idleRotation },
                      { scale: idleScale },
                      { scale: capScale },
                    ],
                    opacity: capOpacity,
                  }}
                >
                  {petUrl ? (
                    <Image
                      source={{ uri: petUrl }}
                      style={[styles.pet, { alignSelf: "center" }]}
                      resizeMode="contain"
                      onLoad={() => setImgLoading(false)}
                      onLoadEnd={() => setImgLoading(false)}
                      onError={() => setError("Failed to load pet image")}
                    />
                  ) : null}
                </Animated.View>

                {imgLoading && <ActivityIndicator size="small" />}

                <TouchableOpacity
                  style={[styles.captureButton, !canCapture && { opacity: 0.5 }]}
                  onPress={collectPet}
                  disabled={!canCapture}
                  activeOpacity={0.9}
                >
                  <Text style={styles.captureText}>
                    {submitting ? "Capturing..." : "Collect Pet"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraContainer: { flex: 1 },
  overlayAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },
  pet: { width: 220, height: 220, marginBottom: 16 },
  captureButton: {
    backgroundColor: "#ff9800",
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 12,
    marginTop: 12,
  },
  captureText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  permissionText: { color: "#fff", fontSize: 16, textAlign: "center", marginBottom: 12 },
  button: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#ffbdbd", fontSize: 16, textAlign: "center", paddingHorizontal: 16 },
});
