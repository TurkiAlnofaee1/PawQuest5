import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import TopBar from "../../components/TopBar";

const bgImage = require("../../assets/images/ImageBackground.jpg");

export default function ExperienceSelector() {
  const router = useRouter();

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <BlurView intensity={40} tint="light" style={styles.blurOverlay}>
        <SafeAreaView style={styles.safeArea}>
          <TopBar title="Create an Experience" backTo="/(tabs)/settings" />

          <View style={styles.container}>
            <Text style={styles.header}>Choose what to create</Text>

            {/* 🏃 Create Challenge */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: "rgba(203,238,170,0.95)" }]}
              onPress={() => router.push("/experience-new/challenge")}
              activeOpacity={0.8}
            >
              <Text style={styles.cardTitle}>🏃 Create a Challenge</Text>
              <Text style={styles.cardDesc}>
                Design a motivational running challenge with an AI-powered story.
              </Text>
            </TouchableOpacity>

            {/* 📖 Create Story */}
            <TouchableOpacity
              style={[styles.card, { backgroundColor: "rgba(190,227,191,0.9)" }]}
              onPress={() => router.push("/experience-new/Story/StoryFormScreen")}

              activeOpacity={0.8}
            >
              <Text style={styles.cardTitle}>📖 Create a Story</Text>
              <Text style={styles.cardDesc}>
                Write or generate a unique story to enhance your challenge experience.
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </BlurView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  blurOverlay: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
  },
  container: { flex: 1, justifyContent: "center", gap: 20 },
  header: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "900",
    color: "#111",
    marginBottom: 20,
  },
  card: {
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardTitle: { fontSize: 20, fontWeight: "900", color: "#1a1a1a", marginBottom: 8 },
  cardDesc: { fontSize: 14, color: "#333", textAlign: "center", lineHeight: 20 },
});
