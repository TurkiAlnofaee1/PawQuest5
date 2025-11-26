import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground } from "react-native";
import { Audio } from "expo-av";
import { useLocalSearchParams } from "expo-router";
import { generateVoiceFromElevenLabs } from "../../../src/lib/services/ttsEleven";

import TopBar from "@/components/TopBar";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function StoryAudioScreen() {
  const { story, title } = useLocalSearchParams();
  const [sound, setSound] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        console.log("🎧 Requesting StreamElements TTS...");
        const audioUri = await generateVoiceFromElevenLabs(story);
const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
setSound(sound);
await sound.playAsync();

        setIsPlaying(true);

      } catch (err) {
        console.error("Audio Error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (sound) sound.unloadAsync();
    };
  }, []);

  const togglePlayPause = async () => {
    if (!sound) return;
    const status = await sound.getStatusAsync();

    if (status.isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  return (
    <ImageBackground source={bgImage} style={styles.bg}>
      <View style={styles.container}>
        <TopBar title="Story Audio 🎧" backTo="/(tabs)/settings" />

        <Text style={styles.title}>{title || "Generated Story"}</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#111" />
        ) : (
          <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
            <Text style={styles.playText}>{isPlaying ? "⏸ Pause" : "▶️ Play"}</Text>
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
});
