import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  User,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

type AuthResult = {
  user: User | null;
  error?: string;
};

type ProfileDetails = {
  displayName?: string;
  age?: number;
  weight?: number;
  activityLevel?: string;
  avatarUrl?: string | null;
};

type SignUpProfileInput = ProfileDetails & {
  avatar?: {
    uri: string;
    mimeType?: string;
  };
};

export async function signUpWithEmail(
  email: string,
  password: string,
  profile?: SignUpProfileInput,
): Promise<AuthResult> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    let avatarUrl: string | undefined;

    if (profile?.avatar?.uri) {
      try {
        avatarUrl = await uploadAvatar(profile.avatar.uri, {
          uid: cred.user.uid,
          mimeType: profile.avatar.mimeType,
        });
      } catch (uploadError) {
        avatarUrl = undefined;
        if (process.env.NODE_ENV === 'development') {
          console.warn('[auth.signUpWithEmail] avatar upload failed', uploadError);
        }
      }
    }

    const profileUpdates: { displayName?: string; photoURL?: string } = {};
    if (profile?.displayName) profileUpdates.displayName = profile.displayName;
    if (avatarUrl) profileUpdates.photoURL = avatarUrl;

    try {
      if (Object.keys(profileUpdates).length > 0) {
        await updateProfile(cred.user, profileUpdates);
      }
    } catch (profileError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[auth.signUpWithEmail] updateProfile failed', profileError);
      }
    }

    await ensureUserDocument(
      cred.user,
      {
        displayName: profile?.displayName,
        age: profile?.age,
        weight: profile?.weight,
        activityLevel: profile?.activityLevel,
        avatarUrl: avatarUrl ?? (profile?.avatarUrl ?? null),
      },
    );
    return { user: cred.user };
  } catch (e: any) {
    return { user: null, error: mapAuthError(e) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDocument(cred.user);
    return { user: cred.user };
  } catch (e: any) {
    return { user: null, error: mapAuthError(e) };
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: mapAuthError(e) };
  }
}

function mapAuthError(e: any) {
  const code = e?.code ?? e?.message ?? String(e);
  const normalized = String(code).toLowerCase();

  if (normalized.includes('invalid-email') || normalized.includes('invalid email')) {
    return 'Invalid email address.';
  }

  if (normalized.includes('user-not-found')) {
    return 'No account found for that email.';
  }

  if (normalized.includes('wrong-password')) {
    return 'Incorrect password.';
  }

  if (normalized.includes('email-already-in-use') || normalized.includes('already in use')) {
    return 'An account with that email already exists.';
  }

  if (normalized.includes('weak-password') || normalized.includes('weak password')) {
    return 'Password is too weak (min 6 characters).';
  }

  if (normalized.includes('too-many-requests')) {
    return 'Too many attempts. Please try again later.';
  }

  if (normalized.includes('user-disabled')) {
    return 'This account has been disabled.';
  }

  return typeof e === 'string' ? e : 'Authentication failed. Please try again.';
}

export type { User };

async function ensureUserDocument(user: User, overrides?: ProfileDetails) {
  if (!user?.uid) return;
  try {
    const docRef = doc(db, 'Users', user.uid);
    const snapshot = await getDoc(docRef);
    const mergedPhotoUrl = overrides?.avatarUrl ?? user.photoURL ?? null;
    const payload: Record<string, unknown> = {
      uid: user.uid,
      email: user.email ?? null,
      providerId: user.providerData?.[0]?.providerId ?? 'password',
      photoURL: mergedPhotoUrl,
      updatedAt: serverTimestamp(),
      role: 'player',
    };

    const displayName = overrides?.displayName ?? user.displayName;
    if (displayName !== undefined) payload.displayName = displayName ?? null;
    if (typeof overrides?.age === 'number') payload.age = overrides.age;
    if (typeof overrides?.weight === 'number') payload.weight = overrides.weight;
    if (overrides?.activityLevel) payload.activityLevel = overrides.activityLevel;
    if (overrides?.avatarUrl !== undefined) {
      payload.avatarUrl = overrides.avatarUrl;
    } else if (!snapshot.exists() && mergedPhotoUrl) {
      payload.avatarUrl = mergedPhotoUrl;
    }

    if (!snapshot.exists()) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[auth.ensureUserDocument] failed to sync profile', error);
    }
  }
}

async function uploadAvatar(
  uri: string,
  options: { uid: string; mimeType?: string },
) {
  const uploadUrl = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!uploadUrl || !uploadPreset) {
    throw new Error('Cloudinary environment variables missing');
  }

  const file = {
    uri,
    type: options.mimeType ?? 'image/jpeg',
    name: `avatar-${options.uid}.jpg`,
  };

  const formData = new FormData();
  formData.append('file', file as any);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', `pawquest/players/${options.uid}`);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const json = await response.json();
  if (!response.ok || !json?.secure_url) {
    throw new Error(json?.error?.message ?? 'Upload failed');
  }

  return json.secure_url as string;
}
