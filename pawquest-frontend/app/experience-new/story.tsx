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

const bgImage = require('../../assets/images/ImageBackground.jpg');

export default function StoryFormScreen() {
  const [storyName, setStoryName] = useState('');
  const [storyScript, setStoryScript] = useState('');

  return (
    <View style={styles.root}>
      {/* Full-bleed background */}
      <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Segmented header: Story active */}
        <View style={styles.segmentWrap}>
          <View style={[styles.segmentPill, { opacity: 0.7 }]}>
            <Text style={[styles.segmentText, { opacity: 0.7 }]}>Challenge</Text>
          </View>
          <View style={[styles.segmentPill, styles.segmentActive]}>
            <Text style={[styles.segmentText, styles.segmentTextActive]}>Story</Text>
          </View>
        </View>

        <Text style={styles.formTitle}>Add Story</Text>

        {/* Story Name */}
        <Text style={styles.label}>Story Name</Text>
        <TextInput
          style={[styles.input, styles.elevated]}
          placeholder="Example: The ride"
          placeholderTextColor="#6A6A6A"
          value={storyName}
          onChangeText={setStoryName}
        />

        {/* Story Script */}
        <Text style={styles.label}>Story Script</Text>
        <TextInput
          style={[styles.textArea, styles.elevated]}
          placeholder="Add the story"
          placeholderTextColor="#6A6A6A"
          value={storyScript}
          onChangeText={setStoryScript}
          multiline
        />

        {/* Submit button */}
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
    ...StyleSheet.absoluteFillObject,
  },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 96, // keep Submit above bottom tabs
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
