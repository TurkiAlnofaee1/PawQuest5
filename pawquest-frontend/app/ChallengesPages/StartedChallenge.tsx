// app/(tabs)/ChallengesPages/StartedChallenge.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const bgImage = require("../../../assets/images/ImageBackground.jpg"); // adjust if needed

export default function StartedChallenge() {
  const router = useRouter();
  const { id, title, category, difficulty } = useLocalSearchParams<{
    id?: string;
    title?: string;
    category?: string;
    difficulty?: string;
  }>();

  return (
    <ImageBackground source={bgImage} style={{ flex: 1 }} resizeMode="cover">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.90)" }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1} numberOfLines={1}>
              {title ?? "Challenge"}
            </Text>
            <Text style={styles.h2}>
              {String(category ?? "").toUpperCase()} · {String(difficulty ?? "easy").toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.wrap}>
          <View style={styles.statusCard}>
            <MaterialCommunityIcons name="run-fast" size={28} color="#0C2E16" />
            <Text style={styles.statusText}>Challenge is running…</Text>
            <Text style={styles.subText}>ID: {id}</Text>
          </View>

          {/* Simple controls (placeholder) */}
          <View style={styles.controls}>
            <Pressable style={[styles.ctrlBtn, { backgroundColor: "#FCD34D" }]}>
              <Text style={styles.ctrlText}>Pause</Text>
            </Pressable>
            <Pressable
              style={[styles.ctrlBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => router.replace("/(tabs)/challenges")}
            >
              <Text style={styles.ctrlText}>End</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  h1: { fontSize: 22, fontWeight: "800", color: "#0C2E16" },
  h2: { fontSize: 12, color: "#3F3F46", marginTop: 2 },
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statusText: { fontSize: 16, fontWeight: "800", color: "#0C2E16" },
  subText: { fontSize: 12, color: "#6B7280" },
  controls: { flexDirection: "row", gap: 10, justifyContent: "center" },
  ctrlBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctrlText: { color: "#fff", fontWeight: "800" },
});
