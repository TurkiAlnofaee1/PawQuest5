// app/experience-new/_layout.tsx
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

export default function ExperienceNewTabs() {
  return (
    <Tabs
      initialRouteName="challenge"
      screenOptions={{
        headerShown: false,

        // ❌ Hide Expo Router's tab bar completely
        tabBarStyle: { display: 'none' },

        // (الألوان لن تظهر لأن البار اختفى)
        tabBarActiveTintColor: '#000000ff',
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
    </Tabs>
  );
}
