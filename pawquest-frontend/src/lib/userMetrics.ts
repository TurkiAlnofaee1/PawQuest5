import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Transaction } from 'firebase/firestore';
import { db } from './firebase';

export type DayEntry = { date: string; value: number };

type MetricsDoc = {
  days?: DayEntry[];
  createdAt?: any;
  updatedAt?: any;
};

const SUBCOLLECTION = 'metrics';
const STEPS_DOC = 'steps7d';
const CALORIES_DOC = 'calories7d';

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysAgo(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() - n);
  return d;
}

function keepLast7Days(entries: DayEntry[], today = new Date()): DayEntry[] {
  const minDate = daysAgo(today, 6); // include today and previous 6 days
  const minKey = toIsoDate(minDate);
  return entries
    .filter((e) => e && typeof e.date === 'string')
    .filter((e) => e.date >= minKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

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

export async function initUserMetrics(uid: string): Promise<void> {
  if (!uid) return;
  await Promise.all([ensureDoc(uid, STEPS_DOC), ensureDoc(uid, CALORIES_DOC)]);
}

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

export async function upsertDailySteps(
  uid: string,
  date: Date,
  steps: number,
  mode: 'replace' | 'sum' = 'replace',
): Promise<DayEntry[]> {
  return upsertValue(uid, STEPS_DOC, date, steps, mode);
}

export async function upsertDailyCalories(
  uid: string,
  date: Date,
  calories: number,
  mode: 'replace' | 'sum' = 'replace',
): Promise<DayEntry[]> {
  return upsertValue(uid, CALORIES_DOC, date, calories, mode);
}

export async function getSteps7d(uid: string): Promise<DayEntry[]> {
  if (!uid) return [];
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, STEPS_DOC);
  const snap = await getDoc(ref);
  const list = (snap.data()?.days as DayEntry[]) || [];
  return keepLast7Days(list);
}

export async function getCalories7d(uid: string): Promise<DayEntry[]> {
  if (!uid) return [];
  const ref = doc(db, 'Users', uid, SUBCOLLECTION, CALORIES_DOC);
  const snap = await getDoc(ref);
  const list = (snap.data()?.days as DayEntry[]) || [];
  return keepLast7Days(list);
}

