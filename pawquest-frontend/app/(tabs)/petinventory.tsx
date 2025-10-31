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
import { PET_XP_PER_LEVEL } from '@/src/lib/playerProgress';

type PetDoc = {
  id: string;
  petId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
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
  const sortedPets = useMemo(() => {
    if (!equippedPetId) return pets;
    return [...pets].sort((a, b) => (a.id === equippedPetId ? -1 : b.id === equippedPetId ? 1 : 0));
  }, [pets, equippedPetId]);

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
    const equipped = item.id === equippedPetId;
    const xp = typeof item.xp === 'number' ? item.xp : 0;
    const evoLevel = typeof item.evoLevel === 'number' ? item.evoLevel : Math.floor(xp / PET_XP_PER_LEVEL);
    const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;
    return (
      <Pressable style={[styles.card, equipped && styles.cardEquipped]} onPress={() => onSelectPet(item.id)}>        
        <Image
          source={item.imageUrl ? { uri: item.imageUrl } : require('../../assets/images/icon.png')}
          style={styles.petImg}
          resizeMode="contain"
        />
        <View style={styles.cardHeader}>
          <Text style={styles.petName} numberOfLines={1}>
            {(item.name ?? item.petId ?? 'Pet').toString().toUpperCase()}
          </Text>
        </View>
        <Text style={styles.levelText}>Lvl {evoLevel}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
        </View>
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
  title: { fontSize: 28, fontWeight: '900', color: '#000000' },
  subTitle: { fontSize: 14, color: '#000000', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    flex: 1,
    backgroundColor: '#BEE3BF',
    margin: 8,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardEquipped: { borderWidth: 2, borderColor: '#10B981' },
  petImg: { width: '100%', height: 90, alignSelf: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  petName: { flexShrink: 1, fontWeight: '800', fontSize: 14, color: '#0B3D1F' },
  levelText: { marginTop: 6, fontWeight: '700', color: '#0B3D1F' },
  progressBar: {
    marginTop: 6,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
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
  const evoLevel = typeof pet.evoLevel === 'number' ? pet.evoLevel : Math.floor(xp / PET_XP_PER_LEVEL);
  const progress = (xp % PET_XP_PER_LEVEL) / PET_XP_PER_LEVEL;

  return (
    <View style={featuredStyles.wrapper}>
      {/* Big highlighted card for the featured pet */}
      <View style={featuredStyles.heroCard}>
        <Image
          source={pet.imageUrl ? { uri: pet.imageUrl } : require('../../assets/images/icon.png')}
          style={featuredStyles.image}
          resizeMode="contain"
        />
        <View style={featuredStyles.nameRow}>
          <Text style={featuredStyles.nameText}>{(pet.name ?? pet.petId ?? 'Pet').toString().toUpperCase()}</Text>
          {!equipped && <Ionicons name="brush" size={16} color="#374151" style={{ marginLeft: 6 }} />}
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

      {/* Evolution progress in its own card */}
      <View style={featuredStyles.evoCard}>
        <View style={featuredStyles.evoRow}>
          <Text style={featuredStyles.evoLabel}>Evolution Level</Text>
          <Text style={featuredStyles.evoValue}>Lvl {evoLevel}</Text>
        </View>
        <View style={featuredStyles.progressBar}>
          <View style={[featuredStyles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
        </View>
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
    backgroundColor: '#BEE3BF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  image: { width: 200, height: 200 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  nameText: { fontSize: 20, fontWeight: '900', color: '#000' },
  actions: { marginTop: 10 },
  equipBtn: { backgroundColor: '#BEE3BF', borderWidth: 2, borderColor: '#10B981', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  equipText: { color: '#064E3B', fontWeight: '900' },
  equippedBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  equippedText: { color: '#065F46', fontWeight: '900' },

  evoCard: {
    backgroundColor: '#BEE3BF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  evoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  evoLabel: { color: '#000', fontWeight: '700' },
  evoValue: { color: '#000', fontWeight: '900' },
  progressBar: { marginTop: 8, height: 10, backgroundColor: '#E5E7EB', borderRadius: 10, width: '100%', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
});
