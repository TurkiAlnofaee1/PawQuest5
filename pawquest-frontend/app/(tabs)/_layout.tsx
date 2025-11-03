import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { AntDesign, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { IconSymbol } from '@/components/ui/IconSymbol';

// 🎨 palette tuned to your screenshot
const PALETTE = {
  barBgStart: '#F8F8F8', // lighter center glow
  barBgEnd: '#66b133ff', // darker edge to blend with background
  
  shadow: 'rgba(59, 235, 5, 0.35)', // green-tinted shadow
  iconActive: '#4CAF50', // golden-brown icons (active)
  iconInactive: '#555555', // softened version for inactive
  indicator: '#4CAF50', // golden indicator under active tab
};

// little pill under the focused icon
const Indicator = ({ focused }: { focused: boolean }) => (
  <View
    style={{
      height: 4,
      width: 28,
      borderRadius: 999,
      marginTop: 6,
      backgroundColor: PALETTE.indicator,
      opacity: focused ? 1 : 0,
    }}
  />
);

const ICON_SIZE = 35;
const HEAVY_ICON_SIZE = 34;
const LIGHT_ICON_SIZE = 28;

// helper to render icon + indicator stacked
const withIndicator =
  (renderIcon: (color: string) => React.ReactNode) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {renderIcon(color)}
        <Indicator focused={focused} />
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
          left: 0,
          right: 0,
          bottom: 0,
          height: Platform.select({ ios: 76, default: 64 }),
          paddingHorizontal: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          borderRadius: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1.5,
          borderColor: PALETTE.outline,
          overflow: 'hidden',
          // soft shadow that keeps depth without harsh edges
          shadowColor: PALETTE.shadow,
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={[PALETTE.barBgStart, PALETTE.barBgEnd]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          />
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
          tabBarIcon: withIndicator((color) => (
            <AntDesign name="flag" size={LIGHT_ICON_SIZE} color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarIcon: withIndicator((color) => (
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
          tabBarIcon: withIndicator((color) => (
            <IconSymbol size={ICON_SIZE} name="house.fill" color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="petinventory"
        options={{
          title: 'Pets',
          tabBarIcon: withIndicator((color) => (
            <FontAwesome size={HEAVY_ICON_SIZE} name="paw" color={color} />
          )),
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: withIndicator((color) => (
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
