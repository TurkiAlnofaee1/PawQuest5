import React from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

export default function AuthScreenShell({ children }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 24,
    shadowColor: 'rgba(15, 23, 42, 0.12)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 10,
  },
});
