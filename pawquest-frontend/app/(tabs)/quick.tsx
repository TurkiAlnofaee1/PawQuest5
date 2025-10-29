import React from 'react';
import { ImageBackground, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function QuickChallengeDetails() {
  const router = useRouter();

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.h1}>Quick Challenge</Text>
          <Text style={styles.h2}>Start anywhere. Finish anytime.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.item}>- Tap Start to begin tracking.</Text>
          <Text style={styles.item}>- Your position and distance are recorded on the map.</Text>
          <Text style={styles.item}>- Tap Finish whenever you're done.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>XP Rules</Text>
          <Text style={styles.item}>- Every 1 km = 1000 XP.</Text>
          <Text style={styles.item}>- Partial kms don’t count (1.5 km → 1 km).</Text>
          <Text style={styles.item}>- Only your equipped pet evolves.</Text>
        </View>

        <Pressable
          onPress={() => router.push('/ChallengesPages/QuickRun')}
          style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>
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
    marginTop: 18,
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
});

