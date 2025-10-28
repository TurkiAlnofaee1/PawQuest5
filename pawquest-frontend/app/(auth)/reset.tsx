import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import AuthScreenShell from '@/components/AuthScreenShell';
import { sendPasswordReset } from '@/src/lib/auth';

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
    if (!res.success) {
      setMessage(res.error || 'Failed to send reset email. Try again in a moment.');
      return;
    }
    setMessage('If an account exists for that email, a reset link is on the way.');
  };

  return (
    <AuthScreenShell>
      <Text style={styles.heading}>Reset password</Text>
      <Text style={styles.subheading}>We'll email you a secure link so you can create a new password.</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email"
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset email</Text>}
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
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  subheading: {
    marginTop: 8,
    color: '#475569',
    lineHeight: 20,
  },
  form: {
    marginTop: 28,
  },
  input: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
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
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  links: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkText: {
    color: '#0C2E16',
    fontWeight: '600',
    fontSize: 14,
  },
});
