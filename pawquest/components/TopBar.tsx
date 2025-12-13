// components/TopBar.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  title: string;
  backTo?: Href;
};

export default function TopBar({ title, backTo }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 4, // يضمن أن السهم ما يدخل بالنوتش بدون زيادة خلفية
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => (backTo ? router.replace(backTo) : router.back())}
        style={styles.backBtn}
        accessibilityLabel="Go back"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // **بدون خلفية أبداً**
    backgroundColor: "transparent",

    paddingHorizontal: 12,
    paddingBottom: 10,

    flexDirection: "row",
    alignItems: "center",
  },

  backBtn: {
    marginRight: 6,
    padding: 6,
    borderRadius: 8,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF", // عشان يبان فوق الخلفيات الداكنة
  },
});
