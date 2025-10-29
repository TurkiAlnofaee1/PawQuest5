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
  displayName?: string | null;
  age?: number | null;
  weight?: number | null;
  activityLevel?: string | null;
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
    const hasOverride = <K extends keyof ProfileDetails>(key: K) =>
      overrides ? Object.prototype.hasOwnProperty.call(overrides, key) : false;

    if (hasOverride('displayName')) {
      payload.displayName = overrides?.displayName ?? null;
    } else if (!snapshot.exists()) {
      payload.displayName = user.displayName ?? null;
    }

    if (hasOverride('age')) {
      payload.age = overrides?.age ?? null;
    }

    if (hasOverride('weight')) {
      payload.weight = overrides?.weight ?? null;
    }

    if (hasOverride('activityLevel')) {
      payload.activityLevel = overrides?.activityLevel ?? null;
    } else if (!snapshot.exists() && overrides?.activityLevel) {
      payload.activityLevel = overrides.activityLevel;
    }

    if (hasOverride('avatarUrl')) {
      payload.avatarUrl = overrides?.avatarUrl ?? null;
    } else if (!snapshot.exists() && mergedPhotoUrl) {
      payload.avatarUrl = mergedPhotoUrl;
    }

const isNewUser = !snapshot.exists();
    if (isNewUser) {
      payload.createdAt = serverTimestamp();
      payload.xp = 0;
      payload.level = 0;
      payload.pets = [];
      // Auto-equip the starter pet on first sign-in
      payload.equippedPetId = 'starter-falcon';
    }

    await setDoc(docRef, payload, { merge: true });
    // If this is a newly created user, give them a starter pet by default.
    // This creates a pet document under Users/{uid}/pets/starter-pet so the
    // rest of the app (which reads Users/{uid}/pets/*) will show a pet.
    if (isNewUser) {
      try {
        const starterPetRef = doc(db, 'Users', user.uid, 'pets', 'starter-falcon');
        await setDoc(
          starterPetRef,
          {
            petId: 'starter-falcon',
            name: 'Falcon',
            imageUrl: 'https://i.postimg.cc/cJW1ztH5/Falcon.png',
            challengeId: null,
            variant: null,
            collectedAt: serverTimestamp(),
            xp: 0,
            evoLevel: 0,
          },
          { merge: true },
        );
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[auth.ensureUserDocument] failed to create starter pet', err);
        }
      }
    }
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

type UpdatePlayerProfileInput = {
  displayName?: string | null;
  age?: number | null;
  weight?: number | null;
  activityLevel?: string | null;
  avatar?: {
    uri: string;
    mimeType?: string;
  } | null;
};

export async function updatePlayerProfile(updates: UpdatePlayerProfileInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in');

  let avatarUrl: string | undefined;
  if (updates.avatar?.uri) {
    try {
      avatarUrl = await uploadAvatar(updates.avatar.uri, {
        uid: user.uid,
        mimeType: updates.avatar.mimeType,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[auth.updatePlayerProfile] avatar upload failed', error);
      }
    }
  }

  const profileUpdates: { displayName?: string; photoURL?: string } = {};

  if (updates.displayName !== undefined) {
    const trimmed = updates.displayName?.trim() ?? '';
    if (trimmed) {
      profileUpdates.displayName = trimmed;
    } else if (!trimmed && user.displayName) {
      profileUpdates.displayName = '';
    }
  }

  if (avatarUrl) {
    profileUpdates.photoURL = avatarUrl;
  }

  if (Object.keys(profileUpdates).length > 0) {
    try {
      await updateProfile(user, profileUpdates);
    } catch (profileError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[auth.updatePlayerProfile] updateProfile failed', profileError);
      }
    }
  }

  const overrides: ProfileDetails = {};
  if (updates.displayName !== undefined) overrides.displayName = updates.displayName;
  if (updates.age !== undefined) overrides.age = updates.age;
  if (updates.weight !== undefined) overrides.weight = updates.weight;
  if (updates.activityLevel !== undefined) overrides.activityLevel = updates.activityLevel;

  if (avatarUrl !== undefined) {
    overrides.avatarUrl = avatarUrl;
  } else if (updates.avatar === null) {
    overrides.avatarUrl = null;
  }

  await ensureUserDocument(user, overrides);
}
