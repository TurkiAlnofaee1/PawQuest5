import React, { useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert
} from "react-native";
import TopBar from "@/components/TopBar";
import { formalizeStory } from "../../../src/lib/services/aiFormalize";
import { useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../src/lib/firebase";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function StoryFormScreen() {
  const [storyName, setStoryName] = useState("");
  const [storyIdea, setStoryIdea] = useState("");
  const [storyResult, setStoryResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    if (!storyIdea.trim()) return Alert.alert("Enter an idea first");
    setLoading(true);
    setConfirmed(false);

    try {
      const response = await formalizeStory(storyIdea);
      const bytes = new TextEncoder().encode(response).length;
      if (bytes > 1_000_000) {
        setStoryResult("⚠️ Story too long (over 1MB). Try a shorter idea.");
      } else {
        setStoryResult(response);
      }
    } catch (err) {
      setStoryResult("❌ Error generating story. Try again.");
    }
    setLoading(false);
  };

  const handleAccept = async () => {
  if (!storyResult.trim()) return;
  try {
    const docRef = await addDoc(collection(db, "stories"), {
      title: storyName || "Untitled Story",
      text: storyResult,
      createdAt: serverTimestamp(),
    });
    console.log("✅ Story saved with ID:", docRef.id);

    router.push({
      pathname: "/experience-new/Story/story-audio",
      params: { story: storyResult, title: storyName || "Untitled Story" },
    });
  } catch (err) {
    console.error("❌ Error saving story:", err);
    Alert.alert("Error", "Failed to save story.");
  }
};


  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} />
      <TopBar title="Create a Story +" backTo="/(tabs)/settings" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.formTitle}>AI Story Generator</Text>

        <Text style={styles.label}>Story Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: The Space Cat"
          value={storyName}
          onChangeText={setStoryName}
        />

        <Text style={styles.label}>Story Idea</Text>
        <TextInput
          style={[styles.textArea, styles.elevated]}
          placeholder="Describe your story..."
          value={storyIdea}
          onChangeText={setStoryIdea}
          multiline
        />

        <TouchableOpacity
          style={[styles.submitBtn, styles.elevated]}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Generate</Text>}
        </TouchableOpacity>

        {storyResult ? (
          <View style={[styles.resultBox, styles.elevated]}>
            <Text style={styles.resultLabel}>AI Story Result:</Text>
            <Text style={styles.resultText}>{storyResult}</Text>

            <View style={styles.actionRow}>
              {!confirmed && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#111" }]}
                    onPress={handleAccept}
                  >
                    <Text style={styles.actionText}>Accept ✅</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#4a4a4a" }]}
                    onPress={handleGenerate}
                  >
                    <Text style={styles.actionText}>Regenerate 🔄</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 120, rowGap: 8 },
  formTitle: { fontSize: 22, fontWeight: "900", color: "#1a1a1a", marginBottom: 10 },
  label: { fontSize: 13, fontWeight: "800", marginLeft: 10, color: "#2c3029" },
  input: {
    backgroundColor: "rgba(203,238,170,0.85)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    backgroundColor: "rgba(203,238,170,0.85)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 140,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  submitBtn: {
    marginTop: 14,
    backgroundColor: "#111",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 14,
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  resultBox: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    padding: 14,
    marginTop: 20,
  },
  resultLabel: { fontWeight: "bold", fontSize: 15, marginBottom: 6 },
  resultText: { fontSize: 14, color: "#111" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 10 },
  actionBtn: { flex: 1, borderRadius: 20, alignItems: "center", paddingVertical: 10 },
  actionText: { color: "#fff", fontWeight: "bold" },
  elevated: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 4 },
  }) as object,
});
