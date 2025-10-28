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
import TopBar from '@/components/TopBar';
import ExperienceSegment from '@/components/ExperienceSegment'; // 👈 NEW

// ✅ Firestore helper + type
import { createChallenge, type Category } from '../../src/lib/experience';

const bgImage = require('../../assets/images/ImageBackground.jpg');

const CATEGORY_COLORS: Record<Category, string> = {
  City: '#9ed0ff',
  Mountain: '#ffb3b3',
  Desert: '#ffd58a',
  Sea: '#8fd2ff',
};

export default function ChallengeFormScreen() {
  const [name, setName] = useState('');
  const [loc1, setLoc1] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState('');
  const [points, setPoints] = useState('');
  const [reward, setReward] = useState('');
  const [category, setCategory] = useState<Category>('City');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (saving) return;
    try {
      if (!name.trim()) return alert('Please enter a Name');
      if (!script.trim()) return alert('Please add the story script');

      setSaving(true);

      await createChallenge({
        name: name.trim(),
        location: loc1.trim(),
        category,
        script: script.trim(),
        durationMinutes: Number(duration) || 0,
        pointsReward: Number(points) || 0,
        suggestedReward: reward.trim() || '',
        createdBy: 'demo',
      });

      alert('Challenge saved!');
      setName(''); setLoc1(''); setScript(''); setDuration(''); setPoints(''); setReward(''); setCategory('City');
    } catch (e: any) {
      alert(`Failed to save: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <TopBar title="Create an experience  +" backTo="/(tabs)/settings" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* 👇 Segmented control that switches pages */}
        <ExperienceSegment />

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
              keyboardType="numeric"
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

        {/* Row 3: Suggested Rewards */}
        <View style={styles.row}>
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

        <TouchableOpacity
          style={[styles.submitBtn, styles.elevated]}
          activeOpacity={0.9}
          onPress={onSubmit}
          disabled={saving}
        >
          <Text style={styles.submitText}>{saving ? 'Saving…' : 'Submit'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', alignSelf: 'stretch', backgroundColor: '#000' },
  bg: { ...StyleSheet.absoluteFillObject },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 96, rowGap: 8 },

  formTitle: { fontSize: 22, fontWeight: '900', color: '#1a1a1a', marginTop: 10, marginBottom: 10 },

  label: { fontSize: 13, fontWeight: '800', marginLeft: 10, marginBottom: 6, color: '#2c3029' },
  input: { backgroundColor: 'rgba(203,238,170,0.85)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  textArea: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 110,
    textAlignVertical: 'top',
  },

  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  col: { flex: 1 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  chip: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  chipSelected: { borderColor: '#000' },
  chipText: { fontWeight: '800', color: '#1f2722' },

  submitBtn: { marginTop: 14, backgroundColor: '#111', borderRadius: 999, alignItems: 'center', paddingVertical: 14 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,
});
