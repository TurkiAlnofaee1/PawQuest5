import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';

const bgImage = require('../../assets/images/ImageBackground.jpg');

const CATEGORY_COLORS: Record<string, string> = {
  City: '#9ed0ff',
  Mountain: '#ffb3b3',
  Desert: '#ffd58a',
  Sea: '#8fd2ff',
};

interface Challenge {
  id: string;
  name: string;
  location: string;
  category: string;
  script: string;
  duration: string;
  pointsReward: number;
  suggestedReward: string;
  isActive: boolean;
  difficulty?: string;
  createdAt: any;
}

export default function ChallengesScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [testChallenge, setTestChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    loadChallenges();
    loadSpecificTestChallenge();
  }, []);

  // Load all challenges from Firebase
  const loadChallenges = async () => {
    try {
      console.log('🔄 Fetching challenges from Firebase...');
      const challengesRef = collection(db, 'challenges');
      const querySnapshot = await getDocs(challengesRef);
      
      const challengesList: Challenge[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        challengesList.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Challenge);
      });
      
      setChallenges(challengesList);
      console.log('✅ Loaded', challengesList.length, 'challenges from Firebase');
    } catch (error) {
      console.error('❌ Error loading challenges:', error);
      Alert.alert('Error', 'Failed to load challenges from Firebase');
    } finally {
      setLoading(false);
    }
  };

  // Load the specific test challenge by ID
  const loadSpecificTestChallenge = async () => {
    try {
      console.log('🔄 Fetching test challenge FGtYx7ZaLCx8uJ2OjUtK...');
      const docRef = doc(db, 'challenges', 'FGtYx7ZaLCx8uJ2OjUtK');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const challenge: Challenge = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Challenge;
        setTestChallenge(challenge);
        console.log('✅ Test challenge loaded:', challenge);
      } else {
        console.log('❌ Test challenge not found');
      }
    } catch (error) {
      console.error('❌ Error loading test challenge:', error);
    }
  };

  const ChallengeCard = ({ challenge }: { challenge: Challenge }) => (
    <TouchableOpacity style={styles.challengeCard} activeOpacity={0.8}>
      <View style={styles.challengeHeader}>
        <View style={styles.challengeTitleRow}>
          <Text style={styles.challengeName}>{challenge.name}</Text>
          <Text style={styles.challengeId}>#{challenge.id.slice(-6)}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[challenge.category] || '#e0e0e0' }]}>
          <Text style={styles.categoryBadgeText}>{challenge.category}</Text>
        </View>
      </View>

      <View style={styles.challengeInfo}>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="map-marker" size={16} color="#666" />
          <Text style={styles.infoText}>{challenge.location}</Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="clock" size={16} color="#666" />
          <Text style={styles.infoText}>{challenge.duration}</Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="star" size={16} color="#FFD700" />
          <Text style={styles.infoText}>{challenge.pointsReward} pts</Text>
        </View>
      </View>

      <Text style={styles.challengeScript} numberOfLines={2}>
        {challenge.script}
      </Text>

      <View style={styles.challengeFooter}>
        <Text style={styles.rewardText}>🎁 {challenge.suggestedReward}</Text>
        <Text style={styles.dateText}>
          {challenge.createdAt.toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading challenges from Firebase...</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Firebase Challenges</Text>
        
        {/* Test Challenge Section */}
        {testChallenge && (
          <View style={styles.testSection}>
            <Text style={styles.sectionTitle}>🧪 Test Challenge (ID: FGtYx7ZaLCx8uJ2OjUtK)</Text>
            <ChallengeCard challenge={testChallenge} />
          </View>
        )}

        {/* All Challenges Section */}
        <Text style={styles.sectionTitle}>📋 All Challenges ({challenges.length})</Text>
        
        <ScrollView style={styles.challengeList} showsVerticalScrollIndicator={false}>
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </ScrollView>

        {challenges.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No challenges found in Firebase</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={loadChallenges}>
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
    color: '#111',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
  },
  testSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  challengeList: {
    flex: 1,
  },
  challengeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  challengeTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  challengeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  challengeId: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  challengeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  challengeScript: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  challengeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  dateText: {
    fontSize: 10,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});