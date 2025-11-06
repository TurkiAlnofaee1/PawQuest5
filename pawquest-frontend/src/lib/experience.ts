import { db } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type Category = 'City' | 'Mountain' | 'Desert' | 'Sea';
export type LatLng = { latitude: number; longitude: number };

// -------- Challenges --------
export type NewChallenge = {
  name: string;
  category: Category;
  script: string;
  pointsReward: number;
  durationMinutes: number;
  suggestedReward?: string;
  createdBy: string;

  // map info
  start: LatLng;
  end: LatLng;
  distanceMeters?: number;
  estimatedTimeMin?: number;

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
