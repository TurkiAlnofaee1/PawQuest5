import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, Unsubscribe } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { db } from '@/src/lib/firebase';
import { PET_XP_PER_LEVEL } from '@/src/lib/playerProgress';
import { useAuth } from '@/src/hooks/useAuth';

type UserDoc = {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  photoURL?: string | null;
  city?: string | null;
  equippedPetId?: string | null;
  completedChallenges?: number | string[] | null;
  favoritePetBadge?: string | null;
};

type PetDoc = {
  id: string;
  name?: string | null;
  imageUrl?: string | null;
  level?: number | null;
  rarity?: string | null;
  xp?: number | null;
  evoLevel?: number | null;
};

const bgImage = require('../../assets/images/ImageBackground.jpg');
const fallbackAvatar = require('../../assets/images/icon.png');

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export default function PetProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const { user: authUser } = useAuth();

  const [user, setUser] = useState<UserDoc | null>(null);
  const [pet, setPet] = useState<PetDoc | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingPet, setLoadingPet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [challengeRunsCount, setChallengeRunsCount] = useState<number | null>(null);
  const [modalCopy, setModalCopy] = useState<{ title: string; message: string } | null>(null);
  const [sendingGreeting, setSendingGreeting] = useState(false);
  const [hasSentGreeting, setHasSentGreeting] = useState(false);

  const petScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const id = typeof userId === 'string' ? userId : undefined;
    if (!id) {
      setLoadingUser(false);
      setError('Missing user identifier.');
      return;
    }

    let unsub: Unsubscribe | null = null;
    let triedFallback = false;

    const subscribe = (collectionName: 'users' | 'Users') => {
      unsub?.();
      unsub = onSnapshot(
        doc(db, collectionName, id),
        (snap) => {
          if (!snap.exists()) {
            if (collectionName === 'users' && !triedFallback) {
              triedFallback = true;
              subscribe('Users');
              return;
            }
            setUser(null);
            setPet(null);
            setLoadingUser(false);
            return;
          }
          const data = snap.data() as any;
          setUser({
            id,
            displayName: data.displayName ?? data.name ?? null,
            avatarUrl: data.avatarUrl ?? null,
            photoURL: data.photoURL ?? null,
            city: data.city ?? null,
            equippedPetId: data.equippedPetId ?? null,
            completedChallenges: data.completedChallenges ?? null,
            favoritePetBadge: data.favoritePetBadge ?? null,
          });
          setLoadingUser(false);
          setError(null);
        },
        (err) => {
          setError(err.message);
          setLoadingUser(false);
        },
      );
    };

    setLoadingUser(true);
    setError(null);
    subscribe('users');

    return () => {
      unsub?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!user?.equippedPetId || typeof user.equippedPetId !== 'string') {
      setPet(null);
      setLoadingPet(false);
      return;
    }

    setLoadingPet(true);

    const petId = user.equippedPetId;
    let unsubTopLevel: Unsubscribe | null = null;
    let unsubUserScoped: Unsubscribe | null = null;
    let fallbackActive = false;

    const mapSnapshot = (snap: any) => {
      const data = snap.data() as any;
      setPet({
        id: snap.id,
        name: data?.name ?? null,
        imageUrl: data?.imageUrl ?? null,
        level: numberOrNull(data?.level),
        evoLevel: numberOrNull(data?.evoLevel),
        xp: numberOrNull(data?.xp),
        rarity: data?.rarity ?? null,
      });
      setLoadingPet(false);
    };

    const subscribeToUserPet = () => {
      if (!user?.id || fallbackActive) return;
      fallbackActive = true;
      unsubUserScoped?.();
      unsubUserScoped = onSnapshot(
        doc(db, 'Users', user.id, 'pets', petId),
        (snap) => {
          if (!snap.exists()) {
            setPet(null);
            setLoadingPet(false);
            return;
          }
          mapSnapshot(snap);
        },
        () => {
          setPet(null);
          setLoadingPet(false);
        },
      );
    };

    unsubTopLevel = onSnapshot(
      doc(db, 'pets', petId),
      (snap) => {
        if (!snap.exists()) {
          if (!fallbackActive) {
            subscribeToUserPet();
            // wait for fallback listener before ending loading state
            return;
          }
          setPet(null);
          setLoadingPet(false);
          return;
        }
        mapSnapshot(snap);
      },
      () => {
        if (!fallbackActive) {
          subscribeToUserPet();
          return;
        }
        if (fallbackActive) {
          setPet(null);
          setLoadingPet(false);
        }
      },
    );

    return () => {
      unsubTopLevel?.();
      unsubUserScoped?.();
    };
  }, [user?.equippedPetId, user?.id]);

  useEffect(() => {
    if (!user?.id || !authUser?.uid || user.id === authUser.uid) {
      setHasSentGreeting(false);
      return;
    }
    const greetingDoc = doc(db, 'Users', user.id, 'greetings', authUser.uid);
    const unsub = onSnapshot(
      greetingDoc,
      (snap) => {
        setHasSentGreeting(snap.exists());
      },
      () => setHasSentGreeting(false),
    );
    return () => unsub();
  }, [user?.id, authUser?.uid]);

  useEffect(() => {
    if (!user?.id) {
      setChallengeRunsCount(null);
      return;
    }
    const runsRef = collection(db, 'Users', user.id, 'challengeRuns');
    const unsub = onSnapshot(
      runsRef,
      (snapshot) => setChallengeRunsCount(snapshot.size),
      () => setChallengeRunsCount(null),
    );
    return () => unsub();
  }, [user?.id]);

  useEffect(() => {
    if (!pet) return;
    petScale.setValue(0.9);
    Animated.spring(petScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  }, [pet, petScale]);

  const completedCount = useMemo(() => {
    let derived = 0;
    const field = user?.completedChallenges;
    if (typeof field === 'number') derived = field;
    else if (Array.isArray(field)) derived = field.length;
    const runs = typeof challengeRunsCount === 'number' ? challengeRunsCount : 0;
    return Math.max(derived, runs);
  }, [user?.completedChallenges, challengeRunsCount]);

  const petLevel = useMemo(() => {
    if (!pet) return 0;
    if (typeof pet.level === 'number' && Number.isFinite(pet.level)) return Math.max(0, pet.level);
    if (typeof pet.evoLevel === 'number' && Number.isFinite(pet.evoLevel)) return Math.max(0, pet.evoLevel);
    if (typeof pet.xp === 'number' && Number.isFinite(pet.xp)) {
      const xp = Math.max(0, pet.xp);
      return Math.floor(xp / PET_XP_PER_LEVEL);
    }
    return 0;
  }, [pet]);
  const rarityBorderColor = getRarityColor(pet?.rarity);

  const playerName = user?.displayName ?? 'Adventurer';
  const petName = pet?.name ?? 'Pet';
  const isOwnProfile = authUser?.uid && user?.id ? authUser.uid === user.id : false;

  const handleGreeting = async () => {
    if (!user?.id || !authUser?.uid) {
      setModalCopy({ title: 'Hold on', message: 'You need to be signed in to send a greeting.' });
      setModalVisible(true);
      return;
    }
    if (isOwnProfile) {
      setModalCopy({ title: 'Nice Try!', message: 'You cannot send a greeting to yourself.' });
      setModalVisible(true);
      return;
    }
    if (hasSentGreeting) {
      setModalCopy({
        title: 'Already Sent',
        message: `You have already greeted ${playerName}. Let them respond before sending another hello!`,
      });
      setModalVisible(true);
      return;
    }

    const greetingRef = doc(db, 'Users', user.id, 'greetings', authUser.uid);

    setSendingGreeting(true);
    try {
      await setDoc(greetingRef, {
        senderId: authUser.uid,
        senderName: authUser.displayName ?? 'A fellow adventurer',
        senderPhotoURL: authUser.photoURL ?? null,
        createdAt: serverTimestamp(),
        seen: false,
      });
      setModalCopy({
        title: 'Greeting Sent!',
        message: `You greeted ${playerName}'s ${petName}! They'll see it in their notifications.`,
      });
      setModalVisible(true);
    } catch (err: any) {
      setModalCopy({
        title: 'Could not send greeting',
        message: err?.message ?? 'Please try again in a moment.',
      });
      setModalVisible(true);
    } finally {
      setSendingGreeting(false);
    }
  };

  const handleChallenge = () => {
    if (!user?.id || isOwnProfile) return;
    router.push({
      pathname: '/(tabs)/challenges',
      params: { opponentId: user.id },
    });
  };

  const handleModalDismiss = () => setModalVisible(false);

  const onGoBack = () => {
    if (router.canGoBack()) router.back();
  };

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Pressable onPress={onGoBack} style={styles.backPill}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>

          {loadingUser ? (
            <View style={styles.loaderBlock}>
              <ActivityIndicator size="large" color="#14532D" />
            </View>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : !user ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>We could not find this player.</Text>
            </View>
          ) : (
            <>
              <View style={styles.profileCard}>
                <Image
                  source={user.avatarUrl || user.photoURL ? { uri: (user.avatarUrl ?? user.photoURL) as string } : fallbackAvatar}
                  style={styles.avatar}
                />
                <View style={styles.profileInfo}>
                  <Text style={styles.playerName}>{playerName}</Text>
                  {user.city ? <Text style={styles.playerCity}>{user.city}</Text> : null}
                </View>
              </View>

              <View style={[styles.petCard, { borderColor: rarityBorderColor }]}>
                {loadingPet ? (
                  <View style={styles.petLoader}>
                    <ActivityIndicator color="#14532D" />
                  </View>
                ) : pet ? (
                  <>
                    <Animated.Image
                      source={pet.imageUrl ? { uri: pet.imageUrl } : fallbackAvatar}
                      style={[styles.petImage, { transform: [{ scale: petScale }] }]}
                      resizeMode="contain"
                    />
                    <Text style={styles.petName}>{petName}</Text>
                    <Text style={styles.petLevel}>Lvl {petLevel}</Text>
                    {user.favoritePetBadge ? (
                      <View style={styles.badgeChip}>
                        <Text style={styles.badgeText}>{user.favoritePetBadge}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.petLoader}>
                    <Text style={styles.emptyPetText}>No pet equipped yet.</Text>
                  </View>
                )}
              </View>

              <View style={styles.statsCard}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Challenges Completed</Text>
                  <Text style={styles.statValue}>{completedCount}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Evolution Level</Text>
                  <Text style={styles.statValue}>{petLevel}</Text>
                </View>
              </View>

              {!isOwnProfile ? (
                <View style={styles.actions}>
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.greetButton,
                      (hasSentGreeting || sendingGreeting) && styles.disabledButton,
                    ]}
                    onPress={handleGreeting}
                    disabled={hasSentGreeting || sendingGreeting}
                  >
                    <Text style={[styles.actionText, (hasSentGreeting || sendingGreeting) && styles.disabledText]}>
                      {hasSentGreeting ? 'Greeting Sent' : sendingGreeting ? 'Sending...' : 'Send Greeting'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.challengeButton]}
                    onPress={handleChallenge}
                  >
                    <Text style={[styles.actionText, styles.challengeText]}>Challenge</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={handleModalDismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalCopy?.title ?? 'Heads up!'}</Text>
            <Text style={styles.modalMessage}>{modalCopy?.message ?? 'Something happened.'}</Text>
            <Pressable style={styles.modalButton} onPress={handleModalDismiss}>
              <Text style={styles.modalButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

function getRarityColor(rarity?: string | null) {
  switch ((rarity ?? '').toLowerCase()) {
    case 'rare':
      return '#60A5FA';
    case 'epic':
      return '#FACC15';
    case 'common':
      return '#9CA3AF';
    default:
      return '#A7D3AA';
  }
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  backPill: {
    backgroundColor: '#BEE3BF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    alignSelf: 'flex-start',
  },
  backText: { fontWeight: '800', color: '#0B3D1F' },
  loaderBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  errorBlock: {
    marginTop: 60,
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  errorText: { color: '#991B1B', fontWeight: '700', textAlign: 'center' },
  profileCard: {
    marginTop: 24,
    backgroundColor: '#E4F5E5',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatar: { width: 80, height: 80, borderRadius: 24, borderWidth: 3, borderColor: '#A7D3AA' },
  profileInfo: { marginLeft: 16, flex: 1 },
  playerName: { fontSize: 26, fontWeight: '900', color: '#0B3D1F' },
  playerCity: { fontSize: 14, fontWeight: '600', color: '#14532D', marginTop: 4 },
  petCard: {
    marginTop: 24,
    borderWidth: 3,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFFDE',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  petLoader: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  petImage: { width: 220, height: 220 },
  petName: { fontSize: 24, fontWeight: '900', color: '#064E3B', marginTop: 16 },
  petLevel: { fontSize: 16, fontWeight: '700', color: '#14532D', marginTop: 6 },
  emptyPetText: { color: '#065F46', fontWeight: '700' },
  badgeChip: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  badgeText: { color: '#065F46', fontWeight: '800' },
  statsCard: {
    marginTop: 24,
    backgroundColor: '#BEE3BF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#064E3B', fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  statValue: { color: '#0B3D1F', fontWeight: '900', fontSize: 20, marginTop: 4 },
  statDivider: { width: 1, height: 46, backgroundColor: '#94D3A0', marginHorizontal: 16 },
  actions: { marginTop: 30, gap: 14 },
  actionButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  greetButton: { backgroundColor: '#FFFFFF' },
  challengeButton: { backgroundColor: '#10B981' },
  actionText: { fontWeight: '800', color: '#064E3B', fontSize: 16 },
  challengeText: { color: '#FFFFFF' },
  disabledButton: { opacity: 0.6 },
  disabledText: { color: '#475569' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#064E3B' },
  modalMessage: { fontSize: 15, color: '#14532D', textAlign: 'center', marginTop: 8, fontWeight: '600' },
  modalButton: {
    marginTop: 18,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  modalButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
