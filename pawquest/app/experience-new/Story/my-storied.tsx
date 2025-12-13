import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ImageBackground, ActivityIndicator } from "react-native";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../src/lib/firebase";
import { useRouter } from "expo-router";

const bgImage = require("../../../assets/images/ImageBackground.jpg");

export default function MyStoriesScreen() {
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "stories"));
        const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setStories(data);
      } catch (err) {
        console.error("Error loading stories:", err);
      }
      setLoading(false);
    })();
  }, []);

  const handleOpenStory = (item: any) => {
    router.push({
      pathname: "/experience-new/Story/story-audio",
      params: { story: item.text, title: item.title },
    });
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <View style={styles.topBar}>
        <Text style={styles.topText}>📖 My Stories</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 50 }} />
      ) : stories.length === 0 ? (
        <Text style={styles.empty}>No stories yet — create one!</Text>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleOpenStory(item)}>
              <Text style={styles.title}>{item.title || "Untitled"}</Text>
              <Text style={styles.preview} numberOfLines={2}>
                {item.text}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
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
  list: { padding: 16 },
  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  title: { fontWeight: "900", fontSize: 16, color: "#111", marginBottom: 4 },
  preview: { color: "#444" },
  empty: { textAlign: "center", color: "#fff", fontSize: 16, marginTop: 50 },
});
