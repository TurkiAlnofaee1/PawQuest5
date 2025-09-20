// app/experience-new/_layout.tsx
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ExperienceNewTabs() {
  return (
    <Tabs
      initialRouteName="story"
      screenOptions={{
        // Custom header title
        headerTitle: 'Create an experiance  +',
        headerTitleStyle: { fontWeight: '900', fontSize: 18 },
        headerStyle: { backgroundColor: '#cbeeaa' }, // optional, match leafy vibe
        headerTintColor: '#000',
        headerShadowVisible: false,

        // Tab bar styling
        tabBarStyle: { backgroundColor: '#cbeeaa', height: 52 },
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
            <MaterialCommunityIcons name="flag-checkered" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="story"
        options={{
          title: 'Story',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="book-open-page-variant" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
