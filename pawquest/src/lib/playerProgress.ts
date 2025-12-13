import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Transaction,
} from "firebase/firestore";
import { db } from "./firebase";

export const XP_PER_LEVEL = 1000;
// Pet evolution threshold: every 500 XP grants 1 evolution level
// Pet evolution rules
export const PET_XP_PER_LEVEL = 10_000; // 10k XP per evolution
export const PET_MAX_LEVEL = 30; // Cap evolution at level 30

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
  // Optional list of evolution images ordered by stage (0..n)
  evolutionImages?: string[] | null;
  variant?: string | null;
};

export async function awardPlayerProgress({
  uid,
  challengeId,
  xpEarned = 0,
  petId,
  petName,
  petImageUrl,
  evolutionImages,
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

  // Track the pet doc we may create in this call to use as a fallback for XP
  let createdPetDocId: string | null = null;

  if (petId) {
    try {
      const safeBase = petId ? petId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() : 'pet';
      const vnorm = (variant ?? '')
        ? String(variant).toLowerCase().replace(/[^a-z0-9-]/g, '-')
        : '';
      const petDocId =
        typeof challengeId === 'string' && challengeId.length > 0
          ? `challenge-${challengeId}${vnorm ? `-${vnorm}` : ''}`
          : `${safeBase}-${Date.now().toString(36)}`;
      const petRef = doc(db, 'Users', uid, 'pets', petDocId);
      await setDoc(
        petRef,
        {
          petId,
          name: petName ?? petId,
          imageUrl: petImageUrl ?? null,
          // Persist images array for client-side evolution rendering
          images:
            Array.isArray(evolutionImages)
              ? evolutionImages.filter((u) => typeof u === 'string' && u.length > 0)
              : petImageUrl
              ? [petImageUrl]
              : [],
          challengeId: challengeId ?? null,
          variant: variant ?? null,
          collectedAt: serverTimestamp(),
          xp: 0,
          evoLevel: 0,
        },
        { merge: true },
      );
      createdPetDocId = petDocId;
    } catch (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[playerProgress] Failed to record pet', error);
      }
    }
  }

  // Award pet evolution XP to the currently equipped pet only
  if (xpEarned && xpEarned > 0) {
    try {
      await runTransaction(db, async (tx: Transaction) => {
        const userSnap = await tx.get(userRef);
        const equippedPetId = (userSnap.data() as any)?.equippedPetId as string | undefined;
        let targetPetId: string | undefined = equippedPetId;
        let targetPetRef = targetPetId ? doc(db, 'Users', uid, 'pets', targetPetId) : null;

        // If no equipped pet or it doesn't exist, fall back to the pet we just created (if any)
        if (targetPetRef) {
          const petSnap = await tx.get(targetPetRef);
          if (!petSnap.exists()) {
            targetPetRef = null;
          }
        }

        if (!targetPetRef && createdPetDocId) {
          targetPetRef = doc(db, 'Users', uid, 'pets', createdPetDocId);
        }

        if (!targetPetRef) return;

        const petSnap2 = await tx.get(targetPetRef);
        if (!petSnap2.exists()) return;
        const data: any = petSnap2.data() ?? {};
        const currentPetXp = typeof data?.xp === 'number' && Number.isFinite(data.xp) ? data.xp : 0;
        const nextPetXp = Math.max(0, currentPetXp + xpEarned);
        const nextEvoLevel = Math.min(PET_MAX_LEVEL, Math.floor(nextPetXp / PET_XP_PER_LEVEL));
        tx.set(targetPetRef, { xp: nextPetXp, evoLevel: nextEvoLevel, updatedAt: serverTimestamp() }, { merge: true });
      });
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[playerProgress] Failed to apply pet evolution XP', err);
      }
    }
  }

  
  return progress;
}
