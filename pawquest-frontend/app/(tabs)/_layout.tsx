import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { AntDesign, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';

import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,

        // ✨ key fixes for spacing
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            height: 70,
            paddingHorizontal: 0,  // remove side padding
            marginHorizontal: 0,   // remove side margin
            borderTopWidth: 0,
          },
          default: {
            height: 60,
            paddingHorizontal: 0,
            marginHorizontal: 0,
            borderTopWidth: 0,
          },
        }),

        // make each tab take equal width so no extra gap on the right
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
    >
      {/* ===== Main 5 tabs ===== */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              size={28}
              name="sword"
              color={color}
              style={{ transform: [{ scaleX: -1 }] }}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="petinventory"
        options={{
          title: 'Pets',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="paw" color={color} />,
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="trophy-outline" size={28} color={color} />
          ),
        }}
      />

      {/* Hidden screens keep working but don't render a tab button */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="quick" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/StartedChallenge" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/CList" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/CListCore" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/ChallengeDetails" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/MountainList" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/DesertList" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/CityList" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages/SeaList" options={{ href: null }} />
      <Tabs.Screen name="*" options={{ href: null }} />
    </Tabs>
  );
}
