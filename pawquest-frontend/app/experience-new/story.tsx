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
  Alert,
} from 'react-native';
import TopBar from '@/components/TopBar';
import ExperienceSegment from '@/components/ExperienceSegment';
import { createStory } from '../../src/lib/experience';

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function StoryFormScreen() {
  const [storyName, setStoryName] = useState('');
  const [storyScript, setStoryScript] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    if (saving) return;

    if (!storyName.trim() || !storyScript.trim()) {
      Alert.alert('Missing info', 'Please fill Story Name and Story Script.');
      return;
    }

    try {
      setSaving(true);
      await createStory({
        storyName: storyName.trim(),
        script: storyScript.trim(),
        createdBy: 'demo', // swap with auth uid later
      });
      Alert.alert('Success', 'Story saved!');
      setStoryName('');
      setStoryScript('');
    } catch (e: any) {
      Alert.alert('Failed to save', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />
      <TopBar title="Create an experience  +" backTo="/(tabs)/settings" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Default tab is Story */}
        <ExperienceSegment current="story" />

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
          multiline
          value={storyScript}
          onChangeText={setStoryScript}
        />

        <TouchableOpacity style={[styles.submitBtn, styles.elevated]} onPress={onSubmit} disabled={saving}>
          <Text style={styles.submitText}>{saving ? 'Saving…' : 'Submit'}</Text>
        </TouchableOpacity>

        {Platform.OS === 'web' && (
          <View style={styles.webBox}>
            <Text style={{ fontWeight: '700' }}>Note:</Text>
            <Text>Some features are limited on web. Test on a device when possible.</Text>
          </View>
        )}
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
    minHeight: 140,
    textAlignVertical: 'top',
  },

  submitBtn: { marginTop: 14, backgroundColor: '#111', borderRadius: 999, alignItems: 'center', paddingVertical: 14 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: {},
  }) as object,

  webBox: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    gap: 4,
  },
});
