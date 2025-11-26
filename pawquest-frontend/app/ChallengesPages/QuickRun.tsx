import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";

import MapView, { LatLng, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";

import AudioBar, { AudioBarHandle } from "../../components/AudioBar";
import { db } from "../../src/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

import { auth } from "@/src/lib/firebase";
import { awardPlayerProgress } from "@/src/lib/playerProgress";

// Utility functions
const haversineM = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const fmtKm = (m: number) =>
  m >= 1000 ? (m / 1000).toFixed(2) : (m / 1000).toFixed(2);

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export default function QuickRun() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const initialAudioUri = params.audioUri || "";
  const initialAudioTitle = params.audioTitle || "";

  const [audio, setAudio] = useState(
    initialAudioUri ? { uri: initialAudioUri, title: initialAudioTitle } : null
  );

  const audioRef = useRef<AudioBarHandle>(null);

  // ░░░ RUNNING STATE ░░░
  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(true);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [tick, setTick] = useState(0);

  const elapsedSec = useMemo(
    () => (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0),
    [startedAt, tick]
  );

  const xp = useMemo(() => Math.floor(distanceM), [distanceM]);

  // ░░░ CHANGE AUDIO MODAL ░░░
  const [audioModal, setAudioModal] = useState(false);
  const [storySeriesList, setStorySeriesList] = useState<any[]>([]);
  const [storiesList, setStoriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ░░░ LOAD AUDIO OPTIONS ░░░
  const loadAudioSources = async () => {
    try {
      setLoading(true);

      // Load Story Series audios
      const docRef = doc(db, "Story Series", "The herb of dawn");
      const snap = await getDoc(docRef);

      const seriesAudio: any[] = [];

      if (snap.exists()) {
        const data = snap.data();
        Object.keys(data).forEach((episode) => {
          data[episode].forEach((mp3: string, index: number) => {
            seriesAudio.push({
              id: `${episode}-${index}`,
              title: `${episode} • Part ${index + 1}`,
              uri: mp3,
            });
          });
        });
      }

      setStorySeriesList(seriesAudio);

      // Load "stories" collection
      const storiesSnap = await getDocs(collection(db, "stories"));
      const stories: any[] = [];

      storiesSnap.forEach((doc) => {
        const d = doc.data();
        if (d.audioUrl) {
          stories.push({
            id: doc.id,
            title: d.title || "Story",
            uri: d.audioUrl,
          });
        }
      });

      setStoriesList(stories);
    } catch (err) {
      console.log("Audio load error:", err);
    }

    setLoading(false);
  };

  // ░░░ START LOCATION TRACKING ░░░
  const startTracking = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Enable location to start the run.");
      return;
    }

    const curr = await Location.getCurrentPositionAsync({});
    const initial: LatLng = {
      latitude: curr.coords.latitude,
      longitude: curr.coords.longitude,
    };

    setRegion({
      latitude: initial.latitude,
      longitude: initial.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });

    setPath([initial]);
    setStartedAt(Date.now());
    setRunning(true);

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 3,
      },
      (loc) => {
        const pt = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        setPath((prev) => {
          if (prev.length === 0) return [pt];
          const last = prev[prev.length - 1];
          const d = haversineM(last, pt);
          if (d < 0.5) return prev;
          setDistanceM((m) => m + d);
          return [...prev, pt];
        });

        mapRef.current?.animateCamera({ center: pt, zoom: 16 }, { duration: 600 });
      }
    );
  }, []);

  useEffect(() => {
    startTracking();
    return () => watchRef.current?.remove();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // ░░░ FINISH RUN ░░░
  const finishRun = async () => {
    setRunning(false);
    watchRef.current?.remove();

    const uid = auth.currentUser?.uid;
    if (uid && xp > 0) {
      await awardPlayerProgress({ uid, xpEarned: xp });
    }

    Alert.alert("Great Job!", `You gained ${xp} XP`, [
      { text: "Home", onPress: () => router.replace("/(tabs)") },
    ]);
  };

  // ░░░ CHANGE AUDIO ACTION ░░░
  const applyAudio = (track: any) => {
    setAudio(track);

    // invoke AudioBar
    audioRef.current?.loadNewAudio(track.uri);
  };

  // ░░░ UI START ░░░
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quick Challenge Run</Text>

        <Pressable
          style={styles.changeAudioBtn}
          onPress={() => {
            loadAudioSources();
            setAudioModal(true);
          }}
        >
          <Text style={styles.changeAudioText}>Change Audio 🎵</Text>
        </Pressable>
      </View>

      {/* MAP */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={(ref) => (mapRef.current = ref)}
          style={{ flex: 1 }}
          region={region ?? undefined}
          showsUserLocation={true}
        >
          {path.length > 1 && (
            <Polyline coordinates={path} strokeWidth={5} strokeColor="#34A853" />
          )}
        </MapView>
      </View>

      {/* AUDIO BAR ABOVE STATS */}
      {audio && (
        <View style={{ paddingHorizontal: 12, marginTop: 6 }}>
          <AudioBar
            ref={audioRef}
            title={audio.title}
            source={{ uri: audio.uri }}
            visible={true}
          />
        </View>
      )}

      {/* STATS */}
      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{fmtKm(distanceM)} km</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>{fmtTime(elapsedSec)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>XP</Text>
          <Text style={styles.statValue}>{xp}</Text>
        </View>
      </View>

      {/* FINISH */}
      <Pressable style={styles.finishBtn} onPress={finishRun}>
        <Text style={styles.finishText}>Finish</Text>
      </Pressable>

      {/* AUDIO PICKER MODAL */}
      <Modal visible={audioModal} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Change Audio</Text>

            {loading && <Text>Loading...</Text>}

            {!loading && (
              <>
                {/* STORY SERIES */}
                <Text style={styles.sectionTitle}>Story Series</Text>
                <FlatList
                  data={storySeriesList}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.audioOption}
                      onPress={() => {
                        applyAudio(item);
                        setAudioModal(false);
                      }}
                    >
                      <Text style={styles.audioOptionText}>{item.title}</Text>
                    </TouchableOpacity>
                  )}
                />

                {/* STORIES */}
                <Text style={styles.sectionTitle}>Stories</Text>
                <FlatList
                  data={storiesList}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.audioOption}
                      onPress={() => {
                        applyAudio(item);
                        setAudioModal(false);
                      }}
                    >
                      <Text style={styles.audioOptionText}>{item.title}</Text>
                    </TouchableOpacity>
                  )}
                />

                {/* NO AUDIO */}
                <TouchableOpacity
                  style={[styles.audioOption, { backgroundColor: "#fee" }]}
                  onPress={() => {
                    setAudio(null);
                    audioRef.current?.stopAudio();
                    setAudioModal(false);
                  }}
                >
                  <Text style={[styles.audioOptionText, { color: "red" }]}>
                    No Audio
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Pressable
              onPress={() => setAudioModal(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#000",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },

  changeAudioBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#34A853",
    borderRadius: 10,
  },
  changeAudioText: { color: "#fff", fontWeight: "800" },

  statsCard: {
    flexDirection: "row",
    backgroundColor: "#BEE3BF",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  statBox: { flex: 1, alignItems: "center" },
  statLabel: { fontWeight: "700", color: "#0B3D1F" },
  statValue: { fontWeight: "900", color: "#0B3D1F", fontSize: 18 },

  finishBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 6,
    backgroundColor: "#22C55E",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  finishText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
  },

  modalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: {
    backgroundColor: "white",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
  },
  modalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 10 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },

  audioOption: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  audioOptionText: { fontSize: 15, fontWeight: "700" },

  closeBtn: {
    marginTop: 16,
    backgroundColor: "#ddd",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  closeText: { fontSize: 16, fontWeight: "800" },
});
