
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../../src/lib/firebase"; 
import { doc, getDoc } from "firebase/firestore";

const bgImage = require("../../assets/images/ImageBackground.jpg");

type Variant = {
  xp: number;
  distanceMeters: number;
  estimatedTimeMin: number;
  calories: number;
  steps: number;
  hiitType?: string;
  smartwatchRequired?: boolean;
};

type ChallengeDoc = {
  title: string;
  categoryId: string;
  imageUrl?: string;
  rewardPet?: string;
  isLocked?: boolean;
  completedCount?: number;
  variants?: { easy?: Variant; hard?: Variant };
  stats?: { storyPlays?: number; challengePlays?: number; rating?: number };
  info?: { smartwatch?: string; gps?: string; headphones?: string };
};

const mToKm = (m?: number) =>
  typeof m === "number" ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : "—";

export default function ChallengeDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, category, title } =
    useLocalSearchParams<{ id?: string; category?: string; title?: string }>();

  const [data, setData] = useState<ChallengeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"easy" | "hard">("easy");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) return;
        const ref = doc(db, "challenges", String(id));
        const snap = await getDoc(ref);
        if (snap.exists() && active) {
          const d = snap.data() as ChallengeDoc;
          setData(d);
          if (d.variants?.hard && !d.variants?.easy) setTab("hard");
        }
      } catch (e) {
        console.error("Failed to load challenge:", e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const variant: Variant | undefined = useMemo(() => data?.variants?.[tab], [data, tab]);

  const handleStart = () => {
    router.push({
      pathname: "/ChallengesPages/StartedChallenge",
      params: {
        id: String(id),
        title: data?.title || title || "Challenge",
        category: category || data?.categoryId || "",
        difficulty: tab,
      },
    });
  };


  if (loading) {
    return (
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
  <SafeAreaView style={safeAreaStyle}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (!data) {
    return (
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
  <SafeAreaView style={safeAreaStyle}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.center}>
            <Text>Challenge not found.</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
  <SafeAreaView style={safeAreaStyle}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.titleTop}>{data.title || title || "Challenge"}</Text>
              <Text style={styles.subtitle}>
                {category ? String(category).toUpperCase() : ""}
              </Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(["easy", "hard"] as const).map((t) => {
              const enabled = Boolean(data.variants?.[t]);
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  disabled={!enabled}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tabBtn,
                    active && styles.tabActive,
                    !enabled && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Banner */}
          {variant?.smartwatchRequired ? (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Smartwatch required</Text>
              <Text style={styles.bannerSub}>
                This level needs a connected smartwatch to track heart rate or HIIT workout.
              </Text>
            </View>
          ) : (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>BEFORE YOU START</Text>
              <Text style={styles.bannerSub}>
                For best results, connect a smartwatch and headphones.
              </Text>
            </View>
          )}

          {/* Reward */}
          <View style={styles.rewardCard}>
            <Text style={styles.rewardLabel}>Rewards:</Text>
            <View style={styles.rewardPet}>
              <MaterialCommunityIcons name="bird" size={36} color="#111" />
              <Text style={styles.rewardPetName}>{data.rewardPet ?? "—"}</Text>
            </View>
            <View style={styles.pointsPill}>
              <Text style={styles.pointsText}>{variant?.xp ?? 0} points</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <Text style={styles.statsTitle}>The Lost Letter ▾</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Text style={styles.smallDim}>
                  {(data.stats?.storyPlays ?? 0).toLocaleString()} story plays
                </Text>
                <Text style={styles.smallDim}>
                  {(data.stats?.challengePlays ?? 0).toLocaleString()} challenge plays
                </Text>
                <Text style={styles.smallDim}>★ {data.stats?.rating ?? 4.0}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Text style={styles.statItem}>👣 {mToKm(variant?.distanceMeters)}</Text>
              <Text style={styles.statItem}>🔥 {variant?.calories ?? "—"} cal</Text>
              <Text style={styles.statItem}>
                <Ionicons name="time-outline" size={14} /> {variant?.estimatedTimeMin ?? "—"} min
              </Text>
              <Text style={styles.statItem}>HIIT: {variant?.hiitType ?? "—"}</Text>
            </View>
          </View>

          {/* Connectivity */}
          <View style={styles.connectLine}>
            <Text style={styles.connectText}>
              Smartwatch: {data.info?.smartwatch ?? "Not Connected"}
            </Text>
            <Text style={styles.connectText}>GPS: {data.info?.gps ?? "Active"}</Text>
            <Text style={styles.connectText}>
              Headphones: {data.info?.headphones ?? "Connected"}
            </Text>
          </View>

          {/* Start Challenge */}
          <Pressable style={styles.cta} onPress={handleStart}>
            <Text style={styles.ctaText}>Start Challenge</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}


const styles = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  header: {
    paddingTop: 10,
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
  titleTop: { fontSize: 22, fontWeight: "800", color: "#0C2E16" },
  subtitle: { fontSize: 12, fontWeight: "600", color: "#4b5563" },
  tabs: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: "#E5E7EB",
  },
  tabActive: { backgroundColor: "#D1FAE5" },
  tabText: { fontSize: 14, fontWeight: "700", color: "#374151" },
  tabTextActive: { color: "#065F46" },
  banner: {
    margin: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#E5E7EB",
  },
  bannerTitle: { fontSize: 13, fontWeight: "800", color: "#111" },
  bannerSub: { fontSize: 12, color: "#374151", marginTop: 4 },
  rewardCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
  },
  rewardLabel: { fontSize: 12, color: "#374151", marginBottom: 6 },
  rewardPet: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  rewardPetName: { fontSize: 16, fontWeight: "800", color: "#111" },
  pointsPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 9999,
  },
  pointsText: { fontSize: 12, fontWeight: "800", color: "#111" },
  statsCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statsTitle: { fontSize: 14, fontWeight: "700", color: "#0C2E16" },
  smallDim: { fontSize: 12, color: "#4b5563" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  statItem: { fontSize: 12, color: "#111" },
  connectLine: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  connectText: { fontSize: 11, color: "#1f2937", fontWeight: "600" },
  cta: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#BEE3BF",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  ctaText: { fontSize: 16, fontWeight: "900", color: "#0b3d1f" },
});

const safeAreaStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingTop: Platform.OS === 'ios' ? 12 : 8,
};
