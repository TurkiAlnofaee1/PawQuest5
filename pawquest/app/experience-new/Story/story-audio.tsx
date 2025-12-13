import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground } from "react-native";
import { Audio } from "expo-av";
import { useLocalSearchParams } from "expo-router";
import { generateVoiceFromElevenLabs } from "../../../src/lib/services/ttsEleven";

import TopBar from "@/components/TopBar";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function StoryAudioScreen() {
  const { story, title } = useLocalSearchParams();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setIsPlaying(false);

        // Always unload any previous sound before loading a new one
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }

        console.log("🎧 Requesting ElevenLabs TTS...");
        const storyText = Array.isArray(story) ? story[0] : story;
        if (!storyText || typeof storyText !== "string" || storyText.trim().length === 0) {
          setError("No story text available to generate audio.");
          setLoading(false);
          return;
        }
        if (storyText.length > 5000) {
          setError("Story is too long for TTS (max 5000 characters).");
          setLoading(false);
          return;
        }

        const audioUri = await generateVoiceFromElevenLabs(storyText);
        if (!audioUri) {
          setError("Audio unavailable. Check your ElevenLabs key/credits.");
          return;
        }

        const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
        if (isCancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        await sound.playAsync();
        setIsPlaying(true);
      } catch (err: any) {
        const message = err?.message ?? "Unable to play audio.";
        console.warn("Audio Error:", message);
        setError("Audio unavailable. Please try again.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isCancelled = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [story]);

  const togglePlayPause = async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();

    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  };

  return (
    <ImageBackground source={bgImage} style={styles.bg}>
      <View style={styles.container}>
        <TopBar title="Story Audio" backTo="/(tabs)/settings" />

        <Text style={styles.title}>{title || "Generated Story"}</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#111" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
            <Text style={styles.playText}>{isPlaying ? "Pause" : "Play"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "900", marginBottom: 20 },
  playBtn: {
    backgroundColor: "#111",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  playText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  error: {
    color: "#c00",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
