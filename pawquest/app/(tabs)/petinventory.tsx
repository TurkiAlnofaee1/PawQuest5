import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { auth, db } from '@/src/lib/firebase';
import { PET_XP_PER_LEVEL, PET_MAX_LEVEL } from '@/src/lib/playerProgress';

type PetDoc = {
  id: string;
  petId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  xp?: number | null;
  evoLevel?: number | null;
};

export default function PetInventoryScreen() {
  const [pets, setPets] = useState<PetDoc[]>([]);
  const [equippedPetId, setEquippedPetId] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList<PetDoc>>(null);

  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    const petsRef = collection(db, 'Users', uid, 'pets');
    const unsubPets = onSnapshot(
      petsRef,
      (snap) => {
        const items: PetDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setPets(items);
        setLoading(false);
      },
      () => setLoading(false),
    );

    const unsubProfile = onSnapshot(doc(db, 'Users', uid), (docSnap) => {
      const eq = (docSnap.data() as any)?.equippedPetId ?? null;
      setEquippedPetId(typeof eq === 'string' ? eq : null);
    });

    return () => {
      unsubPets();
      unsubProfile();
    };
  }, [uid]);

  const collected = pets.length;
  const sortedPets = pets;

  const handleEquip = async (petDocId: string) => {
    if (!uid) return;
    try {
      await setDoc(doc(db, 'Users', uid), { equippedPetId: petDocId }, { merge: true });
    } catch (e) {
      // no-op; could add toast
    }
  };

  // Select default featured pet: equipped first, else first in list
  useEffect(() => {
    if (selectedPetId) return;
    if (equippedPetId) setSelectedPetId(equippedPetId);
    else if (sortedPets.length > 0) setSelectedPetId(sortedPets[0].id);
  }, [equippedPetId, sortedPets, selectedPetId]);

  const onSelectPet = (id: string) => {
    setSelectedPetId(id);
    // scroll to top to reveal hero
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const renderCard = ({ item }: { item: PetDoc }) => {
    const xp = typeof item.xp === 'number' ? item.xp : 0;
    const evoLevel = Math.min(PET_MAX_LEVEL, Math.floor(xp / PET_XP_PER_LEVEL));
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
    const imgs = Array.isArray(item.images) ? item.images.filter((u) => typeof u === 'string' && u.length > 0) : [];
    const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evoLevel) : 0;
    const stageImg = imgs.length > 0 ? imgs[stageIdx] : (item.imageUrl ?? null);
    const stageName = ['Baby','Big','King'][Math.min(2, stageIdx)] ?? 'Baby';
    const atMax = imgs.length > 0 ? stageIdx >= imgs.length - 1 : false;
    const displayLvl = stageIdx + 1;
    const remain = atMax ? 0 : PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL || 0);
    return (
      <Pressable style={[styles.card, item.id === selectedPetId && styles.cardSelected]} onPress={() => onSelectPet(item.id)}>
        <Image
          source={stageImg ? { uri: stageImg } : require('../../assets/images/icon.png')}
          style={styles.petImg}
          resizeMode="contain"
        />
        <View style={styles.cardHeader}>
          <Text style={styles.petName} numberOfLines={1}>
            {(`${stageName} ${item.name ?? item.petId ?? 'Pet'}`).toString().toUpperCase()}
          </Text>
        </View>
        <Text style={styles.levelText}>{`Lvl ${displayLvl} ${atMax ? 'MAX!' : `- Next in ${remain} XP`}`}</Text>
        {!atMax && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ImageBackground source={require('../../assets/images/ImageBackground.jpg')} style={styles.bg}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>        
          <Text style={styles.title}>Pet Inventory</Text>
          <Text style={styles.subTitle}>Pets Collected: {collected}/60</Text>
        </View>
        {loading ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={styles.list}
            data={sortedPets}
            keyExtractor={(it) => it.id}
            numColumns={2}
            renderItem={renderCard}
            ListHeaderComponent={
              <FeaturedPet
                pet={sortedPets.find(p => p.id === selectedPetId) ?? (sortedPets[0] ?? null)}
                equipped={selectedPetId === equippedPetId}
                onEquip={() => selectedPetId && handleEquip(selectedPetId)}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>No pets yet. Complete challenges to collect!</Text>}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  bg: { flex: 1, resizeMode: 'cover' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  subTitle: { fontSize: 14, color: '#FFFFFF', opacity: 0.9, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    flex: 1,
    backgroundColor: 'rgba(12,46,22,0.22)',
    margin: 8,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardSelected: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  petImg: { width: '100%', height: 90, alignSelf: 'center', backgroundColor: 'transparent' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  petName: { flexShrink: 1, fontWeight: '800', fontSize: 14, color: '#FFFFFF' },
  levelText: { marginTop: 6, fontWeight: '700', color: '#FFFFFF' },
  progressBar: {
    marginTop: 6,
    height: 8,
    backgroundColor: 'rgba(12, 46, 22, 0.18)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#0C2E16' },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40 },
});

type FeaturedProps = {
  pet: PetDoc | null | undefined;
  equipped: boolean;
  onEquip: () => void;
};

function FeaturedPet({ pet, equipped, onEquip }: FeaturedProps) {
  if (!pet) return null;
  const xp = typeof pet.xp === 'number' ? pet.xp : 0;
  const evoLevel = Math.min(PET_MAX_LEVEL, Math.floor(xp / PET_XP_PER_LEVEL));
  const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
  const imgs = Array.isArray(pet.images) ? pet.images.filter((u) => typeof u === 'string' && u.length > 0) : [];
  const stageIdx = imgs.length > 0 ? Math.min(imgs.length - 1, evoLevel) : 0;
  const stageImg = imgs.length > 0 ? imgs[stageIdx] : (pet.imageUrl ?? null);
  const stageName = ['Baby','Big','King'][Math.min(2, stageIdx)] ?? 'Baby';
  const atMax = imgs.length > 0 ? stageIdx >= imgs.length - 1 : false;
  const displayLvl = stageIdx + 1;
  const remain = atMax ? 0 : PET_XP_PER_LEVEL - (xp % PET_XP_PER_LEVEL || 0);

  return (
    <View style={featuredStyles.wrapper}>
      {/* Big highlighted card for the featured pet */}
      <View style={featuredStyles.heroCard}>
        <Image
          source={stageImg ? { uri: stageImg } : require('../../assets/images/icon.png')}
          style={featuredStyles.image}
          resizeMode="contain"
        />
        <View style={featuredStyles.nameRow}>
          <Text style={featuredStyles.nameText}>{(`${stageName} ${pet.name ?? pet.petId ?? 'Pet'}`).toString().toUpperCase()}</Text>
          {!equipped && <Ionicons name="brush" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />}
        </View>
        <View style={featuredStyles.actions}>
          {equipped ? (
            <View style={featuredStyles.equippedBadge}><Text style={featuredStyles.equippedText}>Equipped</Text></View>
          ) : (
            <Pressable onPress={onEquip} style={featuredStyles.equipBtn}>
              <Text style={featuredStyles.equipText}>Equip</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Level progress in its own card */}
      <View style={featuredStyles.evoCard}>
        <View style={featuredStyles.evoRow}>
          <Text style={featuredStyles.evoLabel}>Level</Text>
          <Text style={featuredStyles.evoValue}>{atMax ? 'Lvl 3 MAX!' : `Lvl ${displayLvl} - Next in ${remain} XP`}</Text>
        </View>
        {!atMax && (
          <View style={featuredStyles.progressBar}>
            <View style={[featuredStyles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
          </View>
        )}
      </View>
    </View>
  );
}

const featuredStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroCard: {
    backgroundColor: 'rgba(12,46,22,0.22)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  image: { width: 200, height: 200 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  nameText: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  actions: { marginTop: 10 },
  equipBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  equipText: { color: '#FFFFFF', fontWeight: '900' },
  equippedBadge: { backgroundColor: 'rgba(12,46,22,0.28)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  equippedText: { color: '#FFFFFF', fontWeight: '900' },

  evoCard: {
    backgroundColor: 'rgba(12,46,22,0.22)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  evoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  evoLabel: { color: '#FFFFFF', fontWeight: '700' },
  evoValue: { color: '#FFFFFF', fontWeight: '900' },
  progressBar: { marginTop: 8, height: 10, backgroundColor: 'rgba(12, 46, 22, 0.18)', borderRadius: 999, width: '100%', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0C2E16' },
});


