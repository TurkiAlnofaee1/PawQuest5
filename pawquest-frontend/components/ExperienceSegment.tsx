import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

type Segment = 'challenge' | 'story';

type Props = {
  current: Segment; // required: tells the component which pill is active
};

export default function ExperienceSegment({ current }: Props) {
  const router = useRouter();
  const go = (seg: Segment) => {
    if (seg === 'challenge') router.replace('/experience-new/challenge');
    else router.replace('/experience-new/story');
  };

  return (
    <View style={styles.frame}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => go('challenge')}
        style={[styles.pill, current === 'challenge' ? styles.active : styles.inactive]}
      >
        <Text style={[styles.pillText, current === 'challenge' ? styles.textActive : styles.textInactive]}>
          Challenge
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => go('story')}
        style={[styles.pill, current === 'story' ? styles.active : styles.inactive]}
      >
        <Text style={[styles.pillText, current === 'story' ? styles.textActive : styles.textInactive]}>
          Story
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Bigger container like your mock (rounded bar behind the two pills)
  frame: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 8,             // thicker border area around pills
    borderRadius: 28,       // larger radius to match screenshot
    marginBottom: 12,
  },
  // Bigger pills
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    marginRight: 10,
    minWidth: 120,          // makes each pill wider (like your image)
    alignItems: 'center',
  },
  active: { backgroundColor: '#EAF7D6' },
  inactive: { backgroundColor: 'rgba(203,238,170,0.65)' },

  pillText: { fontWeight: '900', fontSize: 18 },
  textActive: { color: '#111' },
  textInactive: { color: '#627360' },
});
