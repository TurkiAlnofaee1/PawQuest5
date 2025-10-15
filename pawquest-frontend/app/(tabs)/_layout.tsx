import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import {AntDesign, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarShowLabel: false, // Hide labels
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
        <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => (
      <AntDesign name="flag" size={24} color={color} />
    ),
        }}
      />

          <Tabs.Screen
      name="challenges"
      options={{
        title: 'Challenges',
        tabBarIcon: ({ color }) => 
          <MaterialCommunityIcons size={28} name="sword" color={color} 
          style={{ transform: [{ scaleX: -1 }] }}
          />
        ,
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
        tabBarIcon: ({ color }) => (
          <FontAwesome size={28} name="paw" color={color} />
        ),
      }}
    />

    <Tabs.Screen
      name="leaderboard"
      options={{
        title: 'Leaderboard',
        tabBarIcon: ({ color }) => (
          <MaterialCommunityIcons name="trophy-outline" size={28} color="white" />
        ),
      }}
    />

    </Tabs>
  );
}
