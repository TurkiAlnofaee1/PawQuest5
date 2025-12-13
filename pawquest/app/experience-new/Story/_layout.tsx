import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function StoryLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#22c55e",
        tabBarInactiveTintColor: "#ccc",
        tabBarStyle: { backgroundColor: "#000" },
      }}
    >
      <Tabs.Screen
        name="StoryFormScreen"
        options={{
          title: "Creation",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="story-audio"
        options={{
          title: "Audio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-storied"
        options={{
          title: "My Stories",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
