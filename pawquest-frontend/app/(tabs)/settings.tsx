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
        {/* Title */}
        <Text style={styles.title}>Settings</Text>

        {/* Cards */}
        <View style={styles.list}>
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push('/account'as any)}
          >
            <Text style={styles.cardText}>Account</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#2c3029" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push('/notifications'as any)}
          >
            <Text style={styles.cardText}>Notifications</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#2c3029" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push('/experience-new'as any)}
          >
            <Text style={styles.cardText}>Create an experience  +</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#2c3029" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 8 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
    color: '#111',
  },
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    backgroundColor: 'rgba(203, 238, 170, 0.95)', // soft leafy green
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,

    // soft shadow
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3029',
  },
});
