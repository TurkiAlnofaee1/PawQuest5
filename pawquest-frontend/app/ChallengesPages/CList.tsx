// app/(tabs)/CList.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 🔥 Firestore: read totalChallenges from challengeCategories/{category}
// Default (fallback) background
const defaultBg = require("../../assets/images/ImageBackground.jpg");

// Per-category backgrounds
const bgByCategory: Record<string, any> = {
  city: require("../../assets/images/CityBg.jpg"),
  mountain: require("../../assets/images/mountainss.jpg"),
  desert: require("../../assets/images/Dune.jpg"),
  sea: require("../../assets/images/seaa.jpg"),
};

export default function CList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { category, name } =
    useLocalSearchParams<{ category?: string; name?: string }>();

  const catKey = String(category ?? "").toLowerCase();
  const headerTitle = name ? `${name} Challenges` : "Challenges";

  const bgSource =
    catKey && bgByCategory[catKey] ? bgByCategory[catKey] : defaultBg;

  const [total, setTotal] = useState(0);

  return (
    <ImageBackground source={bgSource} style={styles.bg} resizeMode="cover">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.overlay /* transparent, no fog */}>
        <SafeAreaView style={[styles.safe, { paddingTop: insets.top + 6 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)/challenges");
              }}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color="#0C2E16" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>{headerTitle}</Text>
              <Text style={styles.h2}>
                Challenges Available: {total}
              </Text>
            </View>
          </View>

          {/* List */}
          {category ? (
            <CListCore
              category={catKey}
              headerTitle={headerTitle}
              onCountChange={setTotal}
              onSelect={(id, title) =>
                router.push({
                  pathname: "/ChallengesPages/ChallengeDetails",
                  params: { id, category: catKey, title },
                })
              }
            />
          ) : (
            <View style={styles.empty}>
              <Text style={{ color: "#fff" }}>No category provided.</Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

// keep your existing import location if you prefer
import CListCore from "./CListCore";

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  safe: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    marginLeft: 17,
  },
  // ⬇️ White header text + light shadow for contrast on photos
  h1: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "900",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  h2: {
    marginHorizontal: 3,
    marginTop: 2,
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
});
