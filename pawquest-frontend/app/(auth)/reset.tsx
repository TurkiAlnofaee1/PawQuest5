import React, { useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { sendPasswordReset } from '@/src/lib/auth';

const bgSource = require('../../assets/images/ImageBackground.jpg');

export default function ResetScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async () => {
    setMessage(null);
    if (!email) {
      setMessage('Enter the email associated with your account.');
      return;
    }
    setLoading(true);
    const res = await sendPasswordReset(email.trim());
    setLoading(false);
    Alert.alert(
      'Check your inbox',
      "If an account exists, you’ll get a reset link.",
    );
    if (!res.ok && res.error) {
      // Optionally surface a small non-blocking note for dev/testing
      setMessage(res.error);
    }
  };

  return (
    <ImageBackground source={bgSource} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.heading}>Reset Password</Text>
          <Text style={styles.subheading}>
            We'll email you a secure link so you can create a new password.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(15,23,42,0.45)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel="Email"
            />

            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Text style={styles.hint}>If you signed up with Google or Apple, password reset isn’t available.</Text>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send reset email</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.links}>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/login' as any)}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/signup' as any)}>
              <Text style={styles.linkText}>Need an account? Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12, 46, 22, 0.22)' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 40 },
  card: {
    backgroundColor: 'rgba(244, 255, 214, 0.85)',
    borderRadius: 26,
    padding: 20,
    shadowColor: 'rgba(15, 23, 42, 0.25)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 6,
  },
  heading: { fontSize: 28, fontWeight: '900', color: '#121212' },
  subheading: { marginTop: 8, color: '#0F172A', opacity: 0.8, lineHeight: 20 },
  form: { marginTop: 18 },
  input: {
    width: '100%',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(175, 219, 137, 0.65)',
    color: '#0F172A',
    marginBottom: 16,
  },
  message: {
    color: '#0F172A',
    backgroundColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  button: {
    marginTop: 4,
    backgroundColor: '#0C2E16',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.75 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  links: { marginTop: 18, alignItems: 'center' },
  linkButton: { paddingVertical: 6 },
  linkText: { color: '#0C2E16', fontWeight: '600', fontSize: 14 },
});
