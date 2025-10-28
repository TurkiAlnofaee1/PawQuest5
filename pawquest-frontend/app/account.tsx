import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';

import { signOut, updatePlayerProfile } from '@/src/lib/auth';
import { usePlayerProfile } from '@/src/hooks/usePlayerProfile';
import type { PlayerProfile } from '@/src/hooks/usePlayerProfile';

const bgImage = require('../assets/images/ImageBackground.jpg');
const placeholder = require('../assets/images/PawquestLogo.png');

const activityLabels: Record<string, string> = {
  once: 'Once a week',
  two_four: '2-4 times a week',
  daily: 'Everyday',
  none: 'None',
};

type MaterialCommunityIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export default function AccountScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { profile, loading, error } = usePlayerProfile();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    displayName: '',
    activityLevel: '',
    age: '',
    weight: '',
    avatar: null as { uri: string; mimeType?: string } | null,
    avatarPreview: '',
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'My Account',
      headerStyle: { backgroundColor: '#0C2E16' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '800' },
      headerShadowVisible: false,
      headerLeft: () => (
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => {
            if ('canGoBack' in navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              router.replace('/settings' as any);
            }
          }}
        >
          <AntDesign name="arrow-left" size={18} color="#ffffff" />
          <Text style={styles.headerBackText}>Settings</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  useEffect(() => {
    if (!profile || editing) return;
    setForm({
      displayName: profile.displayName ?? '',
      activityLevel: profile.activityLevel ?? '',
      age: profile.age ? String(profile.age) : '',
      weight: profile.weight ? String(profile.weight) : '',
      avatar: null,
      avatarPreview: profile.avatarUrl ?? '',
    });
  }, [profile, editing]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to sign out', e);
    }
  };

  const startEditing = () => {
    if (!profile) return;
    setFormError(null);
    setForm({
      displayName: profile.displayName ?? '',
      activityLevel: profile.activityLevel ?? '',
      age: profile.age ? String(profile.age) : '',
      weight: profile.weight ? String(profile.weight) : '',
      avatar: null,
      avatarPreview: profile.avatarUrl ?? '',
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setFormError(null);
    setEditing(false);
    if (!profile) return;
    setForm({
      displayName: profile.displayName ?? '',
      activityLevel: profile.activityLevel ?? '',
      age: profile.age ? String(profile.age) : '',
      weight: profile.weight ? String(profile.weight) : '',
      avatar: null,
      avatarPreview: profile.avatarUrl ?? '',
    });
  };

  const pickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormError('Please allow photo access to update your avatar.');
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
        setFormError('Could not read the selected image.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        avatar: { uri: asset.uri, mimeType: asset.mimeType ?? undefined },
        avatarPreview: asset.uri,
      }));
    } catch (_e) {
      setFormError('Unable to pick an image. Try again.');
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    setFormError(null);

    const ageValue = form.age ? Number(form.age) : null;
    if (form.age && Number.isNaN(ageValue)) {
      setFormError('Age must be a number.');
      return;
    }
    const weightValue = form.weight ? Number(form.weight) : null;
    if (form.weight && Number.isNaN(weightValue)) {
      setFormError('Weight must be a number.');
      return;
    }

    setSaving(true);
    try {
      await updatePlayerProfile({
        displayName: form.displayName.trim() || null,
        age: ageValue,
        weight: weightValue,
        activityLevel: form.activityLevel || null,
        avatar: form.avatar ?? undefined,
      });
      setEditing(false);
      setForm((prev) => ({ ...prev, avatar: null }));
    } catch (e: any) {
      setFormError(e?.message ?? 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const avatarSource =
    editing && form.avatarPreview
      ? { uri: form.avatarPreview }
      : profile?.avatarUrl
        ? { uri: profile.avatarUrl }
        : placeholder;

  return (
    <ImageBackground source={bgImage} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Image source={avatarSource} style={styles.avatar} />
            {editing && (
              <TouchableOpacity style={styles.avatarEditBadge} onPress={pickAvatar}>
                <MaterialCommunityIcons name="camera-plus-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.name}>{profile?.displayName ?? 'Paw Explorer'}</Text>
          <Text style={styles.role}>{formatJoinedDate(profile?.createdAt)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile</Text>
          {loading ? (
            <ActivityIndicator color="#0C2E16" style={{ marginVertical: 16 }} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : editing ? (
            <View style={styles.editFields}>
              <View>
                <Text style={styles.editLabel}>Display name</Text>
                <TextInput
                  style={styles.input}
                  value={form.displayName}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, displayName: text }))}
                  placeholder="Your name"
                  placeholderTextColor="rgba(15,23,42,0.45)"
                />
              </View>

              <View>
                <Text style={styles.editLabel}>Activity</Text>
                <View style={styles.activityWrap}>
                  {Object.entries(activityLabels).map(([key, label]) => {
                    const active = form.activityLevel === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.activityChip, active && styles.activityChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, activityLevel: key }))}
                      >
                        <Text style={[styles.activityChipText, active && styles.activityChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.column}>
                  <Text style={styles.editLabel}>Age</Text>
                  <TextInput
                    style={styles.input}
                    value={form.age}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, age: text }))}
                    placeholder="Years"
                    placeholderTextColor="rgba(15,23,42,0.45)"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.column}>
                  <Text style={styles.editLabel}>Weight</Text>
                  <TextInput
                    style={styles.input}
                    value={form.weight}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, weight: text }))}
                    placeholder="kg"
                    placeholderTextColor="rgba(15,23,42,0.45)"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.infoGrid}>
              <InfoItem label="Email" value={profile?.email ?? 'Not set'} icon="email-outline" />
              <InfoItem label="Activity" value={activityLabels[profile?.activityLevel ?? ''] ?? 'Not set'} icon="run-fast" />
              <InfoItem label="Age" value={profile?.age ? `${profile.age} yrs` : 'Not set'} icon="cake-variant-outline" />
              <InfoItem label="Weight" value={profile?.weight ? `${profile.weight} kg` : 'Not set'} icon="scale-bathroom" />
              <InfoItem label="UID" value={profile?.uid ?? '—'} icon="identifier" />
            </View>
          )}
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
        </View>

        <View style={styles.actions}>
          {editing ? (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                    <Text style={styles.primaryText}>Save changes</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelEditing} disabled={saving}>
                <MaterialCommunityIcons name="close-circle-outline" size={18} color="#0F172A" />
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={startEditing} disabled={loading || !!error}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>Edit Profile</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={handleSignOut} disabled={saving}>
            <AntDesign name="logout" size={18} color="#0F172A" />
            <Text style={styles.secondaryText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon: MaterialCommunityIconName }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <MaterialCommunityIcons name={icon} size={20} color="#0F172A" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 46, 22, 0.25)',
  },
  content: {
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(244,255,214,0.8)',
    backgroundColor: 'rgba(12, 46, 22, 0.3)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(12, 46, 22, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(247,255,230,0.8)',
  },
  name: {
    marginTop: 18,
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  role: {
    marginTop: 6,
    color: 'rgba(247,255,230,0.82)',
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(247,255,230,0.95)',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: 'rgba(15, 23, 42, 0.25)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(175, 219, 137, 0.3)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(12, 46, 22, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    color: 'rgba(15, 23, 42, 0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  infoValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  error: {
    color: '#DC2626',
    fontWeight: '600',
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0C2E16',
    paddingVertical: 16,
    borderRadius: 20,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(247,255,230,0.9)',
    paddingVertical: 14,
    borderRadius: 20,
  },
  secondaryText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.7,
  },
  editFields: {
    gap: 18,
  },
  editLabel: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderRadius: 18,
    backgroundColor: 'rgba(175, 219, 137, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#0F172A',
  },
  activityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  activityChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(175, 219, 137, 0.22)',
  },
  activityChipActive: {
    backgroundColor: '#0C2E16',
  },
  activityChipText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 12,
  },
  activityChipTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  column: {
    flex: 1,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBackText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

function formatJoinedDate(createdAt: PlayerProfile['createdAt']) {
  if (!createdAt) return 'Joined • —';
  try {
    let date: Date | null = null;
    if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt) {
      date = (createdAt as any).toDate?.() ?? null;
    } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
      date = new Date(createdAt);
    }
    if (!date || Number.isNaN(date.getTime())) return 'Joined • —';

    const formatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' });
    return `Joined • ${formatter.format(date)}`;
  } catch (_e) {
    return 'Joined • —';
  }
}
