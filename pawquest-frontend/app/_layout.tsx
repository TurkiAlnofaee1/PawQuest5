import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/src/hooks/useAuth';
import { LocationProvider } from '@/src/hooks';
import Splash from '@/components/Splash';
import Entrance from '@/components/Entrance';
import { useEffect } from 'react';
// useRouter already imported above
import { Buffer } from "buffer";
global.Buffer = Buffer;
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    // If not authenticated, redirect to login.
    // Delay the replace slightly so the root Stack has a chance to mount
    // (avoids a timing race where navigation runs before screens are registered).
    if (!user) {
      const id = setTimeout(() => {
        try {
          router.replace('/login' as any);
        } catch (e) {
          // swallow and log; avoid crashing the render path
          // eslint-disable-next-line no-console
          console.warn('AuthGate: router.replace failed', e);
        }
      }, 60);
      return () => clearTimeout(id);
    }
    // else stay in app
  }, [user, initializing, router]);

  if (initializing) return <Splash />;

  return (
    <Entrance>
      {children}
    </Entrance>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Show splash while fonts load to avoid a blank black screen
    return <Splash />;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <LocationProvider>
          <AuthGate>
            <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="account"
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: '#0C2E16' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '800' },
                headerBackVisible: false,
              }}
            />
            <Stack.Screen name="experience-new" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />

            {/* Auth routes (kept in the root stack to ensure they render when redirected) */}
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/reset" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
          </AuthGate>
        </LocationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
