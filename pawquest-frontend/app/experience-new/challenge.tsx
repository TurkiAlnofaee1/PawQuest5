// app/experience-new/challenge.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';

const bgImage = require('../../assets/images/ImageBackground.jpg');

const CATEGORY_COLORS: Record<'City' | 'Mountain' | 'Desert' | 'Sea', string> = {
  City: '#9ed0ff',
  Mountain: '#ffb3b3',
  Desert: '#ffd58a',
  Sea: '#8fd2ff',
};

export default function ChallengeFormScreen() {
  // form state
  const [name, setName] = useState('');
  const [loc1, setLoc1] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState('');
  const [points, setPoints] = useState('');
  const [loc2, setLoc2] = useState('');
  const [reward, setReward] = useState('');
  const [category, setCategory] = useState<'City' | 'Mountain' | 'Desert' | 'Sea'>('City');

  return (
    <View style={styles.root}>
      {/* full-bleed background */}
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />

      {/* content */}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Segmented header: Challenge active */}
        <View style={styles.segmentWrap}>
          <View style={[styles.segmentPill, styles.segmentActive]}>
            <Text style={[styles.segmentText, styles.segmentTextActive]}>Challenge</Text>
          </View>
          <View style={[styles.segmentPill, { opacity: 0.7 }]}>
            <Text style={[styles.segmentText, { opacity: 0.7 }]}>Story</Text>
          </View>
        </View>

        <Text style={styles.formTitle}>Add Challenge</Text>

        {/* Row 1: Name | Location */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: The ride"
              placeholderTextColor="#6A6A6A"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: Al-Safaa"
              placeholderTextColor="#6A6A6A"
              value={loc1}
              onChangeText={setLoc1}
            />
          </View>
        </View>

        {/* Category chips */}
        <Text style={[styles.label, { marginTop: 6 }]}>Story Category</Text>
        <View style={styles.chipsRow}>
          {(['City', 'Mountain', 'Desert', 'Sea'] as const).map((t) => {
            const selected = category === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setCategory(t)}
                style={[
                  styles.chip,
                  { backgroundColor: CATEGORY_COLORS[t] },
                  selected && styles.chipSelected,
                ]}
                activeOpacity={0.9}
              >
                <Text style={[styles.chipText, selected && { color: '#000' }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Row 2: Script | Duration + Points */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Story Script</Text>
            <TextInput
              style={[styles.textArea, styles.elevated]}
              placeholder="Add the story"
              placeholderTextColor="#6A6A6A"
              value={script}
              onChangeText={setScript}
              multiline
            />
          </View>

          <View style={styles.col}>
            <Text style={styles.label}>Duration</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: 30 mins"
              placeholderTextColor="#6A6A6A"
              value={duration}
              onChangeText={setDuration}
            />

            <Text style={[styles.label, { marginTop: 8 }]}>Points Reward</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: 1000 pts"
              placeholderTextColor="#6A6A6A"
              value={points}
              onChangeText={setPoints}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Row 3: Location | Suggested Rewards */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Example: Al-Safaa"
              placeholderTextColor="#6A6A6A"
              value={loc2}
              onChangeText={setLoc2}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Suggested Rewards</Text>
            <TextInput
              style={[styles.input, styles.elevated]}
              placeholder="Suggest a pet"
              placeholderTextColor="#6A6A6A"
              value={reward}
              onChangeText={setReward}
            />
          </View>
        </View>

        <TouchableOpacity style={[styles.submitBtn, styles.elevated]} activeOpacity={0.9}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // layout / background
  root: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#000', // fallback behind the image
  },
  bg: {
    ...StyleSheet.absoluteFillObject, // fills the entire viewport
  },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 96, // keep submit above bottom tabs on phones/web
    rowGap: 8,
  },

  // headings
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#111', marginBottom: 12 },
  formTitle: { fontSize: 22, fontWeight: '900', color: '#1a1a1a', marginTop: 6, marginBottom: 8 },

  // segmented header
  segmentWrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: 6,
    borderRadius: 22,
    marginBottom: 8,
  },
  segmentPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(203,238,170,0.8)',
    marginRight: 8,
  },
  segmentActive: { backgroundColor: '#e8f7d0' },
  segmentText: { fontWeight: '800', color: '#294125' },
  segmentTextActive: { color: '#111' },

  // labels / inputs
  label: { fontSize: 13, fontWeight: '800', marginLeft: 10, marginBottom: 6, color: '#2c3029' },
  input: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 110,
    textAlignVertical: 'top',
  },

  // grid
  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  col: { flex: 1 },

  // chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  chip: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  chipSelected: { borderColor: '#000' },
  chipText: { fontWeight: '800', color: '#1f2722' },

  // submit
  submitBtn: {
    marginTop: 14,
    backgroundColor: '#111',
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 14,
  },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  // shadow
  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,
});
