import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { AntDesign, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';

import { IconSymbol } from '@/components/ui/IconSymbol';

// Project palette tuned to PawQuest
const PALETTE = {
  barBg: '#0C2E16', // primary dark green used across the app
  barShadow: 'rgba(202, 199, 199, 0.35)',
  iconInactive: 'rgba(255,255,255,0.75)',
  iconActive: '#FFFFFF',
  activeBubble: '#3e6d3fff', // green accent for focused tab
};

const ICON_SIZE = 35;
const HEAVY_ICON_SIZE = 34;
const LIGHT_ICON_SIZE = 28;

// Raised rounded-square behind the focused icon
const Bubble = ({ focused }: { focused: boolean }) => (
  <View
    style={{
      position: 'absolute',
      top: focused ? -2 : -8,
      width: focused ? 46 : 40,
      height: focused ? 46 : 40,
      borderRadius: 14,
      backgroundColor: focused ? PALETTE.activeBubble : 'transparent',
      shadowColor: PALETTE.barShadow,
      shadowOpacity: focused ? 0.35 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 6 },
      elevation: focused ? 6 : 0,
    }}
  />
);

// helper to render icon with the active bubble
const withBubble =
  (renderIcon: (color: string) => React.ReactNode) =>
  ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 56, height: 46 }}>
      <Bubble focused={focused} />
      {renderIcon(focused ? PALETTE.iconActive : color)}
    </View>
  );

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: PALETTE.iconActive,
        tabBarInactiveTintColor: PALETTE.iconInactive,
        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Platform.select({ ios: 18, default: 14 }),
          height: Platform.select({ ios: 72, default: 64 }),
          paddingHorizontal: 10,
          // Ensure bar is always visible even if tabBarBackground fails to render
          backgroundColor: PALETTE.barBg,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          borderRadius: 22,
          overflow: 'visible',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
          elevation: 16,
        },
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: PALETTE.barBg, borderRadius: 22 }} />
        ),

        // equal spacing for all five icons
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
          tabBarIcon: withBubble((color) => (
            <AntDesign name="flag" size={LIGHT_ICON_SIZE} color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarIcon: withBubble((color) => (
            <MaterialCommunityIcons
              size={HEAVY_ICON_SIZE}
              name="sword"
              color={color}
              style={{ transform: [{ scaleX: -1 }] }}
            />
          )),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: withBubble((color) => (
            <IconSymbol size={ICON_SIZE} name="house.fill" color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="petinventory"
        options={{
          title: 'Pets',
          tabBarIcon: withBubble((color) => (
            <FontAwesome size={HEAVY_ICON_SIZE} name="paw" color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: withBubble((color) => (
            <MaterialCommunityIcons name="trophy-outline" size={HEAVY_ICON_SIZE} color={color} />
          )),
        }}
      />

      {/* Hidden routes */}
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
      <Tabs.Screen name="ChallengesPages/ChallengeReward" options={{ href: null }} />
      <Tabs.Screen name="*" options={{ href: null }} />
    </Tabs>
  );
}
