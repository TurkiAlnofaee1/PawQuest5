// app/experience-new/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function ExperienceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade", // smooth transitions between steps
      }}
    />
  );
}
