import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '@/src/lib/firebase';
import { useAuth } from './useAuth';

export type PlayerProfile = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  activityLevel?: string | null;
  age?: number | null;
  weight?: number | null;
  avatarUrl?: string | null;
  role?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ProfileState = {
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
};

export function usePlayerProfile(): ProfileState {
  const { user } = useAuth();
  const [state, setState] = useState<ProfileState>({ profile: null, loading: true, error: null });

  useEffect(() => {
    if (!user) {
      setState({ profile: null, loading: false, error: null });
      return undefined;
    }

    const ref = doc(db, 'Users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snapshot) => {
        setState({
          profile: (snapshot.data() as PlayerProfile | undefined) ?? {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.photoURL,
          },
          loading: false,
          error: null,
        });
      },
      (error) => {
        setState({ profile: null, loading: false, error: error.message ?? 'Failed to load profile' });
      },
    );

    return () => unsub();
  }, [user]);

  return state;
}
