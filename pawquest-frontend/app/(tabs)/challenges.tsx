import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ImageBackground, ActivityIndicator, SafeAreaView, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { db } from "../../src/lib/firebase";
import { collection, getDocs, FirestoreDataConverter, QueryDocumentSnapshot } from "firebase/firestore";

const bgImage = require("../../assets/images/ImageBackground.jpg");

type Category = { id: string; name: string; color: string; icon?: string; totalChallenges: number; };

const FALLBACK: Category[] = [
  { id: "city", name: "City", color: "#A5E1D2", icon: "🦅", totalChallenges: 0 },
  { id: "mountain", name: "Mountain", color: "#F5A6A0", icon: "🐆", totalChallenges: 0 },
  { id: "desert", name: "Desert", color: "#F6E3A2", icon: "🐉", totalChallenges: 0 },
  { id: "sea", name: "Sea", color: "#8DC2FF", icon: "🐲", totalChallenges: 0 },
];

const converter: FirestoreDataConverter<Category> = {
  toFirestore: (c) => c as any,
  fromFirestore: (snap: QueryDocumentSnapshot) => {
    const d = snap.data() as any;
    return {
      id: snap.id,
      name: String(d?.name ?? ""),
      color: String(d?.color ?? "#EEE"),
      icon: typeof d?.icon === "string" ? d.icon : undefined,
      totalChallenges: Number(d?.totalChallenges ?? 0),
    };
  },
};

export default function Challenges() {
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ref = collection(db, "challengeCategories").withConverter(converter);
        const snap = await getDocs(ref);
        const list = snap.docs.map((d) => d.data());
        setItems(list.length ? list : FALLBACK);
      } catch (e) {
        console.error("Categories load failed:", e);
        setItems(FALLBACK);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = items.reduce((a, c) => a + (Number.isFinite(c.totalChallenges) ? c.totalChallenges : 0), 0);

  const renderItem = ({ item }: { item: Category }) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/ChallengesPages/CList",
          params: { category: item.id, name: item.name },
        })
      }
      style={({ pressed }) => [styles.card, { backgroundColor: item.color, opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.cardTitle}>{item.name} Challenges</Text>
        <Text style={styles.cardSub}>Challenges Available: {item.totalChallenges ?? 0}</Text>
      </View>
      <View style={styles.cardRight}>
        {item.icon ? <Text style={{ fontSize: 36 }}>{item.icon}</Text> : <MaterialCommunityIcons name="paw" size={44} color="rgba(0,0,0,0.65)"/>}
      </View>
    </Pressable>
  );

  return (
    <ImageBackground source={bgImage} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.h1}>Challenges</Text>
          <Text style={styles.h2}>Challenges Available: {total}</Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          />
        )}

        {/* Optional quick CTA; remove if you don’t have this route */}
        <Pressable onPress={() => router.push("/(tabs)/quick")} style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.92 }]}> 
          <Text style={styles.quickText}>Quick Challenge</Text>
          <Ionicons name="play" size={18} />
        </Pressable>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: "100%", height: "100%" },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 8 },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  h1: { fontSize: 28, fontWeight: "800", color: "#0C2E16" },
  h2: { marginTop: 4, fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.75)" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { minHeight: 88, borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.10)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#1A1A1A" },
  cardSub: { fontSize: 13.5, color: "rgba(0,0,0,0.75)", fontWeight: "600" },
  cardRight: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  quickBtn: { marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: "#CBE7B7", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.10)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  quickText: { fontWeight: "800", fontSize: 15, color: "#1B3D1F" },
});
