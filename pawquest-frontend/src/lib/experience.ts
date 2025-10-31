// src/lib/experience.ts
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase"; // 👈 because firebase.ts is in the root

export type Category = "City" | "Mountain" | "Desert" | "Sea";

const EXP = collection(db, "experiences");

// ────────────────────────────────
// Add new challenge
// ────────────────────────────────
export async function createChallenge(data: {
  name: string;
  location: string;
  category: Category;
  script: string;
  durationMinutes: number;
  pointsReward: number;
  suggestedReward?: string;
  createdBy: string;
}) {
  return addDoc(EXP, {
    ...data,
    type: "challenge",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ────────────────────────────────
// Add new story
// ────────────────────────────────
export async function createStory(data: {
  storyName: string;
  script: string;
  createdBy: string;
}) {
  return addDoc(EXP, {
    ...data,
    type: "story",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ────────────────────────────────
// Fetch all challenges
// ────────────────────────────────
export async function fetchChallenges() {
  const q = query(EXP, where("type", "==", "challenge"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ────────────────────────────────
// Update an existing experience
// ────────────────────────────────
export async function updateExperience(id: string, partial: Record<string, any>) {
  await updateDoc(doc(db, "experiences", id), {
    ...partial,
    updatedAt: serverTimestamp(),
  });
}
