import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import * as Location from "expo-location";
// Removed invalid Subscription import from expo-modules-core
import type * as LocationTypes from "expo-location";

const MAX_SPEED_MS = 5.56; // ~20 km/h — pause if speed > this

export default function StepsScreen() {
  // live stats
  const [isStepAvailable, setIsStepAvailable] = useState<boolean | null>(null);
  const [totalSteps, setTotalSteps] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(0); // m/s from GPS
  const [status, setStatus] = useState<"idle" | "walking" | "running">("idle");

  // user-adjustable inputs
  const [weightKg, setWeightKg] = useState<string>("70");
  const [stepLengthM, setStepLengthM] = useState<string>("0.75");

  // calories & distance
  const [distanceM, setDistanceM] = useState<number>(0);
  const [caloriesKcal, setCaloriesKcal] = useState<number>(0);

  // pause control & warning
  const [paused, setPaused] = useState<boolean>(false);
  const [warning, setWarning] = useState<string | null>(null);

  // remember last cumulative steps from sensor
  const lastCumStepsRef = useRef<number>(0);

  // subscriptions
  const pedoSub = useRef<any>(null);
  const locSub = useRef<LocationTypes.LocationSubscription | null>(null);
  const [granted, setGranted] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const pedoAvail = await Pedometer.isAvailableAsync();
      setIsStepAvailable(pedoAvail);

      // Ask location for speed-based walk/run
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        setGranted(true);
        locSub.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (loc) => {
            const s = loc?.coords?.speed;
            setSpeed(s != null && !Number.isNaN(s) ? Math.max(0, s) : 0);
          }
        );
      } else {
        setGranted(false);
      }

      // subscribe to step counter (cumulative since subscription start)
      pedoSub.current = Pedometer.watchStepCount(({ steps }) => {
        const currentCum = steps; // cumulative since watch started
        const prevCum = lastCumStepsRef.current;
        const delta = Math.max(0, currentCum - prevCum); // new steps since last callback
        lastCumStepsRef.current = currentCum;

        if (delta === 0) return;
        if (paused) return; // ⛔ paused due to overspeed — ignore step increments

        // session total
        setTotalSteps((prev) => prev + delta);

        // distance
        const stepLen = parseFloat(stepLengthM) || 0.75;
        setDistanceM((d) => d + delta * stepLen);
      });
    })();

    return () => {
      pedoSub.current?.remove?.();
      locSub.current?.remove?.();
    };
  }, [stepLengthM, paused]);

  // Overspeed guard: show warning & pause counting if speed > MAX_SPEED_MS
  useEffect(() => {
    if (speed > MAX_SPEED_MS) {
      setPaused(true);
      setWarning(
        `Speed ${(speed * 3.6).toFixed(1)} km/h exceeds ${(MAX_SPEED_MS * 3.6).toFixed(0)} km/h — pausing steps & distance`
      );
    } else {
      setPaused(false);
      setWarning(null);
    }
  }, [speed]);

  // classify walking vs running (we DO NOT force idle on overspeed now)
  useEffect(() => {
    const s = speed || 0;
    let mode: "idle" | "walking" | "running" = "idle";

    if (s >= 2.2) {
      mode = "running"; // >= 7.9 km/h
    } else if (s >= 0.8) {
      mode = "walking"; // ~2.9–7.9 km/h
    } else {
      mode = "idle";
    }

    setStatus(mode);
  }, [speed]);

  // calories estimation (stops increasing when paused because distance freezes)
  useEffect(() => {
    const km = distanceM / 1000;
    const wt = parseFloat(weightKg) || 70;
    const factor = status === "running" ? 1.0 : status === "walking" ? 0.6 : 0.0;
    const kcal = wt * km * factor;
    setCaloriesKcal(parseFloat(kcal.toFixed(1)));
  }, [distanceM, status, weightKg]);

  const resetSession = () => {
    setTotalSteps(0);
    setDistanceM(0);
    setCaloriesKcal(0);
    lastCumStepsRef.current = 0;
    setPaused(false);
    setWarning(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Steps & Calories</Text>

      {/* Warning banner when paused */}
      {warning && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{warning}</Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.input}>
          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="numeric"
            style={styles.textInput}
            placeholder="70"
          />
        </View>
        <View style={styles.input}>
          <Text style={styles.label}>Step length (m)</Text>
          <TextInput
            value={stepLengthM}
            onChangeText={(v) => setStepLengthM(v)}
            keyboardType="numeric"
            style={styles.textInput}
            placeholder="0.75"
          />
        </View>
      </View>

      <Stat label="Steps" value={totalSteps.toString()} big />
      <Stat label="Distance" value={`${(distanceM / 1000).toFixed(2)} km`} />
      <Stat label="Calories" value={`${caloriesKcal.toFixed(1)} kcal`} />
      <Stat label="Speed" value={`${(speed * 3.6).toFixed(1)} km/h`} />
      <Stat label="Mode" value={status + (paused ? " (paused)" : "")} />

      <View style={{ height: 12 }} />
      <TouchableOpacity onPress={resetSession} style={styles.btn}>
        <Text style={styles.btnText}>Reset Session</Text>
      </TouchableOpacity>

      <View style={{ height: 16 }} />
      <Text style={styles.meta}>
        Pedometer: {String(isStepAvailable)} | Location: {granted ? "granted" : "ask in-app"}
      </Text>
      {Platform.OS === "ios" ? (
        <Text style={styles.tip}>
          Tip (iOS): steps come from Core Motion; GPS speed can be 0 indoors.
        </Text>
      ) : (
        <Text style={styles.tip}>
          Tip (Android): speed is from GPS; try walking outside for live values.
        </Text>
      )}
    </View>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={[styles.stat, big && styles.statBig]}>
      <Text style={[styles.statLabel, big && styles.statLabelBig]}>{label}</Text>
      <Text style={[styles.statValue, big && styles.statValueBig]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: "#0b1220" },
  h1: { color: "white", fontSize: 20, fontWeight: "700", marginBottom: 16 },

  warn: {
    backgroundColor: "#3c0d0d",
    borderColor: "#ff6b6b",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  warnText: { color: "#ffb4b4", fontWeight: "600" },

  row: { flexDirection: "row", gap: 12 },
  input: { flex: 1 },
  label: { color: "#c9d1e6", marginBottom: 6 },
  textInput: {
    backgroundColor: "#151c2f",
    color: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#26304d",
  },
  stat: {
    backgroundColor: "#11182b",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#26304d",
    marginTop: 12,
  },
  statBig: { paddingVertical: 22 },
  statLabel: { color: "#8ea0c8", fontSize: 14 },
  statLabelBig: { fontSize: 16 },
  statValue: { color: "white", fontSize: 18, fontWeight: "700", marginTop: 6 },
  statValueBig: { fontSize: 32 },
  btn: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "700" },
  meta: { color: "#6b7aa6", marginTop: 8, fontSize: 12 },
  tip: { color: "#6b7aa6", marginTop: 6, fontSize: 12 },
});
