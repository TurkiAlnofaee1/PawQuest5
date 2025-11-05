import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MapView, { LatLng, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';

import { auth } from '@/src/lib/firebase';
import { beginChallengeSession, endChallengeSessionAndPersist, onChallengeViolation, getCurrentSessionSteps } from '@/src/lib/backgroundTracking';
import { awardPlayerProgress } from '@/src/lib/playerProgress';

const haversineM = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const fmtKm = (m: number) => (m >= 1000 ? (m / 1000).toFixed(2) : (m / 1000).toFixed(2));
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export default function QuickRun() {
  const router = useRouter();

  const [region, setRegion] = useState<any | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [tick, setTick] = useState(0);

  const elapsedSec = useMemo(
    () => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0),
    [startedAt, tick],
  );
  // Display XP: 1 XP per 5 steps from session
  const displayedXp = useMemo(() => Math.max(0, Math.floor(getCurrentSessionSteps() / 5)), [tick]);

  const startWatch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Enable location to start the quick challenge.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const initial: LatLng = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    setRegion({
      latitude: initial.latitude,
      longitude: initial.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setPath([initial]);
    setStartedAt(Date.now());
    setRunning(true);
    // start calories/steps session
    void beginChallengeSession();

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
      (loc) => {
        const pt: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setPath((prev) => {
          if (prev.length === 0) return [pt];
          const last = prev[prev.length - 1];
          const d = haversineM(last, pt);
          if (!Number.isFinite(d) || d < 0.5) return prev; // ignore tiny jitter
          setDistanceM((m) => m + d);
          return [...prev, pt];
        });
        // keep camera following the user
        mapRef.current?.animateCamera({ center: pt, zoom: 16 }, { duration: 500 });
      },
    );
  }, []);

  useEffect(() => {
    void startWatch();
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [startWatch]);

  // Overspeed handler: abort without rewards
  useEffect(() => {
    const off = onChallengeViolation(() => {
      if (!running) return;
      try { watchRef.current?.remove(); } catch {}
      watchRef.current = null;
      setRunning(false);
      Alert.alert(
        'Warning',
        'Using transportation is not allowed.',
        [ { text: 'I understand', onPress: () => router.replace('/(tabs)') } ],
        { cancelable: false },
      );
    });
    return () => { try { off(); } catch {} };
  }, [running, router]);

  // Tick every second while running so timer updates smoothly even if user stands still
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const finish = useCallback(async () => {
    if (!running) return;
    watchRef.current?.remove();
    watchRef.current = null;
    setRunning(false);

    // End background session and persist steps/calories to today; use steps for XP
    let sessionTotals = { steps: 0, calories: 0 };
    try { sessionTotals = await endChallengeSessionAndPersist(); } catch {}

    // 1 XP for each 5 steps
    const xp = Math.max(0, Math.floor((sessionTotals.steps ?? 0) / 5));
    const uid = auth.currentUser?.uid;
    if (uid && xp > 0) {
      try {
        await awardPlayerProgress({ uid, xpEarned: xp });
      } catch (e) {
        // ignore award errors for UX; still show summary
      }
    }

    Alert.alert('Great Job!', `You gained ${xp} XP`, [
      { text: 'Back to Home', onPress: () => router.replace('/(tabs)') },
    ]);
  }, [distanceM, running, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Challenge Run</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region ?? undefined}
          showsUserLocation
        >
          {path.length > 1 && <Polyline coordinates={path} strokeWidth={5} strokeColor="#2F80ED" />}
        </MapView>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{fmtKm(distanceM)} km</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>{fmtTime(elapsedSec)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>XP</Text>
          <Text style={styles.statValue}>{displayedXp}</Text>
        </View>
      </View>

      <Pressable onPress={finish} style={({ pressed }) => [styles.finishBtn, pressed && { opacity: 0.9 }]}>
        <Text style={styles.finishText}>Finish</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 12, backgroundColor: '#000', alignItems: 'center' },
  title: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center' },

  mapWrap: { flex: 1 },
  map: { flex: 1 },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#BEE3BF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 10,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#0B3D1F', fontWeight: '700' },
  statValue: { color: '#0B3D1F', fontWeight: '900', fontSize: 18, marginTop: 2 },

  finishBtn: {
    backgroundColor: '#22C55E',
    margin: 14,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
