import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, ImageBackground, SafeAreaView, View, Text, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

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
});

type StatsCardProps = { colorScheme: string };

const StatsCard: React.FC<StatsCardProps> = ({ colorScheme }) => {
  const scheme = (colorScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const cardColor = scheme === 'dark' ? '#222' : '#fff';
  const textColor = Colors[scheme].text;
  const mutedColor = scheme === 'dark' ? '#aaa' : '#888';
  const dividerColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  return (
    <View testID="stats-card" style={[styles.statsCard, { backgroundColor: cardColor }]}> 
      <View style={styles.statsSegment}>
        <MaterialCommunityIcons name="fire" size={22} color={textColor} style={styles.statsIcon} />
        <View style={styles.statsTextContainer}>
          <Text testID="stats-calories" accessibilityLabel="Calories 289" style={[styles.statsValue, { color: textColor }]}>289</Text>
          <Text style={[styles.statsLabel, { color: mutedColor }]}>Calories</Text>
        </View>
      </View>
      <View style={[styles.statsDivider, { backgroundColor: dividerColor }]} />
      <View style={styles.statsSegment}>
        <MaterialCommunityIcons name="walk" size={22} color={textColor} style={styles.statsIcon} />
        <View style={styles.statsTextContainer}>
          <Text testID="stats-steps" accessibilityLabel="Steps 2244" style={[styles.statsValue, { color: textColor }]}>2244</Text>
          <Text style={[styles.statsLabel, { color: mutedColor }]}>Steps</Text>
        </View>
      </View>
      <TouchableOpacity testID="stats-chevron" style={styles.statsChevron} activeOpacity={1}>
        <MaterialCommunityIcons name="chevron-right" size={24} color={mutedColor} />
      </TouchableOpacity>
    </View>
  );
};

const bgImage = require('../../assets/images/ImageBackground.jpg');

const Home: React.FC = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const scheme = (colorScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const textColor = Colors[scheme].text;
  const iconColor = textColor + 'E6'; // ~0.9 opacity

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBarRow}>
          {/* Settings button → opens /settings */}
          <TouchableOpacity
  testID="icon-settings"
  hitSlop={16}
  accessibilityLabel="Open settings"
  onPress={() => router.push('/(tabs)/settings')}  // 👈 add this line
>
  <MaterialCommunityIcons
    name="cog-outline"
    size={28}
    color={iconColor}
  />
</TouchableOpacity>


          <Text style={[styles.topBarTitle, { color: textColor }]}>Home</Text>

          {/* Example: Notifications icon stays the same */}
          <TouchableOpacity testID="icon-bell" hitSlop={16} accessibilityLabel="Open notifications">
            <MaterialCommunityIcons
              name="bell-outline"
              size={28}
              color={iconColor}
            />
          </TouchableOpacity>
        </View>

        {/* Your stats card and body content */}
        <StatsCard colorScheme={colorScheme} />
        <View style={styles.body} />
      </SafeAreaView>
    </ImageBackground>
  );
};


export default Home;

