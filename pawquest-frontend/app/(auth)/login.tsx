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
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { signInWithEmail } from '@/src/lib/auth';

const bgSource = require('../../assets/images/ImageBackground.jpg');
const logoSource = require('../../assets/images/PawquestLogo.png');

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const res = await signInWithEmail(email.trim(), password);
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
            <Text style={styles.subtitle}>Login Account</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor="rgba(15,23,42,0.45)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="username"
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="••••••••"
                placeholderTextColor="rgba(15,23,42,0.45)"
                secureTextEntry={!show}
                value={password}
                onChangeText={setPassword}
                textContentType="password"
              />
              <TouchableOpacity onPress={() => setShow((s) => !s)} style={styles.toggle}>
                <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
            </TouchableOpacity>

            <Text style={styles.helper}>
              No registered yet?{' '}
              <Text style={styles.link} onPress={() => router.push('/signup' as any)}>
                Create an account
              </Text>
            </Text>
            <Text style={[styles.helper, { marginTop: 6 }]}>
              Forgot password?{' '}
              <Text style={styles.link} onPress={() => router.push('/reset' as any)}>
                Reset password
              </Text>
            </Text>
          </View>

          <View style={styles.social}>
            <Text style={styles.socialText}>Or Continue With</Text>
            <View style={styles.socialIcons}>
              <TouchableOpacity style={styles.socialButton} accessibilityRole="button">
                <FontAwesome5 name="google" size={18} color="#EA4335" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} accessibilityRole="button">
                <FontAwesome5 name="github" size={18} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} accessibilityRole="button">
                <FontAwesome5 name="facebook" size={18} color="#1877F2" />
              </TouchableOpacity>
            </View>
          </View>
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
    backgroundColor: 'rgba(244, 255, 214, 0.75)',
    borderRadius: 26,
    padding: 20,
    gap: 4,
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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginTop: 6,
  },
  toggle: {
    position: 'absolute',
    right: 18,
    top: 18,
  },
  error: {
    marginTop: 10,
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
    marginTop: 14,
    textAlign: 'center',
    color: '#0F172A',
  },
  link: {
    color: '#2563EB',
    fontWeight: '700',
  },
  social: {
    marginTop: 36,
    alignItems: 'center',
    gap: 12,
  },
  socialText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  socialIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(15, 23, 42, 0.22)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
});
