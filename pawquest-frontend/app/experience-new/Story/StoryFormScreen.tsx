// app/experience-new/Story/StoryFormScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import TopBar from "@/components/TopBar";
import { generateStoryFromOptions } from "./../../../src/lib/services/storyGenerator";
import { db } from "../../../src/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import GreenHeader from "@/components/GreenHeader";
const bgImage = require("../../../assets/images/ImageBackground.jpg");

/* ---- Dropdown options ---- */

const ROLE_OPTIONS = [
  "Curious explorer",
  "Lost traveler",
  "Guardian of the trail",
  "Messenger on a mission",
  "Treasure seeker",
  "Time-traveling runner",
];

const THEME_OPTIONS = [
  "Mystery",
  "Horror (light / safe)",
  "Exploration & discovery",
  "Comedy / light-hearted",
  "Epic adventure",
  "Inspirational comeback",
];

const GOAL_OPTIONS = [
  "Rescue mission",
  "Treasure hunt",
  "Chasing something",
  "Escaping danger",
  "Finding a cure",
  "Protecting a baby pet",
  "Tracking a hidden creature",
];

const CATEGORY_OPTIONS = ["City", "Mountain", "Desert", "Sea"];

const LOCATION_OPTIONS = [
  "Old town streets",
  "Quiet neighborhood",
  "Forest path",
  "Beach boardwalk",
  "Mountain trail",
  "Desert dunes",
  "Park with a lake",
];

const SURPRISE_OPTIONS = [
  "Mysterious stranger appears",
  "Hidden portal opens",
  "Unexpected storm",
  "Your pet reveals a secret power",
  "Time freezes for a moment",
  "You receive a strange message",
];

const PACE_OPTIONS = [
  "Relaxed walk",
  "Steady brisk walk",
  "Run-walk intervals",
  "Focused jogging",
  "Intense tempo run",
];

const TECH_OPTIONS = [
  "Modern city",
  "Fantasy village",
  "Sci-fi future",
  "Post-apocalyptic",
  "Cyber-forest",
  "Steampunk harbor",
];

type PickerKey =
  | "role"
  | "theme"
  | "goal"
  | "category"
  | "location"
  | "surprise"
  | "pace"
  | "technology";

  
export default function StoryFormScreen() {
  const router = useRouter();

  const [storyName, setStoryName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("City");
  const [location, setLocation] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<string | null>(null);
  const [pace, setPace] = useState<string | null>(null);
  const [technology, setTechnology] = useState<string | null>(null);

  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storyText, setStoryText] = useState("");

  /* ---- Picker helpers ---- */

  const getOptionsForPicker = (key: PickerKey): string[] => {
    switch (key) {
      case "role":
        return ROLE_OPTIONS;
      case "theme":
        return THEME_OPTIONS;
      case "goal":
        return GOAL_OPTIONS;
      case "category":
        return CATEGORY_OPTIONS;
      case "location":
        return LOCATION_OPTIONS;
      case "surprise":
        return SURPRISE_OPTIONS;
      case "pace":
        return PACE_OPTIONS;
      case "technology":
        return TECH_OPTIONS;
      default:
        return [];
    }
  };

  const getValueForPicker = (key: PickerKey): string | null => {
    switch (key) {
      case "role":
        return role;
      case "theme":
        return theme;
      case "goal":
        return goal;
      case "category":
        return category;
      case "location":
        return location;
      case "surprise":
        return surprise;
      case "pace":
        return pace;
      case "technology":
        return technology;
      default:
        return null;
    }
  };

  const setValueForPicker = (key: PickerKey, value: string) => {
    switch (key) {
      case "role":
        setRole(value);
        break;
      case "theme":
        setTheme(value);
        break;
      case "goal":
        setGoal(value);
        break;
      case "category":
        setCategory(value);
        break;
      case "location":
        setLocation(value);
        break;
      case "surprise":
        setSurprise(value);
        break;
      case "pace":
        setPace(value);
        break;
      case "technology":
        setTechnology(value);
        break;
    }
  };

  const renderPickerField = (
    label: string,
    key: PickerKey,
    pillColor?: string
  ) => {
    const current = getValueForPicker(key);
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={[
            styles.dropdownField,
            pillColor ? { backgroundColor: pillColor } : null,
          ]}
          activeOpacity={0.8}
          onPress={() => setOpenPicker(key)}
        >
          <Text
            style={[
              styles.dropdownText,
              !current && { opacity: 0.6, fontStyle: "italic" },
            ]}
            numberOfLines={1}
          >
            {current || "Tap to choose"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
        </TouchableOpacity>
      </View>
    );
  };

  /* ---- Actions ---- */

  const handleGenerate = async () => {
    if (!role || !theme || !goal || !location || !surprise || !pace || !technology) {
      Alert.alert("Missing choices", "Please fill all dropdowns first.");
      return;
    }

    setLoading(true);
    try {
      const story = await generateStoryFromOptions({
        storyName: storyName || undefined,
        role,
        theme,
        goal,
        category,
        location,
        surprise,
        pace,
        technology,
      });

      const bytes = new TextEncoder().encode(story).length;
      if (bytes > 1_000_000) {
        setStoryText(
          "⚠️ Generated story is too long (over 1MB). Try a simpler combination."
        );
      } else {
        setStoryText(story);
      }
    } catch (err: any) {
      console.error("❌ Story generation error:", err);
      Alert.alert(
        "AI Error",
        typeof err?.message === "string" ? err.message : "Failed to generate story."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!storyText.trim()) {
      Alert.alert("No story yet", "Generate a story before saving.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "stories"), {
        title: storyName || "Untitled Story",
        text: storyText,
        meta: {
          role,
          theme,
          goal,
          category,
          location,
          surprise,
          pace,
          technology,
        },
        createdAt: serverTimestamp(),
      });
      Alert.alert("Saved", "Story saved to My Stories.");
      // optional: go to My Stories
      router.push("/experience-new/Story/my-storied");
    } catch (err) {
      console.error("❌ Firestore save error:", err);
      Alert.alert("Save error", "Could not save story. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  /* ---- UI ---- */

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <GreenHeader title="Create a Story +" backTo="/(tabs)/settings" />


      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>AI Story Generator</Text>

        {/* Story name */}
        <Text style={styles.label}>Story Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          //placeholder="Example: The Space Cat"
          placeholderTextColor="#5f6d55"
          value={storyName}
          onChangeText={setStoryName}
        />

        {/* Dropdowns */}
        {renderPickerField("Role", "role")}
        {renderPickerField("Story Theme", "theme")}
        {renderPickerField("Goal", "goal")}
        {renderPickerField("Story Category", "category")}
        {renderPickerField("Location", "location")}
        {renderPickerField("Surprise Element", "surprise")}
        {renderPickerField("Walking Pace", "pace")}
        {renderPickerField("Story Technology", "technology")}

        {/* Generated story box */}
        <Text style={styles.label}>Generated Story</Text>
        <View style={[styles.storyBox, styles.elevated]}>
          {storyText ? (
            <ScrollView style={{ maxHeight: 260 }}>
              <Text style={styles.storyText}>{storyText}</Text>
            </ScrollView>
          ) : (
            <Text style={[styles.storyText, { opacity: 0.6 }]}>
              Your AI story will appear here after you press Generate.
            </Text>
          )}
        </View>

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateBtn, styles.elevated]}
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateText}> Generate Story</Text>
          )}
        </TouchableOpacity>

        {/* Save button */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            styles.elevated,
            !storyText && { opacity: 0.5 },
          ]}
          onPress={handleSave}
          disabled={saving || !storyText}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#0b3d1f" />
          ) : (
            <Text style={styles.saveText}> Save to My Stories</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Dropdown modal */}
      <Modal
        visible={openPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenPicker(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpenPicker(null)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose an option</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {openPicker &&
                getOptionsForPicker(openPicker).map((opt) => {
                  const selected = getValueForPicker(openPicker) === opt;
                  return (
                    <Pressable
                      key={opt}
                      style={[
                        styles.modalItem,
                        selected && styles.modalItemActive,
                      ]}
                      onPress={() => {
                        if (openPicker) {
                          setValueForPicker(openPicker, opt);
                        }
                        setOpenPicker(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.modalItemText,
                          selected && { color: "#14532d" },
                        ]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
 
/* ---- styles ---- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 120,
    rowGap: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1a1a1a",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 10,
    color: "#2c3029",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "rgba(203,238,170,0.9)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  dropdownField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(203,238,170,0.9)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: { color: "#111827", fontSize: 14, fontWeight: "700", flex: 1 },
  storyBox: {
    backgroundColor: "rgba(203,238,170,0.9)",
    borderRadius: 18,
    padding: 14,
    minHeight: 140,
    marginBottom: 12,
  },
  storyText: { fontSize: 14, color: "#111827" },
  generateBtn: {
    marginTop: 4,
    backgroundColor: "#111",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 14,
  },
  generateText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  saveBtn: {
    marginTop: 10,
    backgroundColor: "#c4f4c5",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 12,
  },
  saveText: { color: "#0b3d1f", fontWeight: "900", fontSize: 14 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B3D1F",
    marginBottom: 10,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  modalItemActive: {
    backgroundColor: "#DCFCE7",
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  elevated: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 4 },
  }) as object,
});

