import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Transaction,
} from "firebase/firestore";
import { db } from "./firebase";

export const XP_PER_LEVEL = 1000;

export function calculateLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.floor(level) * XP_PER_LEVEL;
}

type AwardParams = {
  uid: string;
  challengeId?: string | null;
  xpEarned?: number | null;
  petId?: string | null;
  petName?: string | null;
  petImageUrl?: string | null;
  variant?: string | null;
};

export async function awardPlayerProgress({
  uid,
  challengeId,
  xpEarned = 0,
  petId,
  petName,
  petImageUrl,
  variant,
}: AwardParams): Promise<{ xp: number; level: number }> {
  if (!uid) throw new Error("Missing uid for progress award.");

  const userRef = doc(db, "Users", uid);

  const progress = await runTransaction(db, async (tx: Transaction) => {
    const snap = await tx.get(userRef);
    const current = snap.exists() ? snap.data() : {};
    const currentXp =
      typeof current?.xp === "number" && Number.isFinite(current.xp) ? current.xp : 0;
    const earned = typeof xpEarned === "number" && Number.isFinite(xpEarned) ? xpEarned : 0;
    const nextXp = Math.max(0, currentXp + Math.max(0, earned));
    const nextLevel = calculateLevel(nextXp);

    const payload: Record<string, unknown> = {
      xp: nextXp,
      level: nextLevel,
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) {
      payload.createdAt = serverTimestamp();
    }

    tx.set(userRef, payload, { merge: true });

    return { xp: nextXp, level: nextLevel };
  });

  if (petId) {
    try {
      const safeBase = petId ? petId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() : 'pet';
      const petDocId =
        typeof challengeId === 'string' && challengeId.length > 0
          ? `challenge-${challengeId}`
          : `${safeBase}-${Date.now().toString(36)}`;
      const petRef = doc(db, 'Users', uid, 'pets', petDocId);
      await setDoc(
        petRef,
        {
          petId,
          name: petName ?? petId,
          imageUrl: petImageUrl ?? null,
          challengeId: challengeId ?? null,
          variant: variant ?? null,
          collectedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[playerProgress] Failed to record pet', error);
      }
    }
  }


  return progress;
}
