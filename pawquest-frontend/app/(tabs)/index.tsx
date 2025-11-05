import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  ImageBackground,
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { getSteps7d, getCalories7d } from '@/src/lib/userMetrics';
import { PET_XP_PER_LEVEL, PET_MAX_LEVEL } from '@/src/lib/playerProgress';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/hooks/useAuth';

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    width: '100%',
    marginBottom: 16,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 22,
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 60,
    marginVertical: 18,
    backgroundColor: '#fff', // fallback
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  statsSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  statsIcon: {
    marginRight: 8,
  },
  statsTextContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  statsValue: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.2,
  },
  statsLabel: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.8,
  },
  statsDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 8,
    borderRadius: 1,
  },
  statsChevron: {
    marginLeft: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  evolutionBox: {
    width: '92%',
    maxWidth: 520,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  evolutionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0B3D1F',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(12,46,22,0.18)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#22C55E',
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0C2E16',
    opacity: 0.9,
  },
  petImage: {
    width: 220,
    height: 220,
    marginTop: 24,
  },
  petNameBox: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  petNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1b1b1b',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  notificationsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  notificationsSheet: {
    backgroundColor: 'rgba(247,255,230,0.96)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  notificationsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0C2E16',
  },
  notificationsSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
    opacity: 0.7,
  },
  notificationsEmpty: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    opacity: 0.7,
    textAlign: 'center',
    paddingVertical: 12,
  },
  notificationItem: {
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(12, 46, 22, 0.08)',
    paddingHorizontal: 14,
    gap: 6,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B3D1F',
  },
  notificationMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(12, 46, 22, 0.72)',
  },
});

type StatsCardProps = { colorScheme: string };

const StatsCard: React.FC<StatsCardProps> = ({ colorScheme }) => {
  const router = useRouter();
  const scheme = (colorScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const cardColor = scheme === 'dark' ? '#222' : '#fff';
  const textColor = Colors[scheme].text;
  const mutedColor = scheme === 'dark' ? '#aaa' : '#888';
  const dividerColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';

  const [todayCalories, setTodayCalories] = useState<number>(0);
  const [todaySteps, setTodaySteps] = useState<number>(0);

  // simple YYYY-MM-DD helper
  const toIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    let active = true;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setTodayCalories(0);
      setTodaySteps(0);
      return;
    }
    const todayKey = toIsoDate(new Date());
    (async () => {
      try {
        const [steps, cals] = await Promise.all([getSteps7d(uid), getCalories7d(uid)]);
        if (!active) return;
        const stepsToday = steps.find((d) => d.date === todayKey)?.value ?? 0;
        const calsToday = cals.find((d) => d.date === todayKey)?.value ?? 0;
        setTodaySteps(Math.max(0, Math.round(stepsToday)));
        setTodayCalories(Math.max(0, Math.round(calsToday)));
      } catch {
        if (active) {
          setTodaySteps(0);
          setTodayCalories(0);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View testID="stats-card" style={[styles.statsCard, { backgroundColor: cardColor }]}>
      <View style={styles.statsSegment}>
        <MaterialCommunityIcons name="fire" size={22} color={textColor} style={styles.statsIcon} />
        <View style={styles.statsTextContainer}>
          <Text testID="stats-calories" accessibilityLabel={`Calories ${todayCalories}`} style={[styles.statsValue, { color: textColor }]}>{todayCalories}</Text>
          <Text style={[styles.statsLabel, { color: mutedColor }]}>Calories</Text>
        </View>
      </View>
      <View style={[styles.statsDivider, { backgroundColor: dividerColor }]} />
      <View style={styles.statsSegment}>
        <MaterialCommunityIcons name="walk" size={22} color={textColor} style={styles.statsIcon} />
        <View style={styles.statsTextContainer}>
          <Text testID="stats-steps" accessibilityLabel={`Steps ${todaySteps}`} style={[styles.statsValue, { color: textColor }]}>{todaySteps}</Text>
          <Text style={[styles.statsLabel, { color: mutedColor }]}>Steps</Text>
        </View>
      </View>
      <TouchableOpacity
        testID="stats-chevron"
        style={styles.statsChevron}
        activeOpacity={1}
        onPress={() => router.push('/myprogress')}
      >
        <MaterialCommunityIcons name="chevron-right" size={24} color={mutedColor} />
      </TouchableOpacity>
    </View>
  );
};

const bgImage = require('../../assets/images/ImageBackground.jpg');

type NotificationItem = {
  id: string;
  title: string;
  category?: string;
  timestamp: number;
  type: 'challenge' | 'greeting';
  subtitle?: string;
  meta?: Record<string, any>;
};

const NOTIFICATION_STORAGE_KEY = 'notifications:lastSeenChallenge';
const GREETING_RETENTION_MS = 24 * 60 * 60 * 1000;

const toMillis = (value: any): number => {
  try {
    if (value?.toDate) {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      const ms = parsed.getTime();
      if (!Number.isNaN(ms)) return ms;
    }
  } catch {
    // ignore conversion errors
  }
  return 0;
};

const Home: React.FC = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const { user: authUser } = useAuth();
  const scheme = (colorScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const textColor = Colors[scheme].text;
  const iconColor = textColor + 'E6'; // ~0.9 opacity

  const [challengeNotifications, setChallengeNotifications] = useState<NotificationItem[]>([]);
  const [greetingNotifications, setGreetingNotifications] = useState<NotificationItem[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [pendingGreetingDocIds, setPendingGreetingDocIds] = useState<string[]>([]);
  const initialLoadRef = useRef(true);

  // Equipped pet (from Users/{uid}.equippedPetId -> Users/{uid}/pets/{id})
  const [petName, setPetName] = useState<string | null>(null);
  const [petImageUrl, setPetImageUrl] = useState<string | null>(null);
  const [petEvoLevel, setPetEvoLevel] = useState<number | null>(null);
  const [petXp, setPetXp] = useState<number | null>(null);
  const [playerLevel, setPlayerLevel] = useState<number>(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setPetName(null);
      setPetImageUrl(null);
      setPetEvoLevel(null);
      setPetXp(null);
      return;
    }
    const unsubProfile = onSnapshot(doc(db, 'Users', uid), (snap) => {
      const data: any = snap.data() ?? {};
      const equippedPetId = data?.equippedPetId as string | undefined;
      const lvl = typeof data?.level === 'number' ? data.level : 0;
      setPlayerLevel(Math.max(0, lvl));
      if (!equippedPetId) {
        setPetName(null);
        setPetImageUrl(null);
        setPetEvoLevel(null);
        setPetXp(null);
        return;
      }
      // subscribe to the equipped pet doc
      const unsubPet = onSnapshot(doc(db, 'Users', uid, 'pets', equippedPetId), (petSnap) => {
        const d: any = petSnap.data() ?? {};
        const xp = typeof d?.xp === 'number' ? d.xp : 0;
        const evoLvl = Math.min(PET_MAX_LEVEL, Math.floor(xp / PET_XP_PER_LEVEL));
        const imgs: string[] = Array.isArray(d?.images)
          ? d.images.filter((u: any) => typeof u === 'string' && u.length > 0)
          : [];
        // Stage changes every evolution: Lvl 0->img0, Lvl 1->img1, Lvl 2+->img2
        const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evoLvl) : 0;
        const stageName = ['Baby', 'Big', 'King'][Math.min(2, stageIdx)] ?? 'Baby';
        const baseName = (typeof d?.name === 'string' && d.name.trim()) ? d.name : equippedPetId;
        setPetName(`${stageName} ${baseName}`);
        setPetImageUrl(imgs.length > 0 ? imgs[stageIdx] : (typeof d?.imageUrl === 'string' ? d.imageUrl : null));
        setPetEvoLevel(evoLvl);
        setPetXp(xp);
      });
      // cleanup pet sub-subscription when equippedPetId changes
      return unsubPet;
    });
    return () => {
      try { unsubProfile(); } catch {}
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY)
      .then((value) => {
        if (!mounted) return;
        const parsed = value ? Number(value) : 0;
        setLastSeen(Number.isFinite(parsed) ? parsed : 0);
      })
      .catch(() => {
        if (mounted) setLastSeen(0);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const colRef = collection(db, 'challenges');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const additions: NotificationItem[] = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        if (initialLoadRef.current) return;
        const data = change.doc.data() as Record<string, any>;
        const createdAtRaw = data?.createdAt;
        const createdAt =
          createdAtRaw?.toDate?.() ??
          (typeof createdAtRaw === 'string' ? new Date(createdAtRaw) : null) ??
          new Date();
        additions.push({
          id: change.doc.id,
          title: typeof data?.title === 'string' ? data.title : 'New Challenge',
          category:
            typeof data?.categoryId === 'string'
              ? data.categoryId
              : typeof data?.category === 'string'
                ? data.category
                : undefined,
          type: 'challenge',
          timestamp:
            createdAt instanceof Date && !Number.isNaN(createdAt.getTime())
              ? createdAt.getTime()
              : Date.now(),
          subtitle: 'New challenge available',
          meta: { challengeId: change.doc.id },
        });
      });

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }

      if (!additions.length) return;

      // Keep notifications only up to 24 hours old.
      const EXPIRY_MS = 24 * 60 * 60 * 1000;
      setChallengeNotifications((prev) => {
        const known = new Set(prev.map((item) => item.id));
        const merged: NotificationItem[] = [...prev];
        additions.forEach((item) => {
          if (!known.has(item.id)) {
            merged.unshift(item);
            known.add(item.id);
          }
        });
        const now = Date.now();
        const filtered = merged.filter((it) => now - it.timestamp <= EXPIRY_MS);
        return filtered.slice(0, 24);
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      setGreetingNotifications([]);
      setPendingGreetingDocIds([]);
      return;
    }
    const greetingsRef = collection(db, 'Users', authUser.uid, 'greetings');
    const unsubscribe = onSnapshot(
      greetingsRef,
      (snapshot) => {
        const now = Date.now();
        const activeGreetings: NotificationItem[] = [];
        const pendingDocIds: string[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          const createdAt = toMillis(data?.createdAt) || now;
          const isSeen = data?.seen === true;
          const seenAt = toMillis(data?.seenAt);
          const retentionAnchor = isSeen ? seenAt || createdAt : null;
          if (retentionAnchor !== null && now - retentionAnchor >= GREETING_RETENTION_MS) {
            return;
          }
          const senderName =
            typeof data?.senderName === 'string' && data.senderName.trim().length > 0
              ? data.senderName
              : 'A fellow adventurer';
          activeGreetings.push({
            id: `greeting:${docSnap.id}`,
            title: `${senderName} sent you a greeting`,
            type: 'greeting',
            timestamp: createdAt,
            subtitle: new Date(createdAt).toLocaleString(),
            meta: { greetingDocId: docSnap.id },
          });
          if (!isSeen) {
            pendingDocIds.push(docSnap.id);
          }
        });
        activeGreetings.sort((a, b) => b.timestamp - a.timestamp);
        setGreetingNotifications(activeGreetings);
        setPendingGreetingDocIds(pendingDocIds);
      },
      () => {
        setGreetingNotifications([]);
        setPendingGreetingDocIds([]);
      },
    );
    return () => unsubscribe();
  }, [authUser?.uid]);

  const notifications = useMemo(
    () =>
      [...challengeNotifications, ...greetingNotifications].sort(
        (a, b) => b.timestamp - a.timestamp,
      ),
    [challengeNotifications, greetingNotifications],
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.timestamp > lastSeen).length,
    [notifications, lastSeen],
  );

  const markNotificationsRead = useCallback(async () => {
    const now = Date.now();
    setLastSeen(now);
    try {
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, String(now));
    } catch {
      // ignore
    }
    if (authUser?.uid && pendingGreetingDocIds.length) {
        const updates = pendingGreetingDocIds.map((docId) =>
          updateDoc(doc(db, 'Users', authUser.uid, 'greetings', docId), {
            seen: true,
            seenAt: serverTimestamp(),
          }).catch(
            (err) => {
              // eslint-disable-next-line no-console
              console.warn('Failed to mark greeting seen', err);
          },
        ),
      );
      await Promise.all(updates);
      setPendingGreetingDocIds([]);
    }
  }, [authUser?.uid, pendingGreetingDocIds]);

  const handleOpenNotifications = useCallback(() => {
    setNotificationsVisible(true);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsVisible(false);
    markNotificationsRead();
  }, [markNotificationsRead]);

  const handleNotificationPress = useCallback(
    (notification: NotificationItem) => {
      setNotificationsVisible(false);
      markNotificationsRead();
      if (notification.type === 'challenge') {
        const challengeId =
          (notification.meta && notification.meta.challengeId) || notification.id;
        router.push({
          pathname: '/ChallengesPages/ChallengeDetails',
          params: { id: challengeId, title: notification.title },
        });
      }
    },
    [markNotificationsRead, router],
  );

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBarRow}>
          {/* Settings button ΓåÆ opens /settings */}
          <TouchableOpacity
            testID="icon-settings"
            hitSlop={16}
            accessibilityLabel="Open settings"
            onPress={() => router.push('/(tabs)/settings')}
          >
            <MaterialCommunityIcons
              name="cog-outline"
              size={28}
              color={iconColor}
            />
          </TouchableOpacity>

          <Text style={[styles.topBarTitle, { color: Colors[scheme].text }]}>Home</Text>

          {/* Notifications */}
          <TouchableOpacity
            testID="icon-bell"
            hitSlop={16}
            accessibilityLabel="Open notifications"
            onPress={handleOpenNotifications}
          >
            <View style={{ padding: 2 }}>
              <MaterialCommunityIcons name="bell-outline" size={28} color={iconColor} />
              {unreadCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* Stats card */}
        <StatsCard colorScheme={colorScheme} />

        {/* Equipped pet section */}
        <View style={[styles.body, { alignItems: 'center' }]}>
          {petImageUrl ? (
            <Image source={{ uri: petImageUrl }} style={styles.petImage} resizeMode="contain" />
          ) : null}
          {petName ? (
            <TouchableOpacity
              accessibilityLabel="Open pet inventory"
              onPress={() => router.push('/(tabs)/petinventory')}
              activeOpacity={0.85}
              style={styles.petNameBox}
            >
              <Text style={styles.petNameText}>{petName} • Lvl {playerLevel}</Text>
            </TouchableOpacity>
          ) : null}
          {petName !== null ? (
            <View style={styles.evolutionBox}>
              {(() => {
                const evo = Math.max(0, petEvoLevel ?? 0);
                const stageIdx = Math.min(2, evo);
                const displayLvl = stageIdx + 1;
                const atMaxStage = stageIdx >= 2;
                const totalXp = Math.max(0, petXp ?? 0);
                const xpInLevel = totalXp - evo * PET_XP_PER_LEVEL;
                const pct = Math.max(0, Math.min(1, xpInLevel / PET_XP_PER_LEVEL));
                return (
                  <>
                    <Text style={styles.evolutionTitle}>{atMaxStage ? 'Lvl 3 MAX!' : `Lvl ${displayLvl}`}</Text>
                    {!atMaxStage && (
                      <>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${pct * 100}%` }]} />
                        </View>
                        <View style={styles.progressLabelsRow}>
                          <Text style={styles.progressLabel}>{`Lvl ${displayLvl}`}</Text>
                          <Text style={styles.progressLabel}>{`Lvl ${displayLvl + 1}`}</Text>
                        </View>
                      </>
                    )}
                  </>
                );
              })()}
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <Modal
        transparent
        visible={notificationsVisible}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleCloseNotifications}
      >
        <Pressable style={styles.notificationsBackdrop} onPress={handleCloseNotifications}>
          <View style={styles.notificationsSheet}>
            <View style={styles.notificationsHeaderRow}>
              <View>
                <Text style={styles.notificationsTitle}>Notifications</Text>
                <Text style={styles.notificationsSubtitle}>
                  {notifications.length ? 'Tap a notification to view details' : 'No new alerts right now'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleCloseNotifications} accessibilityLabel="Close notifications">
                <MaterialCommunityIcons name="close-circle-outline" size={24} color="#0C2E16" />
              </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
              <Text style={styles.notificationsEmpty}>You're all caught up!</Text>
            ) : (
              <ScrollView
                style={{ maxHeight: 320 }}
                contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
                showsVerticalScrollIndicator={false}
              >
                {notifications.map((item) => (
                  <TouchableOpacity
                    key={`${item.id}-${item.timestamp}`}
                    style={[
                      styles.notificationItem,
                      item.timestamp > lastSeen && { backgroundColor: 'rgba(12, 46, 22, 0.18)' },
                    ]}
                    onPress={() => handleNotificationPress(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                    <Text style={styles.notificationMeta}>
                      {item.type === 'challenge'
                        ? `${item.category ? `${item.category.toUpperCase()} \u2022 ` : ''}${new Date(item.timestamp).toLocaleString()}`
                        : `Greeting \u2022 ${new Date(item.timestamp).toLocaleString()}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>
    </ImageBackground>
  );
};

export default Home;


