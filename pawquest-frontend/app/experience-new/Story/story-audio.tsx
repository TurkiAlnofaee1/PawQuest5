import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, ActivityIndicator } from "react-native";
import * as Speech from "expo-speech";
import { useLocalSearchParams } from "expo-router";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function StoryAudioScreen() {
  const { story, title } = useLocalSearchParams<{ story?: string; title?: string }>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  async function playStory() {
    if (!story) return;
    try {
      setLoading(true);
      Speech.speak(story, {
        language: "en-US",
        rate: 1.0,
        pitch: 1.0,
        onDone: () => setIsPlaying(false),
      });
      setIsPlaying(true);
    } catch (err) {
      console.error("Speech error:", err);
    } finally {
      setLoading(false);
    }
  }

  function stopStory() {
    Speech.stop();
    setIsPlaying(false);
  }

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <View style={styles.topBar}>
        <Text style={styles.topText}>{title || "Story Audio"}</Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.header}>{title || "Your Story"}</Text>
        <Text style={styles.subtext}>
          {isPlaying ? "🎧 Playing your story..." : "Tap Play to begin!"}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <TouchableOpacity
            style={[styles.playBtn, isPlaying && { backgroundColor: "#c62828" }]}
            onPress={isPlaying ? stopStory : playStory}
          >
            <Text style={styles.playText}>{isPlaying ? "⏹ Stop" : "▶️ Play Story"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bg: { ...StyleSheet.absoluteFillObject },
  topBar: {
    backgroundColor: "#a3e635",
    paddingVertical: 14,
    alignItems: "center",
  },
  topText: { color: "#000", fontSize: 18, fontWeight: "900" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { fontSize: 22, fontWeight: "900", color: "#fff", marginBottom: 12 },
  subtext: { fontSize: 16, color: "#eee", marginBottom: 20 },
  playBtn: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 999,
    elevation: 4,
  },
  playText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
