// src/lib/experience.ts
import { db } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type Category = 'City' | 'Mountain' | 'Desert' | 'Sea';
export type LatLng = { latitude: number; longitude: number };

// -------- Challenges --------
export type NewChallenge = {
  name: string;
  category: Category;
  // Story removed from the form; keep optional for backward compatibility if other code still passes it.
  script?: string;
  pointsReward: number;
  /** Base/normal walking estimate (from ORS) */
  durationMinutes: number;
  suggestedReward?: string;
  createdBy: string;

  // map info
  start: LatLng;
  end: LatLng;
  distanceMeters?: number;
  estimatedTimeMin?: number;

  /** The user's selected difficulty at creation time */
  difficulty?: 'easy' | 'hard';
  /** Only the selected difficulty's adjusted duration */
  adjustedDurationMin?: number;

  // media
  rewardImageUrl?: string;   // Cloudinary URL (optional)
};

export async function createChallenge(input: NewChallenge) {
  await addDoc(collection(db, 'experiences'), {
    ...input,
    type: 'challenge',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// -------- Stories --------
export type NewStory = {
  storyName: string;
  script: string;
  createdBy: string;
};

export async function createStory(input: NewStory) {
  await addDoc(collection(db, 'experiences'), {
    ...input,
    type: 'story',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
