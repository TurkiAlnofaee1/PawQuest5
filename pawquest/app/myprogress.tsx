import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ImageBackground,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

import { auth } from "@/src/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { getSteps7d, getCalories7d } from "@/src/lib/userMetrics";

// ✅ new import
// legacy PlayersDB import removed; using metrics helper

const bgImage = require("@/assets/images/ImageBackground.jpg");

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 32, 420);

// ───────────────── helpers ─────────────────
function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
/** Build a 7-day window [start..end] inclusive and return keys + map */
function build7DayKeys(endInclusive: Date) {
  const end = startOfLocalDay(endInclusive);
  const start = addDays(end, -6);
  const keys: string[] = [];
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    keys.push(ymd(d));
    dates.push(d);
  }
  return { start, end, keys, dates };
}

// ───────────────── charts ─────────────────
function MiniLineChart({
  data,
  height = 140,
  padding = 16,
  showGrid = true,
  yMax: yMaxProp,
}: {
  data: number[];
  height?: number;
  padding?: number;
  showGrid?: boolean;
  yMax?: number;
}) {
  const width = CARD_W - 24 * 2; // card padding
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const yMax =
    yMaxProp ??
    Math.max(10, Math.ceil((Math.max(...data) || 1) / 100) * 100 + 100);

  const points = React.useMemo(() => {
    const stepX = innerW / (data.length - 1 || 1);
    return data.map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + innerH - (v / yMax) * innerH;
      return { x, y };
    });
  }, [data, innerH, innerW, padding, yMax]);

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const gridY = [0, 0.5, 1].map((r) => padding + r * innerH);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {showGrid &&
          gridY.map((gy, idx) => (
            <Line
              key={idx}
              x1={padding}
              y1={gy}
              x2={padding + innerW}
              y2={gy}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
            />
          ))}

        <Polyline
          points={polyPoints}
          fill="none"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={3}
        />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill="rgba(0,0,0,0.25)" />
        ))}
      </Svg>
    </View>
  );
}

function StatCard({
  title,
  subtitle = "Last 7 Days",
  avgLabel,
  avgValue,
  unitRight = "",
  data,
  yMax,
}: {
  title: string;
  subtitle?: string;
  avgLabel: string;
  avgValue: string;
  unitRight?: string;
  data: number[];
  yMax?: number;
}) {
  return (
    <View style={styles.cardOuter}>
      <View style={styles.cardInner}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeaderLabel}>{subtitle}</Text>
        </View>

        <MiniLineChart data={data} yMax={yMax} />

        <View style={styles.avgBar}>
          <Text style={styles.avgLeft}>{avgLabel}</Text>
          <Text style={styles.avgRight}>
            {avgValue} {unitRight}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ───────────────── screen ─────────────────
export default function ProgressScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [calories7, setCalories7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [steps7, setSteps7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // using auth from src/lib/firebase

        // TEST SIGN-IN (only for development)


        const uid = auth.currentUser?.uid;
        if (!uid) {
          setErr("You are not signed in.");
          return;
        }

        // ✅ ensure PlayersDB + today's dailyStats exist before querying
        // ensure metrics exists handled elsewhere

        const { keys } = build7DayKeys(new Date());

        const [stepsList, calsList] = await Promise.all([
          getSteps7d(uid),
          getCalories7d(uid),
        ]);

        const stepsMap = new Map<string, number>(
          stepsList.map((e) => [e.date, Number(e.value) || 0]),
        );
        const calsMap = new Map<string, number>(
          calsList.map((e) => [e.date, Number(e.value) || 0]),
        );

        const stepArr = keys.map((k) => stepsMap.get(k) ?? 0);
        const calArr = keys.map((k) => calsMap.get(k) ?? 0);

        setCalories7(calArr);
        setSteps7(stepArr);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load stats.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const avgCalories = useMemo(() => {
    const n = calories7.reduce((a, b) => a + b, 0) / 7;
    return Math.round(n).toString();
  }, [calories7]);

  const avgSteps = useMemo(() => {
    const n = steps7.reduce((a, b) => a + b, 0) / 7;
    return Math.round(n).toLocaleString();
  }, [steps7]);

  const handleGoBack = () => {
    if (router.canGoBack()) router.back();
  };

  return (
    <ImageBackground source={bgImage} style={styles.bg} imageStyle={styles.bgImg}>
      <Stack.Screen options={{ headerShown: false, title: "My Progress" }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleGoBack} style={styles.backPill}>
            <Ionicons name="chevron-back" size={22} color="#0B3D1F"  />
          </Pressable>
          <Text style={styles.title}>My Progress</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingBottom: Platform.OS === "ios" ? 24 : 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 16 }} />
          ) : err ? (
            <Text style={{ color: "red", marginBottom: 12 }}>{err}</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Calories stats:</Text>
              <StatCard
                title="Calories"
                avgLabel="Daily Avg"
                avgValue={avgCalories}
                unitRight="kcal"
                data={calories7}
                yMax={Math.max(700, Math.max(...calories7) + 100)}
                
              />

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
                Steps stats:
              </Text>
              <StatCard
                title="Steps"
                avgLabel="Daily Avg"
                avgValue={avgSteps}
                unitRight="steps"
                data={steps7}
                yMax={Math.max(11000, Math.max(...steps7) + 1000)}
              />

              <View style={{ height: 24 }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ───────────────── styles ─────────────────
const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImg: { resizeMode: "cover" },
  safe: { flex: 1 },
  container: { alignItems: "center", paddingHorizontal: 16 },
  title: {
    flex: 1,
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    color: "#0B0B0B",
  },
  headerRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 28,
  },
  backPill: {
    width: 44,
    height: 44,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginLeft: 20,
  },
  headerSpacer: { width: 44 },
  sectionLabel: {
    alignSelf: "flex-start",
    fontSize: 20,
    fontWeight: "800",
    color: "#1b1b1b",
    marginLeft: 8,
    marginBottom: 8,
  },

  cardOuter: {
    width: CARD_W,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.28)",
    padding: 12,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    ...(Platform.OS === "android" ? { elevation: 5 } : null),
  },
  cardInner: {
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 6,
  },
  cardHeaderLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,0,0,0.55)",
  },

  avgBar: {
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  avgLeft: { fontSize: 18, fontWeight: "800", color: "#222" },
  avgRight: { fontSize: 26, fontWeight: "900", color: "#2c2c2c" },
});
