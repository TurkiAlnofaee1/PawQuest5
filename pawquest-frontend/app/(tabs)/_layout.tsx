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
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarShowLabel: false,
        
        tabBarStyle: Platform.select({
          ios: { position: 'absolute' },
          default: {},
        }),
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
        name="ChallengesPages/StartedChallenge"
        options={{
          title: 'Started Challenge',
          tabBarStyle: { display: 'none' },
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />
      

      <Tabs.Screen
        name="ChallengesPages/CList"
        options={{
          title: 'ChallengesClist',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />



      <Tabs.Screen
        name="ChallengesPages/CListCore"
        options={{
          title: 'CListCore',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />


      <Tabs.Screen
        name="ChallengesPages/ChallengeDetails"
        options={{
          title: 'Challenge Details',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />


      


      <Tabs.Screen
        name="ChallengesPages/MountainList"
        options={{
          title: 'Mountain Challenge',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />



      <Tabs.Screen
        name="ChallengesPages/DesertList"
        options={{
          title: 'Desert Challenge',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ChallengesPages/CityList"
        options={{
          title: 'City Challenge',
          tabBarButton: () => null,
          tabBarIcon: ({ color }) => <AntDesign name="flag" size={24} color={color} />,
        }}
      />

       <Tabs.Screen
        name="ChallengesPages/SeaList"
        options={{
          title: 'Challengeshh',
          tabBarButton: () => null, // hide it from the bottom tab bar
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

      {/* ===== Hide non-tab routes so they don't appear in the bar ===== */}
      <Tabs.Screen name="quick" options={{ href: null }} />
      <Tabs.Screen name="ChallengesPages" options={{ href: null }} />
      <Tabs.Screen name="*" options={{ href: null }} />
    </Tabs>
  );
}
