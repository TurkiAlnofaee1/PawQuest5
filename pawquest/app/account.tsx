import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AntDesign, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';

import { signOut, updatePlayerProfile } from '@/src/lib/auth';
import { usePlayerProfile } from '@/src/hooks/usePlayerProfile';
import type { PlayerProfile } from '@/src/hooks/usePlayerProfile';
import { XP_PER_LEVEL, calculateLevel, xpForLevel } from '@/src/lib/playerProgress';

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

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings' as any);
    }
  };

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

  const xp =
    typeof profile?.xp === 'number' && Number.isFinite(profile.xp) ? Math.max(0, profile.xp) : 0;
  const levelFromProfile =
    typeof profile?.level === 'number' && Number.isFinite(profile.level) && profile.level > 0
      ? profile.level
      : undefined;
  const level = levelFromProfile ?? calculateLevel(xp);
  const baseLevelXp = xpForLevel(level);
  const xpIntoLevel = Math.max(0, xp - baseLevelXp);
  const levelProgress = XP_PER_LEVEL > 0 ? Math.min(1, xpIntoLevel / XP_PER_LEVEL) : 0;
  const xpRemaining = Math.max(0, XP_PER_LEVEL - xpIntoLevel);
  const totalXpDisplay = xp.toLocaleString();

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
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleGoBack} style={styles.backPill}>
            <Ionicons name="chevron-back" size={22} color="#0B3D1F" />
          </Pressable>
          <Text style={styles.headerTitle}>My account</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          <View style={styles.levelCard}>
            <View style={styles.levelHeader}>
              <MaterialCommunityIcons name="trophy-variant-outline" size={18} color="#0F172A" />
              <Text style={styles.levelLabel}>Level {level}</Text>
            </View>
            <View style={styles.levelProgressBar}>
              <View
                style={[
                  styles.levelProgressFill,
                  { width: `${Math.max(6, levelProgress * 100)}%` },
                  { opacity: levelProgress > 0 ? 1 : 0.4 },
                ]}
              />
            </View>
            <Text style={styles.levelXp}>
              {Math.round(xpIntoLevel)} / {XP_PER_LEVEL} XP · {xpRemaining} XP to next
            </Text>
          </View>
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
              <InfoItem label="Level" value={`Level ${level}`} icon="trophy-outline" />
              <InfoItem label="Total XP" value={`${totalXpDisplay} XP`} icon="star-circle-outline" />
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
      </SafeAreaView>
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
  safe: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffffff',
  },
  headerSpacer: { width: 44 },
  content: {
    paddingTop: 24,
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
  levelCard: {
    marginTop: 16,
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(247,255,230,0.88)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  levelProgressBar: {
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(12, 46, 22, 0.18)',
    overflow: 'hidden',
  },
  levelProgressFill: {
    height: '100%',
    backgroundColor: '#0C2E16',
    borderRadius: 999,
  },
  levelXp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
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
