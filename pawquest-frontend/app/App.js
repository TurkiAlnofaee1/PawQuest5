import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import * as Location from "expo-location";

export default function App() {
  // live stats
  const [isStepAvailable, setIsStepAvailable] = useState(null);
  const [totalSteps, setTotalSteps] = useState(0);
  const [speed, setSpeed] = useState(0); // m/s from GPS
  const [status, setStatus] = useState("idle"); // idle / walking / running

  // user-adjustable inputs
  const [weightKg, setWeightKg] = useState("70");
  const [stepLengthM, setStepLengthM] = useState("0.75");

  // calories & distance
  const [distanceM, setDistanceM] = useState(0);
  const [caloriesKcal, setCaloriesKcal] = useState(0);

  // remember last cumulative steps from sensor
  const lastCumStepsRef = useRef(0);

  // subscriptions
  const pedoSub = useRef(null);
  const locSub = useRef(null);
  const [granted, setGranted] = useState(false);

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
            if (loc?.coords?.speed != null && !isNaN(loc.coords.speed)) {
              setSpeed(Math.max(0, loc.coords.speed));
            } else {
              setSpeed(0);
            }
          }
        );
      } else {
        setGranted(false);
      }

      // subscribe to step counter
      pedoSub.current = Pedometer.watchStepCount(({ steps }) => {
        const currentCum = steps;
        const prevCum = lastCumStepsRef.current;
        const delta = Math.max(0, currentCum - prevCum);
        lastCumStepsRef.current = currentCum;

        if (delta === 0) return;

        // session total
        setTotalSteps((prev) => prev + delta);

        // distance
        const stepLen = parseFloat(stepLengthM) || 0.75;
        setDistanceM((d) => d + delta * stepLen);
      });
    })();

    return () => {
      pedoSub.current && pedoSub.current.remove();
      locSub.current && locSub.current.remove();
    };
  }, [stepLengthM]);

  // classify walking vs running
  useEffect(() => {
    const s = speed || 0;
    let mode = "idle";
    if (s >= 0.8 && s < 2.2) mode = "walking";
    if (s >= 2.2) mode = "running";
    setStatus(mode);
  }, [speed]);

  // calories estimation
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
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Steps & Calories Demo (Expo Go)</Text>

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
      <Stat label="Mode" value={status} />

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

function Stat({ label, value, big }) {
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
