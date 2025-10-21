// app/experience-new/story.tsx
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

// ✅ Firestore helper
import { createStory } from '../../src/lib/experience';

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function StoryFormScreen() {
  const [storyName, setStoryName] = useState('');
  const [storyScript, setStoryScript] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (saving) return;
    try {
      if (!storyName.trim()) return alert('Please enter Story Name');
      if (!storyScript.trim()) return alert('Please add the script');
      setSaving(true);

      await createStory({
        storyName: storyName.trim(),
        script: storyScript.trim(),
        createdBy: 'demo',
      });

      alert('Story saved!');
      setStoryName(''); setStoryScript('');
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

        <Text style={styles.formTitle}>Add Story</Text>

        <Text style={styles.label}>Story Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: The ride"
          placeholderTextColor="#6A6A6A"
          value={storyName}
          onChangeText={setStoryName}
        />

        <Text style={styles.label}>Story Script</Text>
        <TextInput
          style={[styles.textArea, styles.elevated]}
          placeholder="Add the story"
          placeholderTextColor="#6A6A6A"
          value={storyScript}
          onChangeText={setStoryScript}
          multiline
        />

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
  input: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  textArea: {
    backgroundColor: 'rgba(203,238,170,0.85)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 140,
    textAlignVertical: 'top',
    marginBottom: 10,
  },

  submitBtn: { marginTop: 14, backgroundColor: '#111', borderRadius: 999, alignItems: 'center', paddingVertical: 14 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,
});
