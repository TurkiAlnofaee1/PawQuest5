import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

type Props = {
  mode: "active" | "complete";
  distanceText: string;
  timeText: string;
  progress: number;            // 0..1
  instruction?: string;
  loading?: boolean;
  onCapture: () => void;
};

export default function ChallengeHUD({
  mode,
  distanceText,
  timeText,
  progress,
  instruction,
  loading,
  onCapture,
}: Props) {
  const pct = Math.max(0, Math.min(1, progress || 0));
  const pctText = `${Math.round(pct * 100)}%`;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {/* Top row: distance & time */}
        <View style={styles.row}>
          <View style={styles.metric}>
            <MaterialCommunityIcons name="map-marker-distance" size={18} color="#0B1221" />
            <Text style={styles.metricLabel}>Remaining</Text>
            <Text style={styles.metricValue}>{distanceText}</Text>
          </View>

          <View style={[styles.metric, { alignItems: "flex-end" }]}>
            <Ionicons name="time" size={18} color="#0B1221" />
            <Text style={styles.metricLabel}>ETA</Text>
            <Text style={styles.metricValue}>{timeText}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBox}>
          <View style={styles.progressRail}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{pctText}</Text>
        </View>

        {/* Instruction or Complete */}
        <View style={styles.instructionBox}>
          {loading ? (
            <View style={styles.inline}>
              <ActivityIndicator size="small" />
              <Text style={[styles.instruction, { marginLeft: 8 }]}>Updating route…</Text>
            </View>
          ) : mode === "active" ? (
            <Text style={styles.instruction} numberOfLines={2}>
              {instruction || "Start walking…"}
            </Text>
          ) : (
            <Text style={[styles.instruction, { fontWeight: "800" }]}>
              You’ve reached the goal! 🎉
            </Text>
          )}
        </View>

        {/* Action */}
        {mode === "active" ? (
          <View style={{ height: 0 }} />
        ) : (
          <TouchableOpacity onPress={onCapture} style={styles.cta} activeOpacity={0.9}>
            <Ionicons name="cube" size={18} color="#fff" />
            <Text style={styles.ctaText}>Capture Pet</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 24,
    left: 16,
    right: 16,
  },
  card: {
    backgroundColor: "#A5D9F6",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    color: "#0B1221",
    opacity: 0.7,
    fontSize: 12,
    marginTop: 4,
  },
  metricValue: {
    color: "#0B1221",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  progressBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressRail: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(11,18,33,0.18)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2F80ED",
  },
  progressText: {
    color: "#0B1221",
    fontWeight: "700",
    minWidth: 42,
    textAlign: "right",
  },
  instructionBox: { marginTop: 12 },
  instruction: { color: "#0B1221", fontSize: 14 },
  inline: { flexDirection: "row", alignItems: "center" },
  cta: {
    marginTop: 12,
    backgroundColor: "#22C55E",
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
