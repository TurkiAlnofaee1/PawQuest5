import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Transaction } from 'firebase/firestore';
import { db } from './firebase';

export type DayEntry = { date: string; value: number };

type MetricsDoc = {
  days?: DayEntry[];
  createdAt?: any;
  updatedAt?: any;
};
/**
 * Structure of the per-metric Firestore document under
 * Users/{uid}/metrics/{metricDocId}.
 */
const SUBCOLLECTION = 'metrics';
const STEPS_DOC = 'steps7d';
const CALORIES_DOC = 'calories7d';
/**
 * Convert a Date to a local YYYY-MM-DD string key.
 * Used as the stable key for each day's entry.
 */
function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
/**
 * Return a new Date that is `n` days before `base`.
 */
function daysAgo(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() - n);
  return d;
}
/**
 * Keep only the last 7 days (today + previous 6) from a list of DayEntry.
 * Also filters out invalid items and sorts ascending by date.
 */
function keepLast7Days(entries: DayEntry[], today = new Date()): DayEntry[] {
  const minDate = daysAgo(today, 6); // include today and previous 6 days
  const minKey = toIsoDate(minDate);
  return entries
    .filter((e) => e && typeof e.date === 'string')
    .filter((e) => e.date >= minKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/**
 * Ensure that a metrics document exists for the given user + docId.
 * Creates an empty document with timestamps if missing.
 */
async function ensureDoc(uid: string, docId: string): Promise<void> {
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      { days: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
}
/**
 * Initialize all metric docs that we expect for a user.
 * Call this once after sign-up / first login.
 */
export async function initUserMetrics(uid: string): Promise<void> {
  if (!uid) return;
  await Promise.all([ensureDoc(uid, STEPS_DOC), ensureDoc(uid, CALORIES_DOC)]);
}
/**
 * Core helper to upsert a value into a 7-day rolling metric document.
 * - `mode = "replace"`: overwrite today's value (e.g. when you recompute).
 * - `mode = "sum"`: add to today's value (e.g. incremental updates).
 * Always clamps values >= 0 and prunes to the last 7 days inside a
 * Firestore transaction to avoid race conditions.
 */
async function upsertValue(
  uid: string,
  docId: string,
  date: Date,
  value: number,
  mode: 'replace' | 'sum' = 'replace',
): Promise<DayEntry[]> {
  if (!uid) throw new Error('Missing uid');
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, docId);
  const dateKey = toIsoDate(date);

  const days = await runTransaction(db, async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const current: MetricsDoc = snap.exists() ? (snap.data() as any) : {};
    const list: DayEntry[] = Array.isArray(current.days) ? [...current.days] : [];

    const idx = list.findIndex((e) => e.date === dateKey);
    if (idx >= 0) {
      const currentVal = Number(list[idx].value) || 0;
      list[idx] = {
        date: dateKey,
        value: mode === 'sum' ? Math.max(0, currentVal + Math.max(0, value)) : Math.max(0, value),
      };
    } else {
      list.push({ date: dateKey, value: Math.max(0, value) });
    }
// Enforce the rolling 7-day window
    const pruned = keepLast7Days(list, date);

    tx.set(
      ref,
      {
        days: pruned,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return pruned;
  });

  return days;
}
/**
 * Upsert steps for a given day into the user's 7-day steps document.
 */
export async function upsertDailySteps(
  uid: string,
  date: Date,
  steps: number,
  mode: 'replace' | 'sum' = 'replace',
): Promise<DayEntry[]> {
  return upsertValue(uid, STEPS_DOC, date, steps, mode);
}
/**
 * Upsert calories for a given day into the user's 7-day calories document.
 */
export async function upsertDailyCalories(
  uid: string,
  date: Date,
  calories: number,
  mode: 'replace' | 'sum' = 'replace',
): Promise<DayEntry[]> {
  return upsertValue(uid, CALORIES_DOC, date, calories, mode);
}
/**
 * Read the user's last 7 days of steps, normalized & sorted.
 */
export async function getSteps7d(uid: string): Promise<DayEntry[]> {
  if (!uid) return [];
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, STEPS_DOC);
  const snap = await getDoc(ref);
  const list = (snap.data()?.days as DayEntry[]) || [];
  return keepLast7Days(list);
}
/**
 * Read the user's last 7 days of calories, normalized & sorted.
 */
export async function getCalories7d(uid: string): Promise<DayEntry[]> {
  if (!uid) return [];
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, CALORIES_DOC);
  const snap = await getDoc(ref);
  const list = (snap.data()?.days as DayEntry[]) || [];
  return keepLast7Days(list);
}