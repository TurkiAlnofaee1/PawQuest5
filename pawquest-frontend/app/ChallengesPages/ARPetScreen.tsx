import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Audio } from "expo-av";

type RouteParams = {
  challengeId?: string;
  imageUrl?: string;   // optional override for testing
  audioUrl?: string;   // optional override for testing
};

export default function ARPetScreen() {
  const { challengeId, imageUrl: overrideImage, audioUrl: overrideAudio } =
    useLocalSearchParams<RouteParams>();

  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(true);

  const [petUrl, setPetUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // --- Capture animation (scale+fade out)
  const capScale = useRef(new Animated.Value(1)).current;
  const capOpacity = useRef(new Animated.Value(1)).current;

  // --- Idle animation (pulsing + sway)
  const idleScale = useRef(new Animated.Value(1)).current;
  const idleShift = useRef(new Animated.Value(0)).current;
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);

  const canCapture = useMemo(
    () => !loading && !imgLoading && !error && !!petUrl && !submitting,
    [loading, imgLoading, error, petUrl, submitting]
  );

  async function loadFromFirestore() {
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
      const data = snap.data() as {
        petImageUrl?: string;
        imageUrl?: string;
        dragon?: string;
        petAudioUrl?: string;
      };
      const image = data.petImageUrl ?? data.imageUrl ?? data.dragon ?? null;
      if (!image) {
        setError('Add a string field "petImageUrl" to this challenge.');
        return;
      }
      setPetUrl(image);
      setAudioUrl(data.petAudioUrl ?? null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // init
  useEffect(() => {
    if (overrideImage) {
      setPetUrl(overrideImage);
      setAudioUrl(overrideAudio ?? null);
      setLoading(false);
      return;
    }
    loadFromFirestore();
  }, [challengeId, overrideImage, overrideAudio]);

  // ask permission proactively
  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission, requestPermission]);

  // start/stop idle loop when ready
  useEffect(() => {
    const canIdle = !loading && !imgLoading && !error && !!petUrl && showCamera && !submitting;
    if (canIdle) {
      idleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(idleScale, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(idleShift, { toValue: 8, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(idleScale, { toValue: 0.95, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(idleShift, { toValue: -8, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        ])
      );
      idleLoop.current.start();
    }
    return () => {
      idleLoop.current?.stop();
      idleScale.setValue(1);
      idleShift.setValue(0);
    };
  }, [loading, imgLoading, error, petUrl, showCamera, submitting]);

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

  const runCaptureAnimation = () =>
    new Promise<void>((resolve) => {
      // stop idle loop before capture
      idleLoop.current?.stop();
      Animated.parallel([
        Animated.timing(capScale, { toValue: 0.6, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(capOpacity, { toValue: 0, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const collectPet = async () => {
    if (!canCapture) return;
    setSubmitting(true);
    try {
      if (audioUrl) {
        const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((s: any) => s?.didJustFinish && sound.unloadAsync());
      }

      await runCaptureAnimation();

      // optional: persist completion
      try {
        await addDoc(collection(db, "challengeRuns"), {
          userId: "anon", // TODO: replace with your auth uid
          challengeId: challengeId ?? null,
          status: "completed",
          finishedAt: serverTimestamp(),
        });
      } catch {}

      Alert.alert("🎉 Pet Captured!");
      setShowCamera(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {showCamera && (
        <CameraView style={styles.camera} facing="back">
          <View style={styles.overlay}>
            {loading ? (
              <ActivityIndicator size="large" />
            ) : error ? (
              <>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={loadFromFirestore}>
                  <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Animated.View
  style={{
    transform: [
      { translateX: idleShift }, // sway left/right
      { scale: idleScale },      // idle pulse
      { scale: capScale },       // capture shrink-out
    ],
    opacity: capOpacity,
  }}
>
  <Image
    source={{ uri: petUrl! }}
    style={[styles.pet, { alignSelf: "center" }]}
    resizeMode="contain"
    onLoadStart={() => setImgLoading(true)}
    onLoadEnd={() => setImgLoading(false)}
    onError={() => setError("Failed to load petImageUrl")}
  />
</Animated.View>

                {imgLoading && <ActivityIndicator size="small" />}

                <TouchableOpacity
                  style={[styles.captureButton, !canCapture && { opacity: 0.5 }]}
                  onPress={collectPet}
                  disabled={!canCapture}
                  activeOpacity={0.9}
                >
                  <Text style={styles.captureText}>{submitting ? "Capturing..." : "Collect Pet"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 40 },
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
  button: { backgroundColor: "#4CAF50", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#ffbdbd", fontSize: 16, textAlign: "center", paddingHorizontal: 16 },
});
