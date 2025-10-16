import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { db } from "../../src/lib/firebase";
import {
  collection,
  getDocs,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase/firestore";

const bgImage = require("../../assets/images/ImageBackground.jpg");

type Category = {
  id: string;
  name: string;
  color: string;
  icon?: string;
  totalChallenges: number;
};

const FALLBACK: Category[] = [
  { id: "city", name: "City", color: "#4aa3be", icon: "🏙️", totalChallenges: 0 },
  { id: "mountain", name: "Mountain", color: "#20b07b", icon: "⛰️", totalChallenges: 0 },
  { id: "desert", name: "Desert", color: "#ff8a2a", icon: "🏜️", totalChallenges: 0 },
  { id: "sea", name: "Sea", color: "#2e6ddf", icon: "🌊", totalChallenges: 0 },
];

const converter: FirestoreDataConverter<Category> = {
  toFirestore: (c) => c as any,
  fromFirestore: (snap: QueryDocumentSnapshot) => {
    const d = snap.data() as any;
    return {
      id: snap.id,
      name: String(d?.name ?? ""),
      color: String(d?.color ?? "#4aa3be"),
      icon: typeof d?.icon === "string" ? d.icon : undefined,
      totalChallenges: Number(d?.totalChallenges ?? 0),
    };
  },
};

// fade helper — 60% visible color (slightly faded)
function fadeColor(hex: string, opacity = 0.6) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

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

  const total = items.reduce(
    (a, c) => a + (Number.isFinite(c.totalChallenges) ? c.totalChallenges : 0),
    0
  );

  const renderItem = ({ item }: { item: Category }) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/ChallengesPages/CList",
          params: { category: item.id, name: item.name },
        })
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: fadeColor(item.color, pressed ? 0.55 : 0.6),
          borderColor: fadeColor(item.color, 0.75),
        },
      ]}
    >
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{item.name} Challenges</Text>
        <Text style={styles.cardSub}>
          Challenges Available: {item.totalChallenges ?? 0}
        </Text>
      </View>

      <View style={styles.cardIconWrap}>
        {item.icon ? (
          <Text style={styles.cardEmoji}>{item.icon}</Text>
        ) : (
          <MaterialCommunityIcons name="paw" size={50} color="rgba(0,0,0,0.75)" />
        )}
      </View>
    </Pressable>
  );

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.h1}>Challenges</Text>
          <Text style={styles.h2}>Challenges Available: {total}</Text>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        )}

        {/* Quick Challenge Button */}
        <Pressable
          onPress={() => router.push("/(tabs)/quick")}
          style={({ pressed }) => [
            styles.quickBtn,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.quickText}>Quick Challenge</Text>
          <Ionicons name="play" size={20} color="#0c2e16" />
        </Pressable>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 10 : 6,
  },

  header: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
  h1: { fontSize: 35, fontWeight: "900", color: "#000000ff" },
  h2: {
    marginTop: 2,
    paddingHorizontal: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 0.75)",
  },

  listContent: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 10,
  },

  card: {
    minHeight: 115,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
  },
  cardText: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 20, fontWeight: "900", color: "#0b1d22" },
  cardSub: { fontSize: 15, fontWeight: "600", color: "rgba(0,0,0,0.85)" },

  cardIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 42, lineHeight: 46 },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  quickBtn: {
    marginTop: 10,
    marginBottom: 60,
    marginHorizontal: 20,
    backgroundColor: "#BEE3BF",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  quickText: { fontWeight: "900", fontSize: 17, color: "#0c2e16" },
});
