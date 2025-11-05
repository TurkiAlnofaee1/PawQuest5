import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageBackground, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, onSnapshot, query, limit } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { PET_XP_PER_LEVEL, PET_MAX_LEVEL } from '@/src/lib/playerProgress';

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function QuickChallengeDetails() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  // Equipped pet
  const [equippedPetId, setEquippedPetId] = useState<string | null>(null);
  const [equippedPet, setEquippedPet] = useState<{ id: string; name?: string | null; imageUrl?: string | null; images?: string[] | null; xp?: number | null; evoLevel?: number | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsubUser = onSnapshot(doc(db, 'Users', uid), (snap) => {
      const eq = (snap.data() as any)?.equippedPetId ?? null;
      setEquippedPetId(typeof eq === 'string' ? eq : null);
    });
    return () => unsubUser();
  }, [uid]);

  useEffect(() => {
    if (!uid || !equippedPetId) {
      setEquippedPet(null);
      return;
    }
    const unsubPet = onSnapshot(doc(db, 'Users', uid, 'pets', equippedPetId), (snap) => {
      if (!snap.exists()) return setEquippedPet(null);
      const d = snap.data() as any;
      const xp = typeof d?.xp === 'number' ? d.xp : 0;
      const evoLvl = Math.min(PET_MAX_LEVEL, Math.floor(xp / PET_XP_PER_LEVEL));
      const imgs: string[] = Array.isArray(d?.images) ? d.images.filter((u: any) => typeof u === 'string' && u.length > 0) : [];
      const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evoLvl) : 0;
      const stageName = ['Baby','Big','King'][Math.min(2, stageIdx)] ?? 'Baby';
      const baseName = (d?.name ?? 'Pet').toString();
      setEquippedPet({ id: snap.id, ...d, name: `${stageName} ${baseName}` });
    });
    return () => unsubPet();
  }, [uid, equippedPetId]);

  const levelInfo = useMemo(() => {
    if (!equippedPet) return { level: 0, progressPct: 0, remainXp: PET_XP_PER_LEVEL, atMax: false };
    const xp = typeof equippedPet.xp === 'number' ? equippedPet.xp : 0;
    const evoLevelRaw = Math.floor(xp / PET_XP_PER_LEVEL);
    const evoLevel = Math.min(PET_MAX_LEVEL, evoLevelRaw);
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
    const atMax = evoLevel >= PET_MAX_LEVEL;
    const remain = atMax ? 0 : PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL || 0);
    return { level: evoLevel, progressPct: Math.max(0, Math.min(1, progress)), remainXp: remain, atMax };
  }, [equippedPet]);

  // Stories (pick from the first challenge's stories to mirror ChallengeDetails fetching shape)
  type Story = { id: string; title: string; distanceMeters?: number; estimatedTimeMin?: number; calories?: number; hiitType?: string };
  const [stories, setStories] = useState<Story[]>([]);
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // take first challenge as the source for stories
        const q = query(collection(db, 'challenges'), limit(1));
        const challSnap = await getDocs(q);
        if (challSnap.empty) return;
        const first = challSnap.docs[0];
        const sref = collection(db, 'challenges', first.id, 'stories');
        const ssnap = await getDocs(sref);
        if (cancelled) return;
        const list: Story[] = ssnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setStories(list);
        if (list.length) setSelectedStoryId(list[0].id);
      } catch {
        // silent fail; quick mode still usable
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedStory = useMemo(() => stories.find((s) => s.id === selectedStoryId) || null, [stories, selectedStoryId]);

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.h1}>Quick Challenge</Text>
          <Text style={styles.h2}>Start anywhere. Finish anytime.</Text>
        </View>

        {/* Equipped pet summary */}
        {equippedPet ? (
          <View style={styles.petCard}>
            <View style={styles.petRow}>
              <Image
                source={(Array.isArray(equippedPet.images) && equippedPet.images.length > 0)
                  ? { uri: equippedPet.images[Math.min(equippedPet.images.length - 1, Math.min(PET_MAX_LEVEL, Math.floor((equippedPet.xp ?? 0)/PET_XP_PER_LEVEL)))] }
                  : (equippedPet.imageUrl ? { uri: equippedPet.imageUrl } : require('../../assets/images/icon.png'))}
                style={styles.petImg}
                resizeMode="contain"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.petTitle}>Equipped Pet</Text>
                <Text style={styles.petName} numberOfLines={1}>{(equippedPet.name ?? 'Pet').toString().toUpperCase()}</Text>
               {(() => { const xpNow = typeof equippedPet?.xp === 'number' ? equippedPet.xp : 0; const evo = Math.floor(xpNow / PET_XP_PER_LEVEL); const imgs = Array.isArray(equippedPet?.images) ? (equippedPet!.images as string[]).filter((u) => typeof u === 'string' && u.length > 0) : []; const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evo) : 0; const atMaxStage = stageIdx >= 2; const displayLvl = stageIdx + 1; return (<><View></View>{!atMaxStage && (<View style={styles.progressBar}><View style={[styles.progressFill, { width: `${Math.round(levelInfo.progressPct * 100)}%` }]} />
               </View>)}<Text style={styles.levelText}>{atMaxStage ? 'Lvl 3 MAX!' : 'Lvl ' + displayLvl + ' • Next in ' + levelInfo.remainXp + ' XP'} </Text></>); })()}
             </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}><Text style={styles.item}>No pet equipped yet.</Text></View>
        )}

        {/* Story picker bar (same pattern as ChallengeDetails) */}
        <Pressable onPress={() => setStoryPickerOpen(true)} style={[styles.storyBar]}>
          <Text style={styles.storyText} numberOfLines={1}>
            {selectedStory?.title ? `Story: ${selectedStory.title}` : 'Choose a Story'}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#0B3D1F" />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>- Your position and distance are recorded on the map.</Text>
          <Text style={styles.item}>- Tap Finish whenever you're done.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- You earn 1 XP for every 5 steps.</Text>
          <Text style={styles.item}>- Partial kms don’t count (1.5 km → 1 km).</Text>
          <Text style={styles.item}>- Only your equipped pet evolves.</Text>
        </View>

        <Pressable
          onPress={() => router.push('/ChallengesPages/QuickRun')}
          style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>

        {/* Story picker modal */}
        <Modal visible={storyPickerOpen} transparent animationType="fade" onRequestClose={() => setStoryPickerOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setStoryPickerOpen(false)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Choose a Story</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {stories.length === 0 ? (
                  <Text style={styles.modalEmpty}>No stories found</Text>
                ) : (
                  stories.map((s) => (
                    <Pressable
                      key={s.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setSelectedStoryId(s.id);
                        setStoryPickerOpen(false);
                      }}
                    >
                      <Text style={styles.modalItemText}>{s.title}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  h1: { fontSize: 32, fontWeight: '900', color: '#000' },
  h2: { fontSize: 16, fontWeight: '700', color: '#000', marginTop: 2 },

  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#BEE3BF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0B3D1F', marginBottom: 8 },
  item: { fontSize: 15, fontWeight: '700', color: '#0B3D1F', marginVertical: 2 },

  startBtn: {
    marginTop: 30,
    marginHorizontal: 20,
    backgroundColor: '#22C55E',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  startText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  // Equipped pet block
  petCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#BEE3BF',
  },
  petRow: { flexDirection: 'row', alignItems: 'center' },
  petImg: { width: 90, height: 90, borderRadius: 16, backgroundColor: '#ECF8F1' },
  petTitle: { color: '#0B3D1F', fontWeight: '800', fontSize: 12 },
  petName: { color: '#0B3D1F', fontWeight: '900', fontSize: 16, marginTop: 4 },
  progressBar: { marginTop: 6, height: 8, backgroundColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  levelText: { marginTop: 6, color: '#0B3D1F', fontWeight: '800' },

  // Story bar + modal
  storyBar: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#EAF8F2',
    borderWidth: 1,
    borderColor: '#C9F0E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storyText: { fontSize: 16, fontWeight: '900', color: '#0B3D1F', flex: 1, marginRight: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: 'white', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0B3D1F', marginBottom: 10 },
  modalEmpty: { fontSize: 13, color: '#4B5563', paddingVertical: 10 },
  modalItem: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  modalItemText: { fontSize: 15, fontWeight: '800', color: '#0B3D1F' },
});


