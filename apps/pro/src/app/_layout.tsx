import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers';
import { color } from '@/theme';

/**
 * Root layout: mounts global styles and app-wide providers, then declares the
 * top-level navigator. Screens never mount providers themselves.
 */
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="job-alert/[id]" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            presentation: 'modal',
            title: 'Notifications',
            headerTintColor: color['text-primary'],
            headerStyle: { backgroundColor: color.surface },
          }}
        />
        <Stack.Screen
          name="device-setup"
          options={{
            headerShown: true,
            presentation: 'modal',
            title: 'Job alert setup',
            headerBackTitle: 'Back',
            headerTintColor: color['text-primary'],
            headerStyle: { backgroundColor: color.surface },
          }}
        />
      </Stack>
    </AppProviders>
  );
}
