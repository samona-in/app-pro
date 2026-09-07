import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppProviders } from '@/providers';
import { color } from '@/theme';

export default function RootLayout() {
  return (
    <AppProviders>
      <KeyboardProvider>
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
          <Stack.Screen
            name="booking/[id]"
            options={{
              headerShown: true,
              title: 'Booking',
              headerBackTitle: 'Back',
              headerTintColor: color['text-primary'],
              headerStyle: { backgroundColor: color.surface },
            }}
          />
          <Stack.Screen
            name="booking/[id]/chat"
            options={{
              headerShown: true,
              title: 'Chat',
              headerBackTitle: 'Back',
              headerTintColor: color['text-primary'],
              headerStyle: { backgroundColor: color.surface },
              contentStyle: { backgroundColor: color.surface },
            }}
          />
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
        </Stack>
      </KeyboardProvider>
    </AppProviders>
  );
}
