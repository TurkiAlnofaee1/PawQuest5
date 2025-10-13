// app/CList.tsx
import React from "react";
import { View, Text, StyleSheet, ImageBackground, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import CListCore from "./CListCore";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function CList() {
  const router = useRouter();
  const { category, name } = useLocalSearchParams<{ category?: string; name?: string }>();
  const headerTitle = name ? `${name} Challenges` : "Challenges";

  return (
    <ImageBackground source={bgImage} style={{ flex: 1 }} resizeMode="cover">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.88)" }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/(tabs)/challenges")} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} />
          </Pressable>
          <Text style={styles.h1}>{headerTitle}</Text>
        </View>

        {category ? (
          <CListCore
            category={String(category)}
            headerTitle={headerTitle}
            onSelect={(id, title) =>
              router.push({
                pathname: "/ChallengesPages/ChallengeDetails",
                params: { id, category: String(category), title },
              })
            }
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text>No category provided.</Text>
          </View>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 14,
    paddingBottom: 10,
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
});
