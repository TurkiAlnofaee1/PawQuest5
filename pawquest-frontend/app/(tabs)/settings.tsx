// app/(tabs)/settings.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// NOTE: settings.tsx is inside app/(tabs)/, so we go up TWO levels to assets
const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.h1}>Settings</Text>
        </View>

        {/* Cards */}
        <View style={styles.list}>
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push('/account'as any)}
          >
            <Text style={styles.cardText}>Account</Text>
            <MaterialCommunityIcons name="chevron-right" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push('/experience-new'as any)}
          >
            <Text style={styles.cardText}>Create an experience  +</Text>
            <MaterialCommunityIcons name="chevron-right" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'ios' ? 10 : 6 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  h1: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
  list: { gap: 14, paddingHorizontal: 12, paddingTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    backgroundColor: 'rgba(12,46,22,0.28)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    height: 68,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',

    // soft shadow
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

