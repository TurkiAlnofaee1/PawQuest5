// src/lib/ensurePlayersDB.ts
import { db } from "./firebase";
import { getAuth } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  serverTimestamp,
  collection,
} from "firebase/firestore";

// ───────────── helpers ─────────────
function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ensures the user’s PlayersDB/{uid} doc exists,
 * and also creates today’s dailyStats/{YYYY-MM-DD} doc
 * with zero values if missing.
 */
export async function ensurePlayersDB(): Promise<void> {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user signed in.");

  // ───────────── ensure main user doc ─────────────
  const userDocRef = doc(db, "PlayersDB", uid);
  const userSnap = await getDoc(userDocRef);

  if (!userSnap.exists()) {
    await setDoc(userDocRef, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      note: "Auto-created user record",
    });
    console.log(`✅ Created PlayersDB/${uid}`);
  } else {
    await setDoc(userDocRef, { updatedAt: serverTimestamp() }, { merge: true });
    console.log(`✅ Verified PlayersDB/${uid}`);
  }

  // ───────────── ensure today's dailyStats doc ─────────────
  const today = startOfLocalDay(new Date());
  const dayId = ymd(today);
  const statsRef = doc(collection(db, "PlayersDB", uid, "dailyStats"), dayId);
  const statsSnap = await getDoc(statsRef);

  if (!statsSnap.exists()) {
    await setDoc(statsRef, {
      dayStartTS: Timestamp.fromDate(today),
      steps: 0,
      calories: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ Created dailyStats/${dayId} initialized with zeros`);
  } else {
    await setDoc(statsRef, { updatedAt: serverTimestamp() }, { merge: true });
    console.log(`✅ Verified dailyStats/${dayId}`);
  }
}
