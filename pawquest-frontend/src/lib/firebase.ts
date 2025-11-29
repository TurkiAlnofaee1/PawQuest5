// Firebase configuration and initialization

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
// getReactNativePersistence is provided by firebase in react-native environments,
// but importing it statically can trigger TS errors in web environments. Load it
// dynamically and fall back if not available.
let getReactNativePersistence: any | undefined;
try {
  // dynamic import: in RN environments this module is available
  // we keep it dynamic to avoid bundling issues on web
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const mod = require('firebase/auth/react-native');
  getReactNativePersistence = mod?.getReactNativePersistence;
} catch (_e) {
  getReactNativePersistence = undefined;
}
// AsyncStorage for React Native persistence
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration using environment variables for security
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Auth with React Native persistence when available.
// On web or in environments where initializeAuth fails, fall back to getAuth(app).
let authInstance;
try {
  // initializeAuth attaches React Native persistence
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage as any),
  });
} catch (_e) {
  // Fallback (e.g., web) — use getAuth
  authInstance = getAuth(app);
}

export const auth = authInstance;

export default app;
