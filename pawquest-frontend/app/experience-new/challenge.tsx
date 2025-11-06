// ---- Cloudinary env (Unsigned upload) ----
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UNSIGNED_PRESET!;
// ---- OpenRouteService env (walking directions) ----
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY!;

import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import TopBar from '@/components/TopBar';
import ExperienceSegment from '@/components/ExperienceSegment';

import MapView, {
  Marker,
  Polyline,
  Region,
  LatLng,
  type LongPressEvent,
} from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

// ✅ Firestore helper + type
import { createChallenge, type Category } from '../../src/lib/experience';
// ✅ ORS helper (new)
import { fetchWalkingRoute } from '@/src/lib/ors';

const bgImage = require('../../assets/images/ImageBackground.jpg');

const CATEGORY_COLORS: Record<Category, string> = {
  City: '#9ed0ff',
  Mountain: '#ffb3b3',
  Desert: '#ffd58a',
  Sea: '#8fd2ff',
};

const INITIAL_REGION: Region = {
  latitude: 21.543333,
  longitude: 39.172779,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// ---- upload a file URI to Cloudinary (unsigned) ----
async function uploadToCloudinary(uri: string): Promise<string> {
  const form = new FormData();
  form.append('file', { uri, type: 'image/*', name: 'pet.jpg' } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', 'pawquest/pets');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Cloudinary upload failed');
  return json.secure_url as string;
}

export default function ChallengeFormScreen() {
  // form state
  const [name, setName] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState('');
  const [points, setPoints] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [category, setCategory] = useState<Category>('City');
  const [saving, setSaving] = useState(false);

  // map picking
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);

  // walking route & metrics (from ORS)
  const [routeCoords, setRouteCoords] = useState<LatLng[] | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | undefined>(undefined);
  const [estimatedTimeMin, setEstimatedTimeMin] = useState<number | undefined>(undefined);

  // “YOU” marker location (after locate me)
  const [you, setYou] = useState<LatLng | null>(null);

  // pet image (suggested reward image)
  const [petImageUri, setPetImageUri] = useState<string | null>(null);

  // ───────────────── helpers ─────────────────
  const onMapLongPress = async (e: LongPressEvent) => {
    const coord = e.nativeEvent.coordinate;
    if (!start) {
      setStart(coord);
      setEnd(null);
      setRouteCoords(null);
      setDistanceMeters(undefined);
      setEstimatedTimeMin(undefined);
    } else if (!end) {
      setEnd(coord);
      try {
        // Call walking directions via shared ors.ts
        await getSnappedRoute(start, coord);
      } catch (err: any) {
        console.warn('ORS error:', err?.message ?? err);
        Alert.alert('Route error', 'Could not fetch walking route.');
        setRouteCoords(null);
      }
    } else {
      // restart sequence
      setStart(coord);
      setEnd(null);
      setRouteCoords(null);
      setDistanceMeters(undefined);
      setEstimatedTimeMin(undefined);
    }
  };

  // ⤵️ Uses '@/src/lib/ors' to fetch a snapped walking route and update state
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
  } catch (err: any) {
    console.warn("ORS error:", err?.message ?? err);
    Alert.alert("Route error", String(err?.message ?? "Failed to fetch walking route."));
    setRouteCoords(null);
  }
}


  const clearPoints = () => {
    setStart(null);
    setEnd(null);
    setRouteCoords(null);
    setDistanceMeters(undefined);
    setEstimatedTimeMin(undefined);
  };

  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location', 'Permission is required to center the map.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    const me: LatLng = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          alert('Permission to access photos is required!');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (!result.canceled) {
        setPetImageUri(result.assets[0].uri);
      }
    } catch (e: any) {
      console.warn('ImagePicker error:', e?.message ?? e);
      alert('Could not open image picker.');
    }
  };

  // ───────────────── submit ─────────────────
  const onSubmit = async () => {
    if (saving) return;

    // stricter validation
    if (!name.trim() || !script.trim() || !duration || !points || !rewardName.trim() || !start || !end) {
      Alert.alert('Missing info', 'Please fill all fields and pick Start & End on the map.');
      return;
    }

    try {
      setSaving(true);

      let rewardImageUrl: string | undefined;
      if (petImageUri) {
        try {
          rewardImageUrl = await uploadToCloudinary(petImageUri);
        } catch (err: any) {
          Alert.alert('Upload failed', err?.message ?? 'Could not upload image');
        }
      }

      await createChallenge({
        name: name.trim(),
        category,
        script: script.trim(),
        pointsReward: Number(points) || 0,
        durationMinutes: Number(duration) || 0,
        suggestedReward: rewardName.trim() || '',
        createdBy: 'demo',
        start,
        end,
        distanceMeters,
        estimatedTimeMin,
        rewardImageUrl,
      });

      Alert.alert('Success', 'Challenge saved!');
      // reset
      setName('');
      setScript('');
      setDuration('');
      setPoints('');
      setRewardName('');
      setCategory('City');
      clearPoints();
      setPetImageUri(null);
    } catch (e: any) {
      Alert.alert('Failed to save', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  // ───────────────── UI ─────────────────
  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <TopBar title="Create an experience  +" backTo="/(tabs)/settings" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ExperienceSegment current="challenge" />

        <Text style={styles.formTitle}>Add Challenge</Text>

        {/* Name */}
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: The ride"
          placeholderTextColor="#6A6A6A"
          value={name}
          onChangeText={setName}
        />

        {/* Location picker */}
        <Text style={styles.label}>Location</Text>
        <Text style={styles.helperText}>
          Long-press once to set <Text style={{ fontWeight: '800' }}>Start</Text>, long-press again to set{' '}
          <Text style={{ fontWeight: '800' }}>End</Text>.{'\n'}
          Use “Locate me” to move the map to your position. Tap “Clear” to restart.
        </Text>

        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={region}
            region={region}
            onRegionChangeComplete={setRegion}
            onLongPress={onMapLongPress}
          >
            {/* YOU marker with pulsing circle + label */}
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

            {/* Street-aligned route */}
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
              {distanceMeters ? `${(distanceMeters / 1000).toFixed(2)} km` : ''}{' '}
              {estimatedTimeMin ? `• ~${estimatedTimeMin} min (walking)` : ''}
            </Text>
          )}
        </View>

        {/* Category chips */}
        <Text style={[styles.label, { marginTop: 8 }]}>Story Category</Text>
        <View style={styles.chipsRow}>
          {(['City', 'Mountain', 'Desert', 'Sea'] as const).map((t) => {
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
                activeOpacity={0.9}
              >
                <Text style={[styles.chipText, selected && { color: '#000' }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Script / duration / points */}
        <Text style={styles.label}>Story Script</Text>
        <TextInput
          style={[styles.textArea, styles.elevated]}
          placeholder="Add the story"
          placeholderTextColor="#6A6A6A"
          value={script}
          onChangeText={setScript}
          multiline
        />

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Duration (mins)</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="30"
              placeholderTextColor="#6A6A6A"
              keyboardType="numeric"
              value={duration}
              onChangeText={setDuration}
            />
          </View>
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
        </View>

        {/* Suggested reward + photo */}
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
        {petImageUri && <Image source={{ uri: petImageUri }} style={styles.petPreview} />}

        <TouchableOpacity
          style={[styles.submitBtn, styles.elevated]}
          activeOpacity={0.9}
          onPress={onSubmit}
          disabled={saving}
        >
          <Text style={styles.submitText}>{saving ? 'Saving…' : 'Submit'}</Text>
        </TouchableOpacity>

        {Platform.OS === 'web' && (
          <View style={styles.webBox}>
            <Text style={{ fontWeight: '700' }}>Note:</Text>
            <Text>Image picking & precise geolocation are limited on web. Test on a device with Expo Go.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', alignSelf: 'stretch', backgroundColor: '#000' },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 96, rowGap: 8 },

  formTitle: { fontSize: 22, fontWeight: '900', color: '#1a1a1a', marginTop: 10, marginBottom: 10 },

  label: { fontSize: 13, fontWeight: '800', marginLeft: 10, marginBottom: 6, color: '#2c3029' },
  helperText: { marginHorizontal: 10, marginTop: -2, marginBottom: 8, color: '#2c3029', opacity: 0.8 },

  input: { backgroundColor: 'rgba(203,238,170,0.85)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  textArea: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 110,
    textAlignVertical: 'top',
  },

  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  col: { flex: 1 },

  mapWrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.08)' },
  map: { width: '100%', height: 260 },

  mapActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(203,238,170,0.85)',
  },
  actionBtn: {
    backgroundColor: '#9EE7FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  actionBtnDark: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  actionBtnText: { fontWeight: '900', color: '#0B3B54' },
  actionBtnTextLight: { fontWeight: '900', color: '#fff' },

  metricsText: { padding: 8, fontWeight: '700', color: '#1a1a1a' },

  // YOU marker (pulsing ring + badge)
  youWrap: { alignItems: 'center' },
  youPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 173, 255, 0.2)',
  },
  youBadge: {
    position: 'absolute',
    top: -16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#8FE4FF',
    borderWidth: 4,
    borderColor: '#46BEE5',
  },
  youText: { color: '#0B3B54', fontWeight: '900', fontSize: 20 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, marginTop: 4 },
  chip: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  chipSelected: { borderColor: '#000' },
  chipText: { fontWeight: '800', color: '#1f2722' },

  petRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickBtn: { backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  pickBtnText: { color: '#fff', fontWeight: '800' },
  petPreview: { width: '100%', height: 140, borderRadius: 14, marginTop: 8 },

  submitBtn: { marginTop: 14, backgroundColor: '#111', borderRadius: 999, alignItems: 'center', paddingVertical: 14 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,

  webBox: { marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: 'rgba(255,255,255,0.8)', gap: 4 },
});
