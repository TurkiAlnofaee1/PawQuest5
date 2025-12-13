import { doc, getDoc, runTransaction, serverTimestamp, Transaction } from "firebase/firestore";
import { db } from "./firebase";

export type ChallengeStats = {
  ratingAvg: number;
  ratingCount: number;
  ratingTotal: number;
};

function parseStats(raw: any): ChallengeStats {
  const ratingCount =
    typeof raw?.ratingCount === "number" && Number.isFinite(raw.ratingCount)
      ? Math.max(0, Math.floor(raw.ratingCount))
      : 0;
  const ratingTotal =
    typeof raw?.ratingTotal === "number" && Number.isFinite(raw.ratingTotal)
      ? raw.ratingTotal
      : 0;
  const ratingAvg =
    typeof raw?.ratingAvg === "number" && Number.isFinite(raw.ratingAvg)
      ? raw.ratingAvg
      : ratingCount > 0
      ? ratingTotal / ratingCount
      : 0;

  return {
    ratingAvg,
    ratingCount,
    ratingTotal,
  };
}

function assertValidRating(rating: number): asserts rating is 1 | 2 | 3 | 4 | 5 {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5.");
  }
}

export async function getUserChallengeRating(
  challengeId: string,
  uid: string,
): Promise<number | null> {
  if (!challengeId || !uid) return null;

  const ref = doc(db, "challenges", challengeId, "ratings", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const rating = snap.data()?.rating;
  return typeof rating === "number" && rating >= 1 && rating <= 5 ? rating : null;
}

export async function upsertChallengeRating(
  challengeId: string,
  uid: string,
  rating: number,
  opts?: { variant?: "easy" | "hard" },
): Promise<ChallengeStats> {
  assertValidRating(rating);
  if (!challengeId || !uid) {
    throw new Error("challengeId and uid are required to submit a rating.");
  }

  const challengeRef = doc(db, "challenges", challengeId);
  const ratingRef = doc(challengeRef, "ratings", uid);

  const stats = await runTransaction(db, async (tx: Transaction) => {
    const [challengeSnap, ratingSnap] = await Promise.all([
      tx.get(challengeRef),
      tx.get(ratingRef),
    ]);

    const currentStats = parseStats(challengeSnap.exists() ? challengeSnap.data()?.stats : undefined);

    let nextCount = currentStats.ratingCount;
    let nextTotal = currentStats.ratingTotal;

    let previousRating: number | null = null;
    if (ratingSnap.exists()) {
      const existing = ratingSnap.data();
      if (typeof existing?.rating === "number") {
        previousRating = existing.rating;
      }
    }

    if (previousRating === null) {
      nextCount += 1;
      nextTotal += rating;
    } else {
      nextTotal += rating - previousRating;
    }

    const nextAvg = nextCount > 0 ? nextTotal / nextCount : 0;

    tx.set(
      challengeRef,
      {
        stats: {
          ratingAvg: nextAvg,
          ratingCount: nextCount,
          ratingTotal: nextTotal,
        },
      },
      { merge: true },
    );

    const ratingPayload: Record<string, any> = {
      rating,
      updatedAt: serverTimestamp(),
    };
    if (!ratingSnap.exists()) {
      ratingPayload.createdAt = serverTimestamp();
    }
    if (opts?.variant) {
      ratingPayload.variant = opts.variant;
    }

    tx.set(ratingRef, ratingPayload, { merge: true });

    return {
      ratingAvg: nextAvg,
      ratingCount: nextCount,
      ratingTotal: nextTotal,
    };
  });

  return stats;
}

export async function getChallengeRatingStats(
  challengeId: string,
): Promise<ChallengeStats | null> {
  if (!challengeId) return null;

  const ref = doc(db, "challenges", challengeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return parseStats(snap.data()?.stats);
}
