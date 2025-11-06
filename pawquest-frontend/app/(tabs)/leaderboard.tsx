import React, { useEffect, useMemo, useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'expo-router';

import { db } from '@/src/lib/firebase';

type Player = {
  uid: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  photoURL?: string | null;
  level?: number | null;
  xp?: number | null;
  email?: string | null;
};

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function LeaderboardScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'city' | 'country'>('city');
  const router = useRouter();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Users'), (snap) => {
      const list: Player[] = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
      // sort: level desc, xp desc as tiebreaker
      list.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.xp ?? 0) - (a.xp ?? 0));
      setPlayers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const top3 = useMemo(() => players.slice(0, 3), [players]);
  const rest = useMemo(() => players.slice(3), [players]);

  const handleOpenProfile = (playerId?: string) => {
    if (!playerId) return;
    router.push(`/PetProfile/${playerId}`);
  };

  const renderRow = ({ item }: { item: Player; index: number }) => (
    <View style={styles.row}>
      <Pressable
        onPress={() => handleOpenProfile(item.uid)}
        style={({ pressed }) => [styles.rowLeft, pressed && styles.pressed]}
      >
        <Image
          source={
            item.avatarUrl || item.photoURL
              ? { uri: (item.avatarUrl || item.photoURL) as string }
              : require('../../assets/images/icon.png')
          }
          style={styles.avatarSm}
        />
        <View style={{ maxWidth: '70%' }}>
          <Text
            style={styles.rowName}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {item.displayName ?? 'Player'}
          </Text>
        </View>
      </Pressable>
      <Text style={styles.rowScore}>{item.level ?? 0}</Text>
    </View>
  );

  return (
    <ImageBackground source={bgImage} style={{ flex: 1 }} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Leaderboard</Text>
          <View style={styles.pills}>
            <Pressable
              onPress={() => setScope('city')}
              style={[styles.pill, scope === 'city' ? styles.pillActive : styles.pillInactive]}
            >
              <Text style={[styles.pillText, scope === 'city' ? styles.pillTextActive : styles.pillTextInactive]}>Jeddah</Text>
            </Pressable>
            <Pressable
              onPress={() => setScope('country')}
              style={[styles.pill, scope === 'country' ? styles.pillActive : styles.pillInactive]}
            >
              <Text style={[styles.pillText, scope === 'country' ? styles.pillTextActive : styles.pillTextInactive]}>Saudi Arabia</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(i) => i.uid}
            renderItem={(props) => renderRow({ ...props, index: props.index })}
            ListHeaderComponent={<Podium users={top3} onOpenProfile={handleOpenProfile} />}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => (
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.28)', marginHorizontal: 12 }} />
            )}
            ListFooterComponent={<View style={{ height: 14 }} />}
            style={styles.panel}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

function Podium({ users, onOpenProfile }: { users: Player[]; onOpenProfile: (id?: string) => void }) {
  const [first, second, third] = [users[0], users[1], users[2]];
  return (
    <View style={styles.podiumWrap}>
      <View style={styles.podiumRow}>
        {/* Second */}
        <View style={[styles.podiumCol, { alignItems: 'flex-end' }]}>
          <Pressable
            onPress={() => onOpenProfile(second?.uid)}
            disabled={!second?.uid}
            style={({ pressed }) => [styles.podiumTouchable, pressed && styles.pressed]}
          >
            <Circle user={second} ringColor="#60A5FA" rank={2} size={96} />
            <View style={[styles.podiumBase, { backgroundColor: '#A7D3AA' }]}> 
              <Text
                style={styles.podiumName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {second?.displayName ?? '-'}
              </Text>
              <Text style={styles.podiumScore}>{second?.level ?? 0}</Text>
            </View>
          </Pressable>
        </View>

        {/* First */}
        <View style={[styles.podiumCol, { alignItems: 'center' }]}>          
          <MaterialCommunityIcons name="crown" size={28} color="#F59E0B" style={{ marginBottom: 6 }} />
          <Pressable
            onPress={() => onOpenProfile(first?.uid)}
            disabled={!first?.uid}
            style={({ pressed }) => [styles.podiumTouchable, pressed && styles.pressed]}
          >
            <Circle user={first} ringColor="#FBBF24" rank={1} size={116} />
            <View style={[styles.podiumBase, { backgroundColor: '#4CAF50' }]}>            
              <Text
                style={[styles.podiumName, { color: '#0B3D1F' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {first?.displayName ?? '-'}
              </Text>
              <Text style={[styles.podiumScore, { color: '#0B3D1F' }]}>{first?.level ?? 0}</Text>
            </View>
          </Pressable>
        </View>

        {/* Third */}
        <View style={[styles.podiumCol, { alignItems: 'flex-start' }]}>
          <Pressable
            onPress={() => onOpenProfile(third?.uid)}
            disabled={!third?.uid}
            style={({ pressed }) => [styles.podiumTouchable, pressed && styles.pressed]}
          >
            <Circle user={third} ringColor="#F59E0B" rank={3} size={96} />
            <View style={[styles.podiumBase, { backgroundColor: '#A7D3AA' }]}>
              <Text
                style={styles.podiumName}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {third?.displayName ?? '-'}
              </Text>
              <Text style={styles.podiumScore}>{third?.level ?? 0}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Removed divider bar under podium per request */}
    </View>
  );
}

function Circle({ user, rank, ringColor, size = 72 }: { user?: Player; rank: number; ringColor: string; size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: ringColor,
          overflow: 'hidden',
        }}
      >
        <Image
          source={
            user?.avatarUrl || user?.photoURL
              ? { uri: (user.avatarUrl || user.photoURL) as string }
              : require('../../assets/images/icon.png')
          }
          style={{ width: '100%', height: '100%' }}
        />
      </View>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 34, fontWeight: '900', color: '#ffffffff' },
  pills: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  // Selected chip: white background, dark text
  pillActive: { backgroundColor: '#FFFFFF' },
  // Unselected chip: solid green with white text
  pillInactive: { backgroundColor: '#2E7D32' },
  pillText: { fontWeight: '800' },
  pillTextActive: { color: '#0B3D1F' },
  pillTextInactive: { color: '#FFFFFF' },

  list: { paddingHorizontal: 16, paddingBottom: 30 },

  podiumWrap: { paddingHorizontal: 16, marginTop: 10 },
  podiumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  podiumCol: { flex: 1 },
  podiumBase: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 120,
  },
  podiumName: { fontWeight: '800', color: '#0B3D1F' },
  podiumScore: { fontWeight: '900', color: '#0B3D1F', fontSize: 16 },
  rankBadge: {
    marginTop: -14,
    alignSelf: 'center',
    backgroundColor: '#0B3D1F',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: '#BEE3BF',
  },
  rankText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  pressed: { opacity: 0.8 },

  panelHeader: {
    marginTop: 16,
    height: 14,
    backgroundColor: 'rgba(12, 46, 22, 0.22)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },

  panel: { marginTop: 6, marginHorizontal: 16, backgroundColor: 'rgba(12, 46, 22, 0.22)', borderRadius: 18, overflow: 'hidden' },
  row: { paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarSm: { width: 44, height: 44, borderRadius: 22 },
  rowName: { fontSize: 16, fontWeight: '900', color: '#0B3D1F' },
  rowHandle: { fontSize: 12, fontWeight: '700', color: '#2E7D32', opacity: 0.8 },
  rowScore: { fontSize: 16, fontWeight: '900', color: '#0B3D1F' },
  podiumTouchable: { alignItems: 'center' },
});
