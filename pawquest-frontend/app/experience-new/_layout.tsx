// app/experience-new/_layout.tsx
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

export default function ExperienceNewTabs() {
  return (
    <Tabs
      initialRouteName="story"
      screenOptions={{
        // ❌ Hide Expo Router's built-in header completely
        headerShown: false,

        // ✅ Custom tab bar styling (keep this)
        tabBarStyle: { backgroundColor: '#cbeeaa', height: 64 },
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#294125',
        tabBarLabelStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Screen
        name="challenge"
        options={{
          title: 'Challenge',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="flag-checkered"
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="story"
        options={{
          title: 'Story',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="book-open-page-variant"
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
