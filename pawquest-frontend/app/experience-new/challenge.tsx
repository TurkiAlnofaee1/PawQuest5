// app/experience-new/challenge.tsx

// ---- Cloudinary env (Unsigned upload) ----
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UNSIGNED_PRESET!;

// ---- OpenRouteService env (walking directions) ----
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY!;

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Alert,
} from "react-native";

import TopBar from "@/components/TopBar";
import MapView, {
  Marker,
  Polyline,
  Region,
  LatLng,
  LongPressEvent,
} from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

// Firestore helper
import { createChallenge, type Category } from "../../src/lib/experience";
import { fetchWalkingRoute } from "@/src/lib/ors";

const bgImage = require("../../assets/images/ImageBackground.jpg");

const CATEGORY_COLORS: Record<Category, string> = {
  City: "#9ed0ff",
  Mountain: "#ffb3b3",
  Desert: "#ffd58a",
  Sea: "#8fd2ff",
};

const INITIAL_REGION: Region = {
  latitude: 21.543333,
  longitude: 39.172779,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// ---- upload a file URI to Cloudinary (unsigned)
async function uploadToCloudinary(uri: string): Promise<string> {
  const form = new FormData();
  form.append("file", { uri, type: "image/*", name: "pet.jpg" } as any);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "pawquest/pets");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: form,
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Cloudinary upload failed");
  return json.secure_url as string;
}

type Difficulty = "easy" | "hard";

export default function ChallengeFormScreen() {
  // form state
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [rewardName, setRewardName] = useState("");
  const [category, setCategory] = useState<Category>("City");
  const [saving, setSaving] = useState(false);

  // map picking
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);

  // walking route
  const [routeCoords, setRouteCoords] = useState<LatLng[] | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | undefined>();
  const [estimatedTimeMin, setEstimatedTimeMin] = useState<number | undefined>();

  // “YOU” marker
  const [you, setYou] = useState<LatLng | null>(null);

  // pet image
  const [petImageUri, setPetImageUri] = useState<string | null>(null);

  // difficulty
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  // ───────────────── helpers ─────────────────
  const onMapLongPress = async (e: LongPressEvent) => {
    const coord = e.nativeEvent.coordinate;

    if (!start) {
      setStart(coord);
      setEnd(null);
      setRouteCoords(null);
      setDistanceMeters(undefined);
      setEstimatedTimeMin(undefined);
      setDifficulty(null);
    } else if (!end) {
      setEnd(coord);
      try {
        await getSnappedRoute(start, coord);
      } catch {
        Alert.alert("Route error", "Could not fetch walking route.");
        setRouteCoords(null);
      }
    } else {
      setStart(coord);
      setEnd(null);
      setRouteCoords(null);
      setDistanceMeters(undefined);
      setEstimatedTimeMin(undefined);
      setDifficulty(null);
    }
  };

  async function getSnappedRoute(start: LatLng, end: LatLng) {
    try {
      const { feature, distanceMeters, durationSec } = await fetchWalkingRoute(start, end);
      const coords = feature.geometry.coordinates.map(([lon, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lon,
      }));
      setRouteCoords(coords);

      if (distanceMeters != null) setDistanceMeters(Math.round(distanceMeters));
      if (durationSec != null) setEstimatedTimeMin(Math.max(1, Math.round(durationSec / 60)));
    } catch {
      Alert.alert("Route error", "Failed to fetch walking route.");
      setRouteCoords(null);
    }
  }

  const clearPoints = () => {
    setStart(null);
    setEnd(null);
    setRouteCoords(null);
    setDistanceMeters(undefined);
    setEstimatedTimeMin(undefined);
    setDifficulty(null);
  };

  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location", "Permission is required to center the map.");
      return;
    }

    const pos = await Location.getCurrentPositionAsync({});
    const me = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
    setYou(me);
    setRegion({
      latitude: me.latitude,
      longitude: me.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const pickPetPhoto = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          alert("Permission to access photos is required!");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled) setPetImageUri(result.assets[0].uri);
    } catch {
      alert("Could not open image picker.");
    }
  };

  // durations
  const baseMin = useMemo(() => Math.max(1, Math.round(estimatedTimeMin ?? 10)), [estimatedTimeMin]);
  const easyMin = useMemo(() => baseMin + 2, [baseMin]);
  const hardMin = useMemo(() => Math.max(1, Math.ceil(baseMin / 2)), [baseMin]);
  const adjustedMin = difficulty === "easy" ? easyMin : difficulty === "hard" ? hardMin : null;

  // submit
  const onSubmit = async () => {
    if (saving) return;

    if (!name.trim() || !start || !end) {
      Alert.alert("Missing info", "Please enter a name and pick Start & End.");
      return;
    }
    if (!difficulty) {
      Alert.alert("Pick difficulty", "Please choose Easy or Hard.");
      return;
    }
    if (adjustedMin == null) {
      Alert.alert("Route missing", "Generate a route first.");
      return;
    }

    try {
      setSaving(true);

      let rewardImageUrl: string | undefined;
      if (petImageUri) {
        try {
          rewardImageUrl = await uploadToCloudinary(petImageUri);
        } catch (err: any) {
          Alert.alert("Upload failed", err?.message ?? "Could not upload image");
        }
      }

      await createChallenge({
        name: name.trim(),
        category,
        pointsReward: Number(points) || 0,
        durationMinutes: baseMin,
        suggestedReward: rewardName.trim(),
        createdBy: "demo",
        start,
        end,
        distanceMeters,
        estimatedTimeMin: baseMin,
        difficulty,
        adjustedDurationMin: adjustedMin,
        rewardImageUrl,
      });

      Alert.alert("Success", "Challenge saved!");
      setName("");
      setPoints("");
      setRewardName("");
      setCategory("City");
      clearPoints();
      setPetImageUri(null);
      setDifficulty(null);
    } catch (e: any) {
      Alert.alert("Failed to save", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  // UI
  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <TopBar title="Create a Challenge +" backTo="/(tabs)/settings" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.formTitle}>Add Challenge</Text>

        {/* Name */}
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: The Ride"
          placeholderTextColor="#6A6A6A"
          value={name}
          onChangeText={setName}
        />

        {/* Location */}
        <Text style={styles.label}>Location</Text>
        <Text style={styles.helperText}>
          Long-press once for <Text style={{ fontWeight: "800" }}>Start</Text>,  
          again for <Text style={{ fontWeight: "800" }}>End</Text>.
        </Text>

        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={region}
            region={region}
            onRegionChangeComplete={setRegion}
            onLongPress={onMapLongPress}
          >
            {you && (
              <Marker coordinate={you} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.youWrap}>
                  <View style={styles.youPulse} />
                  <View style={styles.youBadge}>
                    <Text style={styles.youText}>YOU</Text>
                  </View>
                </View>
              </Marker>
            )}

            {start && <Marker coordinate={start} title="Start" pinColor="#1fbf6b" />}
            {end && <Marker coordinate={end} title="End" pinColor="#ff5a5f" />}
            {routeCoords && routeCoords.length > 1 && (
              <Polyline coordinates={routeCoords} strokeWidth={6} />
            )}
          </MapView>

          <View style={styles.mapActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={locateMe}>
              <Text style={styles.actionBtnText}>Locate me</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnDark} onPress={clearPoints}>
              <Text style={styles.actionBtnTextLight}>Clear</Text>
            </TouchableOpacity>
          </View>

          {(distanceMeters || estimatedTimeMin) && (
            <Text style={styles.metricsText}>
              {distanceMeters ? `${(distanceMeters / 1000).toFixed(2)} km` : ""}{" "}
              {estimatedTimeMin ? `• ~${estimatedTimeMin} min` : ""}
            </Text>
          )}
        </View>

        {/* Category */}
        <Text style={[styles.label, { marginTop: 8 }]}>Challenge Category</Text>
        <View style={styles.chipsRow}>
          {(["City", "Mountain", "Desert", "Sea"] as const).map((t) => {
            const selected = category === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setCategory(t)}
                style={[
                  styles.chip,
                  { backgroundColor: CATEGORY_COLORS[t] },
                  selected && styles.chipSelected,
                ]}
              >
                <Text style={[styles.chipText, selected && { color: "#000" }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Difficulty */}
        <Text style={[styles.label, { marginTop: 10 }]}>Difficulty</Text>
        <View style={styles.diffRow}>
          <TouchableOpacity
            style={[styles.diffBox, difficulty === "easy" && styles.diffBoxActive]}
            onPress={() => setDifficulty("easy")}
          >
            <Text style={styles.diffTitle}>Easy</Text>
            {difficulty === "easy" && adjustedMin != null && (
              <Text style={styles.diffTime}>{adjustedMin} min</Text>
            )}
            <Text style={styles.diffHint}>Base + 2 minutes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.diffBox, difficulty === "hard" && styles.diffBoxActive]}
            onPress={() => setDifficulty("hard")}
          >
            <Text style={styles.diffTitle}>Hard</Text>
            {difficulty === "hard" && adjustedMin != null && (
              <Text style={styles.diffTime}>{adjustedMin} min</Text>
            )}
            <Text style={styles.diffHint}>~Half the base time</Text>
          </TouchableOpacity>
        </View>

        {/* Points + Reward */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Points Reward</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="1000"
              placeholderTextColor="#6A6A6A"
              keyboardType="numeric"
              value={points}
              onChangeText={setPoints}
            />
          </View>

          <View style={styles.col}>
            <Text style={styles.label}>Suggested Reward (pet)</Text>
            <View style={styles.petRow}>
              <TextInput
                style={[styles.input, styles.elevated, { flex: 1 }]}
                placeholder="e.g., Golden Dragon"
                placeholderTextColor="#6A6A6A"
                value={rewardName}
                onChangeText={setRewardName}
              />

              <TouchableOpacity style={styles.pickBtn} onPress={pickPetPhoto}>
                <Text style={styles.pickBtnText}>Pick photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {petImageUri && (
          <Image source={{ uri: petImageUri }} style={styles.petPreview} />
        )}

        <TouchableOpacity
          style={[styles.submitBtn, styles.elevated]}
          activeOpacity={0.9}
          onPress={onSubmit}
          disabled={saving}
        >
          <Text style={styles.submitText}>{saving ? "Saving…" : "Submit"}</Text>
        </TouchableOpacity>

        {Platform.OS === "web" && (
          <View style={styles.webBox}>
            <Text style={{ fontWeight: "700" }}>Note:</Text>
            <Text>Image picking & precise geolocation may be limited on web.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", backgroundColor: "#000" },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 96, rowGap: 8 },

  formTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1a1a1a",
    marginTop: 10,
    marginBottom: 10,
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 10,
    marginBottom: 6,
    color: "#2c3029",
  },

  helperText: {
    marginHorizontal: 10,
    marginBottom: 8,
    color: "#2c3029",
    opacity: 0.8,
  },

  input: {
    backgroundColor: "rgba(203,238,170,0.85)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  row: { flexDirection: "row", gap: 12, marginTop: 6 },
  col: { flex: 1 },

  diffRow: { flexDirection: "row", gap: 12, marginTop: 4 },

  diffBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: "#00000022",
    backgroundColor: "rgba(203,238,170,0.65)",
  },

  diffBoxActive: {
    borderColor: "#0B3B54",
    backgroundColor: "rgba(203,238,170,0.9)",
  },

  diffTitle: { fontSize: 15, fontWeight: "800", color: "#0B3B54" },
  diffTime: { fontSize: 22, fontWeight: "900", marginTop: 6, color: "#0B3B54" },
  diffHint: { fontSize: 12, marginTop: 2, color: "#0B3B54" },

  mapWrap: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },

  map: { width: "100%", height: 260 },

  mapActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "rgba(203,238,170,0.85)",
  },

  actionBtn: {
    backgroundColor: "#9EE7FF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },

  actionBtnDark: {
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },

  actionBtnText: { fontWeight: "900", color: "#0B3B54" },
  actionBtnTextLight: { fontWeight: "900", color: "#fff" },

  metricsText: { padding: 8, fontWeight: "700", color: "#1a1a1a" },

  youWrap: { alignItems: "center" },

  youPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0, 173, 255, 0.2)",
  },

  youBadge: {
    position: "absolute",
    top: -16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#8FE4FF",
    borderWidth: 4,
    borderColor: "#46BEE5",
  },

  youText: { color: "#0B3B54", fontWeight: "900", fontSize: 20 },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 6,
    marginTop: 4,
  },

  chip: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },

  chipSelected: { borderColor: "#000" },
  chipText: { fontWeight: "800", color: "#1f2722" },

  petRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  pickBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },

  pickBtnText: { color: "#fff", fontWeight: "800" },

  petPreview: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    marginTop: 8,
  },

  submitBtn: {
    marginTop: 14,
    backgroundColor: "#111",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 14,
  },

  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  elevated: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }) as object,

  webBox: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.8)",
    gap: 4,
  },
});
