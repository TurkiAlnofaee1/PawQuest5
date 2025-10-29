// app/experience-new/challenge.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import TopBar from "../../components/TopBar";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../src/lib/firebase";
import { BlurView } from "expo-blur";
import { Buffer } from "buffer";

const bgImage = require("../../assets/images/ImageBackground.jpg");

const CATEGORY_COLORS: Record<"City" | "Mountain" | "Desert" | "Sea", string> = {
  City: "#9ed0ff",
  Mountain: "#ffb3b3",
  Desert: "#ffd58a",
  Sea: "#8fd2ff",
};

export default function ChallengeFormScreen() {
  // kept for layout
  const [name, setName] = useState("");
  const [loc1, setLoc1] = useState("");
  const [duration, setDuration] = useState("");
  const [points, setPoints] = useState("");
  const [reward, setReward] = useState("");
  const [category, setCategory] = useState<"City" | "Mountain" | "Desert" | "Sea">("City");

  // story flow
  const [script, setScript] = useState("");        // user input area
  const [accepted, setAccepted] = useState(false); // lock after Accept
  const [loading, setLoading] = useState(false);

  // AI result modal
  const [genTitle, setGenTitle] = useState("");
  const [genStory, setGenStory] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  // Gemini
  const genAI = useMemo(
    () => new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || ""),
    []
  );
  const model = useMemo(
    () => genAI.getGenerativeModel({ model: "models/gemini-flash-latest" }),
    [genAI]
  );

  // -------- AI Generate --------
  const handleGenerate = async () => {
    if (!script.trim()) {
      Alert.alert("Write your idea", "Please type a short idea under Story Script first.");
      return;
    }
    setLoading(true);
    setAccepted(false);

    try {
      const prompt = `
You are writing for a running app. Expand the user's short idea into a full, motivational running story.

Requirements:
- Keep total output well under 1 MB.
- Produce a short engaging TITLE and a STORY.
- Insert energetic, high-motivation lines roughly every 3 minutes (e.g., "Drive your knees—you're flying!").
- Use a firm, energetic “coach” tone for motivation lines.
- English.

User idea:
"${script}"

Return EXACTLY in this format:
Title: <short title>
Story:
<story text here>
      `.trim();

      const res = await model.generateContent([{ text: prompt } as any]);
      const txt = res.response.text().trim();

      const m = txt.match(/Title:\s*(.+)\n+Story:\s*([\s\S]*)/i);
      const title = (m?.[1] || "Untitled Story").trim();
      const body = (m?.[2] || txt).trim();

      setGenTitle(title);
      setGenStory(body);
      setModalVisible(true);
    } catch (e: any) {
      console.error("AI error:", e?.message ?? e);
      Alert.alert("AI Error", "Failed to generate story. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // -------- Accept / Regenerate --------
  const handleAccept = () => {
    setAccepted(true);
    setModalVisible(false);
    setScript("Story accepted ✅"); // lock indicator
  };

  const handleRegenerate = async () => {
    setModalVisible(false);
    await handleGenerate();
  };

  // -------- Submit (save to Firestore) --------
  const handleSubmit = async () => {
    if (!accepted) {
      Alert.alert("Not accepted yet", "Generate a story and press Accept before submitting.");
      return;
    }
    if (!genStory.trim()) {
      Alert.alert("Missing story", "No generated story found.");
      return;
    }

    // lightweight “audio” placeholder (swap with real TTS later)
    const audioBase64 = Buffer.from(genStory, "utf8").toString("base64");

    try {
      await addDoc(collection(db, "ChallengeCreateor"), {
        name: "Challenge & Story",
        category,
        title: genTitle,
        text: genStory,
        audioBase64,
        duration: duration || null,
        points: points || null,
        createdAt: serverTimestamp(),
      });

      Alert.alert("✅ Saved", "Story and audio placeholder saved to Firebase.");

      // optional reset
      setName("");
      setLoc1("");
      setDuration("");
      setPoints("");
      setReward("");
      setScript("");
      setAccepted(false);
      setGenStory("");
      setGenTitle("");
    } catch (e: any) {
      console.error("Save error:", e?.message ?? e);
      Alert.alert("Save error", "Could not save to Firebase. Check config/permissions.");
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <TopBar title="Create a Challenge  +" backTo="/(tabs)/settings" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.formTitle}>Add Challenge</Text>

        {/* Name | Location */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: The ride"
              placeholderTextColor="#6A6A6A"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: Al-Safaa"
              placeholderTextColor="#6A6A6A"
              value={loc1}
              onChangeText={setLoc1}
            />
          </View>
        </View>

        {/* Category chips */}
        <Text style={[styles.label, { marginTop: 6 }]}>Story Category</Text>
        <View style={styles.chipsRow}>
          {(["City", "Mountain", "Desert", "Sea"] as const).map((t) => {
            const selected = category === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setCategory(t)}
                style={[
                  styles.chip,
                  { backgroundColor: CATEGORY_COLORS[t] },
                  selected && styles.chipSelected,
                ]}
                activeOpacity={0.9}
              >
                <Text style={[styles.chipText, selected && { color: "#000" }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Story Script (center) */}
        <Text style={styles.label}>Story Script</Text>
        <TextInput
          style={[styles.textAreaBig, styles.elevated]}
          placeholder="Write your story idea here..."
          placeholderTextColor="#6A6A6A"
          value={script}
          onChangeText={setScript}
          editable={!accepted}
          multiline
        />

        {/* Generate Story (Option B) */}
        <TouchableOpacity
          style={[styles.generateBtn, styles.elevated, accepted && { opacity: 0.5 }]}
          onPress={handleGenerate}
          disabled={loading || accepted}
          activeOpacity={0.9}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateText}>✨ Generate Story</Text>}
        </TouchableOpacity>

        {/* Duration + Points BELOW story */}
        <Text style={[styles.label, { marginTop: 12 }]}>Duration</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: 30 mins"
          placeholderTextColor="#6A6A6A"
          value={duration}
          onChangeText={setDuration}
        />

        <Text style={[styles.label, { marginTop: 8 }]}>Points Reward</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: 1000 pts"
          placeholderTextColor="#6A6A6A"
          value={points}
          onChangeText={setPoints}
          keyboardType="numeric"
        />

        {/* Optional */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Suggested Rewards</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Suggest a pet"
              placeholderTextColor="#6A6A6A"
              value={reward}
              onChangeText={setReward}
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, styles.elevated]}
          activeOpacity={0.9}
          onPress={handleSubmit}
        >
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Blurred modal with story */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <BlurView intensity={30} tint="dark" style={styles.blurFill}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>Here’s the generated story</Text>
            <Text style={styles.modalTitle}>{genTitle}</Text>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalBody}>{genStory}</Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#111" }]} onPress={handleAccept}>
                <Text style={styles.actionText}>Accept ✅</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#4a4a4a" }]} onPress={handleRegenerate}>
                <Text style={styles.actionText}>Regenerate 🔄</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", alignSelf: "stretch", backgroundColor: "#000" },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 96, rowGap: 8 },

  formTitle: { fontSize: 22, fontWeight: "900", color: "#1a1a1a", marginTop: 10, marginBottom: 10 },

  label: { fontSize: 13, fontWeight: "800", marginLeft: 10, marginBottom: 6, color: "#2c3029" },
  input: {
    backgroundColor: "rgba(203,238,170,0.85)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  textAreaBig: {
    backgroundColor: "rgba(203,238,170,0.9)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    height: 220,
    textAlignVertical: "top",
    marginBottom: 10,
  },

  row: { flexDirection: "row", gap: 12, marginTop: 6 },
  col: { flex: 1 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  chip: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  chipSelected: { borderColor: "#000" },
  chipText: { fontWeight: "800", color: "#1f2722" },

  generateBtn: {
    marginTop: 8,
    backgroundColor: "#0E1E0F",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 12,
  },
  generateText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  submitBtn: {
    marginTop: 14,
    backgroundColor: "#111",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 14,
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  elevated: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,

  // blur modal
  blurFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalCard: {
    width: "92%",
    maxHeight: "85%",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 18,
    padding: 16,
  },
  modalHeader: { fontSize: 14, fontWeight: "800", color: "#2c3029", marginBottom: 6, textAlign: "center" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111", marginBottom: 8, textAlign: "center" },
  modalScroll: { maxHeight: 320, marginBottom: 12 },
  modalBody: { fontSize: 14, color: "#111" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 16, alignItems: "center", paddingVertical: 10 },
  actionText: { color: "#fff", fontWeight: "bold" },
});
