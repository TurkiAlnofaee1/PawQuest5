// src/lib/backgroundTracking.ts
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as BackgroundFetch from "expo-background-fetch";
import { Pedometer } from "expo-sensors";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { upsertDailyCalories, upsertDailySteps } from "./userMetrics";

const LOCATION_TASK = "BG_LOCATION_UPDATES";
const STEP_FETCH_TASK = "BG_STEP_FETCH";

const MAX_SPEED_MS = 5.56; // ~20 km/h if you want a guard in your app logic

// ───────────────── storage helpers ─────────────────
async function saveNumber(key: string, value: number) {
  try { await AsyncStorage.setItem(key, String(value)); } catch {}
}
async function getNumber(key: string, fallback = 0): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
async function saveJSON<T>(key: string, value: T) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Public keys you can read anywhere in your app
export const BG_KEYS = {
  latestSpeedMs: "bg_latest_speed_ms",
  totalSteps: "bg_total_steps",
  lastStepFetchISO: "bg_last_step_fetch_iso",
};

// ───────────────── Location background task ─────────────────
// Fires even when the app is terminated (per OS policy), delivering location updates.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data as { locations?: Location.LocationObject[] }) ?? {};
  if (!locations || !locations.length) return;

  // Use first location in batch
  const { coords } = locations[0];
  // Prefer native speed when provided; if null, you could compute from deltas.
  const s = coords.speed != null && !Number.isNaN(coords.speed) ? Math.max(0, coords.speed) : 0;

  // Save latest speed (m/s)
  await saveNumber(BG_KEYS.latestSpeedMs, s);
});

// ───────────────── Background fetch task for steps ─────────────────
// Wakes up roughly every ~15 min (OS decides) to query total steps since last fetch.
TaskManager.defineTask(STEP_FETCH_TASK, async () => {
  try {
    const pedoAvailable = await Pedometer.isAvailableAsync();
    if (!pedoAvailable) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Last time we fetched
    const lastISO = await AsyncStorage.getItem(BG_KEYS.lastStepFetchISO);
    const start = lastISO ? new Date(lastISO) : new Date(Date.now() - 15 * 60 * 1000);
    const end = new Date();

    // Query steps between start and end (works even if app was backgrounded)
    const { steps } = await Pedometer.getStepCountAsync(start, end);

    if (Number.isFinite(steps) && steps > 0) {
      const prev = await getNumber(BG_KEYS.totalSteps, 0);
      await saveNumber(BG_KEYS.totalSteps, prev + steps);
    }

    await AsyncStorage.setItem(BG_KEYS.lastStepFetchISO, end.toISOString());
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ───────────────── public API ─────────────────
/**
 * Call once (early) when your app starts.
 * - Requests foreground+background location.
 * - Starts background location updates (for speed).
 * - Registers background fetch (for steps).
 * - While app is in foreground, also subscribes to live step deltas (no UI).
 */
export async function initBackgroundTracking() {
  // Location permissions
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return;

  const _bg = await Location.requestBackgroundPermissionsAsync();
  // Start background location updates (even if bg denied, you still get fg while open)
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (!hasStarted) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      // Keep this conservative; adjust as needed
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 2000,       // ms
      distanceInterval: 1,      // meters
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS: blue bar
      foregroundService: {
        // Android foreground service notification
        notificationTitle: "PawQuest tracking",
        notificationBody: "Tracking your speed for activity stats.",
      },
    });
  }

  // Background fetch for step batches
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Available ||
    status === BackgroundFetch.BackgroundFetchStatus.Restricted
  ) {
    const registered = await TaskManager.isTaskRegisteredAsync(STEP_FETCH_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(STEP_FETCH_TASK, {
        minimumInterval: 15 * 60, // seconds (iOS clamps; Android may allow tighter with WorkManager)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  }

  // While the app is in foreground, also accumulate live step deltas.
  attachLiveStepWatcher();
}

// ───────────────── foreground-only live steps (no UI) ─────────────────
let pedoSub: { remove?: () => void } | null = null;
let lastCum = 0;

function attachLiveStepWatcher() {
  if (pedoSub) return; // already attached

  const startWatch = async () => {
    const available = await Pedometer.isAvailableAsync();
    if (!available) return;

    lastCum = 0;
    pedoSub = Pedometer.watchStepCount(async ({ steps }) => {
      if (!Number.isFinite(steps)) return;
      const delta = Math.max(0, steps - lastCum);
      lastCum = steps;
      if (delta > 0) {
        const prev = await getNumber(BG_KEYS.totalSteps, 0);
        await saveNumber(BG_KEYS.totalSteps, prev + delta);
      }
    });
  };

  const stopWatch = () => {
    pedoSub?.remove?.();
    pedoSub = null;
    lastCum = 0;
  };

  // Start immediately if app is active
  if (AppState.currentState === "active") startWatch();

  // Manage lifecycle
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") startWatch();
    else stopWatch();
  });

  // Optional: expose a cleanup function if you need it later
  // return () => { sub.remove(); stopWatch(); };
}

// ────────────────────────────────────────────────────────────────────────────────
// Challenge session tracking (foreground-only; invoked by Challenge screens)
// ────────────────────────────────────────────────────────────────────────────────
type Session = {
  active: boolean;
  startedAt: number;
  lastSampleAt: number;
  steps: number;
  calories: number;
  weightKg: number; // used for calorie calc
  pedo?: { remove?: () => void } | null;
  speedMs: number; // last known speed snapshot
  monitorId?: any;
  overSpeedSec: number;
};

const DEFAULT_WEIGHT_KG = 70;
let session: Session | null = null;

function speedToMET(speedMs: number): number {
  const kph = Math.max(0, speedMs) * 3.6;
  if (kph < 3) return 2.3; // very slow walk
  if (kph < 4) return 2.9; // slow walk
  if (kph < 5) return 3.5; // normal walk
  if (kph < 6) return 4.3; // brisk
  if (kph < 8) return 7.0; // slow run / jog
  if (kph < 10) return 9.8; // run
  return 11.5; // fast run
}

async function loadUserWeightKg(): Promise<number> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return DEFAULT_WEIGHT_KG;
    const snap = await getDoc(doc(db, "Users", uid));
    const w = (snap.data() as any)?.weight;
    const n = typeof w === "string" ? Number(w) : w;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WEIGHT_KG;
  } catch {
    return DEFAULT_WEIGHT_KG;
  }
}

async function snapshotLatestSpeed(): Promise<number> {
  const s = await getNumber(BG_KEYS.latestSpeedMs, 0);
  return Math.max(0, Math.min(s, MAX_SPEED_MS));
}

/** Call when a challenge or quick run starts */
export async function beginChallengeSession(): Promise<void> {
  if (session?.active) return;
  const weightKg = await loadUserWeightKg();
  const now = Date.now();
  session = {
    active: true,
    startedAt: now,
    lastSampleAt: now,
    steps: 0,
    calories: 0,
    weightKg,
    pedo: null,
    speedMs: await snapshotLatestSpeed(),
    monitorId: null,
    overSpeedSec: 0,
  };

  // attach foreground pedometer for deltas while session is active
  const available = await Pedometer.isAvailableAsync();
  if (available && session) {
    session.pedo = Pedometer.watchStepCount(async ({ steps }) => {
      const s = session;
      if (!s || !s.active) return;
      const nowTick = Date.now();
      const deltaSteps = Math.max(0, steps);
      s.steps += deltaSteps;
      // update speed snapshot (best-effort)
      s.speedMs = await snapshotLatestSpeed();
      const dtHours = Math.max(0, (nowTick - s.lastSampleAt) / 3600000);
      if (dtHours > 0) {
        const met = speedToMET(s.speedMs);
        s.calories += met * s.weightKg * dtHours; // kcal
        s.lastSampleAt = nowTick;
      }
    });
  }

  // Start a 1s monitor to detect overspeed regardless of step events
  if (session) {
    session.monitorId = setInterval(async () => {
      const s = session;
      if (!s || !s.active) return;
      const v = await snapshotLatestSpeed();
      s.speedMs = v;
      if (v > MAX_SPEED_MS) {
        s.overSpeedSec += 1;
        if (s.overSpeedSec >= 10) {
          await cancelChallengeSessionDueToViolation();
          notifyViolation({ reason: 'overspeed', speedMs: v, durationSec: s.overSpeedSec });
        }
      } else {
        s.overSpeedSec = 0;
      }
    }, 1000);
  }
}

/** Call when the challenge ends. Persists today totals and clears session. */
export async function endChallengeSessionAndPersist(): Promise<{ steps: number; calories: number }> {
  const s = session;
  session = null;
  try {
    s?.pedo?.remove?.();
  } catch {}
  if (s?.monitorId) {
    try { clearInterval(s.monitorId); } catch {}
  }

  if (!s || !s.active) return { steps: 0, calories: 0 };

  // Finalize one last calorie slice since the last sample
  const now = Date.now();
  const dtHours = Math.max(0, (now - s.lastSampleAt) / 3600000);
  if (dtHours > 0) {
    const met = speedToMET(s.speedMs);
    s.calories += met * s.weightKg * dtHours;
  }

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const today = new Date();
      await upsertDailySteps(uid, today, Math.round(s.steps), 'sum');
      await upsertDailyCalories(uid, today, Math.round(s.calories), 'sum');
    } catch {
      // ignore persistence errors silently
    }
  }

  return { steps: Math.round(s.steps), calories: Math.round(s.calories) };
}

/** Utility to check if a session is currently running */
export function isChallengeSessionActive(): boolean {
  return !!session?.active;
}

export function getCurrentSessionSteps(): number {
  return Math.max(0, Math.round(session?.steps ?? 0));
}

// ─── Overspeed violation events ────────────────────────────────────────────────
export type ChallengeViolation = { reason: 'overspeed'; speedMs: number; durationSec: number };
const listeners = new Set<(v: ChallengeViolation) => void>();
export function onChallengeViolation(cb: (v: ChallengeViolation) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notifyViolation(v: ChallengeViolation) {
  listeners.forEach((fn) => {
    try { fn(v); } catch {}
  });
}

async function cancelChallengeSessionDueToViolation() {
  const s = session;
  if (!s) return;
  s.active = false; // stop further accumulation
  try { s.pedo?.remove?.(); } catch {}
  if (s.monitorId) {
    try { clearInterval(s.monitorId); } catch {}
  }
  session = null; // do not persist totals
}
