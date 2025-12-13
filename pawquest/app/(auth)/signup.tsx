import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { signUpWithEmail } from '@/src/lib/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$/;

const bgSource = require('../../assets/images/ImageBackground.jpg');
const logoSource = require('../../assets/images/PawquestLogo.png');

const ACTIVITY_OPTIONS = [
  { id: 'once', label: 'Once a week' },
  { id: 'two_four', label: '2-4 times a week' },
  { id: 'daily', label: 'Everyday' },
  { id: 'none', label: 'None' },
];

export default function SignupScreen() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<string | null>(ACTIVITY_OPTIONS[0].id);
  const [avatar, setAvatar] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [requestingImage, setRequestingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async () => {
    setError(null);
    try {
      setRequestingImage(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Please enable photo library access to add an avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError('Failed to read the selected image.');
        return;
      }
      setAvatar({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
    } catch (_e) {
      setError('Unable to pick image. Please try again.');
    } finally {
      setRequestingImage(false);
    }
  };

  const onSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    // Require avatar before signing up; keep button clickable and show inline error on submit
    if (!avatar?.uri) {
      setError('Please add an avatar to continue.');
      return;
    }
    
    if (!displayName.trim()) {
      setError('Please add a username.');
      return;
    }
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError('Password needs 1 uppercase letter and 1 special character.');
      return;
    }
     // Require age and weight before signing up (show inline error if missing)
    if (!age?.trim()) {
      setError('Please add your age.');
      return;
    }
    if (!weight?.trim()) {
      setError('Please add your weight.');
      return;
    }
    if (!activity) {
      setError('Please select your activity level.');
      return;
    }


    const ageValue = age ? Number(age) : null;
    const weightValue = weight ? Number(weight) : null;
    if (age && Number.isNaN(ageValue)) {
      setError('Age must be a number.');
      return;
    }
    if (weight && Number.isNaN(weightValue)) {
      setError('Weight must be a number.');
      return;
    }

    setLoading(true);
    const res = await signUpWithEmail(trimmedEmail, password, {
      displayName: displayName.trim(),
      age: ageValue ?? undefined,
      weight: weightValue ?? undefined,
      activityLevel: activity ?? undefined,
      avatar: avatar ?? undefined,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.replace('/');
  };

  return (
    <ImageBackground source={bgSource} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to</Text>
            <Text style={[styles.title, styles.titleAccent]}>PawQuest</Text>
            <Image source={logoSource} style={styles.logo} resizeMode="contain" />
            <Text style={styles.subtitle}>Create an account</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Avatar</Text>
            <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar} disabled={requestingImage}>
              {avatar?.uri ? (
                <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarPlaceholder}>{requestingImage ? 'Loading...' : 'Tap to add'}</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Your display name"
              placeholderTextColor="rgba(15,23,42,0.45)"
              value={displayName}
              onChangeText={setDisplayName}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor="rgba(15,23,42,0.45)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="rgba(15,23,42,0.45)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Age</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Years"
                  placeholderTextColor="rgba(15,23,42,0.45)"
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Weight</Text>
                <TextInput
                  style={styles.input}
                  placeholder="kg"
                  placeholderTextColor="rgba(15,23,42,0.45)"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Activity</Text>
            <View style={styles.activityWrap}>
              {ACTIVITY_OPTIONS.map((opt) => {
                const active = activity === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.activityOption, active && styles.activityActive]}
                    onPress={() => setActivity(opt.id)}
                  >
                    <Text style={[styles.activityText, active && styles.activityTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create an account</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.helper}>
            Already have an account?{' '}
            <Text style={styles.link} onPress={() => router.push('/login' as any)}>
              Sign in
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 46, 22, 0.22)',
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 80,
    paddingBottom: 40,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#121212',
  },
  titleAccent: {
    marginTop: -4,
  },
  logo: {
    width: 100,
    height: 100,
    marginVertical: 18,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#121212',
  },
  form: {
    backgroundColor: 'rgba(244, 255, 214, 0.78)',
    borderRadius: 26,
    padding: 22,
    gap: 6,
    shadowColor: 'rgba(15, 23, 42, 0.25)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  input: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(175, 219, 137, 0.65)',
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  half: {
    flex: 1,
  },
  activityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  activityOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(175, 219, 137, 0.3)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activityActive: {
    backgroundColor: '#0C2E16',
    borderColor: '#0C2E16',
  },
  activityText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 12,
  },
  activityTextActive: {
    color: '#fff',
  },
  avatarPicker: {
    marginTop: 6,
    marginBottom: 18,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(175, 219, 137, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(12, 46, 22, 0.35)',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12,
  },
  error: {
    marginTop: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
  button: {
    marginTop: 22,
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 26,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  helper: {
    marginTop: 24,
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: '600',
  },
  link: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
