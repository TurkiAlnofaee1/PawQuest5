import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

type TabKey = 'challenge' | 'story';

export default function ExperienceSegment() {
  const router = useRouter();
  const pathname = usePathname();

  // Determine which tab is active from the current route
  const active: TabKey = pathname?.endsWith('/story') ? 'story' : 'challenge';

  const go = (k: TabKey) => {
    if (k === 'challenge') router.replace('/experience-new/challenge');
    else router.replace('/experience-new/story');
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => go('challenge')}
        style={[styles.pill, active === 'challenge' ? styles.active : styles.inactive]}
      >
        <Text style={[styles.text, active === 'challenge' ? styles.textActive : styles.textInactive]}>
          Challenge
        </Text>
      </Pressable>

      <Pressable
        onPress={() => go('story')}
        style={[styles.pill, active === 'story' ? styles.active : styles.inactive]}
      >
        <Text style={[styles.text, active === 'story' ? styles.textActive : styles.textInactive]}>
          Story
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // dark translucent rounded container (like your screenshot)
  wrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 8,
    borderRadius: 28,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
    }),
  },
  // each rounded button
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    minWidth: 160,               // 👈 makes it wide like your design
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: '#EAF6D8',  // light leaf green (selected)
  },
  inactive: {
    backgroundColor: 'rgba(234,246,216,0.6)', // faded (unselected)
  },
  text: {
    fontSize: 22,
    fontWeight: '900',
  },
  textActive: {
    color: '#000',
  },
  textInactive: {
    color: 'rgba(0,0,0,0.45)',
  },
});
