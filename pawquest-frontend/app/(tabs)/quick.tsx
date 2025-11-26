import React, { useState, useEffect } from "react";
import {
  ImageBackground,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { db } from "../../src/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

const bgImage = require("../../assets/images/ImageBackground.jpg");

type QuickAudio = {
  id: string;
  title: string;
  uri: string;
};

type PickerStep = "root" | "series" | "stories";

export default function QuickChallengeDetails() {
  const router = useRouter();

  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<PickerStep>("root");

  const [selectedAudio, setSelectedAudio] = useState<QuickAudio | null>(null);

  const [seriesOptions, setSeriesOptions] = useState<QuickAudio[]>([]);
  const [storiesOptions, setStoriesOptions] = useState<QuickAudio[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Load Story Series (one document) ---
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

  // --- Load Stories (collection) ---
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
      <TouchableOpacity
        style={styles.modeBtn}
        onPress={loadSeries}
        activeOpacity={0.9}
      >
        <Text style={styles.modeTitle}>📚 Story Series</Text>
        <Text style={styles.modeSubtitle}>Listen in episodes from a series.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.modeBtn}
        onPress={loadStories}
        activeOpacity={0.9}
      >
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
      <TouchableOpacity
        onPress={() => setPickerStep("root")}
        style={{ marginBottom: 8 }}
      >
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

        {/* How it works */}
        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>- Your position and distance are recorded.</Text>
          <Text style={styles.item}>- Tap Finish whenever you're done.</Text>
        </View>

        {/* XP Rules */}
        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- Every 1 km = 1000 XP.</Text>
          <Text style={styles.item}>- Only your equipped pet evolves.</Text>
        </View>

        {/* Audio summary + button */}
        <Pressable
          onPress={openAudioPicker}
          style={styles.audioBtn}
        >
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

        {/* Audio Picker Modal */}
        <Modal visible={audioPickerOpen} transparent animationType="fade">
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeAudioPicker}
          >
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choose Audio</Text>

              {pickerStep === "root" && renderRootStep()}

              {pickerStep === "series" &&
                renderListStep(
                  seriesOptions,
                  "No episodes found in Story Series."
                )}

              {pickerStep === "stories" &&
                renderListStep(
                  storiesOptions,
                  "No stories with audio found."
                )}
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
  audioBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B3D1F",
  },

  startBtn: {
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: "#22C55E",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "60%",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },

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
