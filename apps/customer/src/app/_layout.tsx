import '@/global.css';

import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppProviders } from '@/providers';
import { SplashGate } from '@/components/brand/SplashGate';
import { color } from '@/theme';

// Hold the OS splash until the JS splash has painted, so startup never flashes
// a blank frame. Fading it out is harmless because the two are the same colour.
void NativeSplash.preventAutoHideAsync().catch(() => {});
NativeSplash.setOptions({ duration: 250, fade: true });

/**
 * Root layout: mounts global styles and app-wide providers, then declares the
 * top-level navigator. Screens never mount providers themselves.
 *
 * The brand-blue splash sits above the navigator until the boot router has
 * handed off, then crossfades away (`SplashGate`).
 */
export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: splashVisible ? color.brand : color.surface }}>
      <StatusBar style={splashVisible ? 'light' : 'dark'} />
      <AppProviders>
        <KeyboardProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.surface },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            {/*
              The booking detail is a `@gorhom/bottom-sheet` that draws its own
              header, so the screen itself is a transparent modal over whatever
              opened it (the bookings list or the just-placed order).
            */}
            <Stack.Screen
              name="booking/[id]"
              options={{
                headerShown: false,
                presentation: 'transparentModal',
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
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
            {/*
              The inbox draws its own large title and close button, so the
              native header would only duplicate it.
            */}
            <Stack.Screen
              name="notifications"
              options={{
                headerShown: false,
                presentation: 'modal',
                contentStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen
              name="payment-methods"
              options={{
                headerShown: true,
                presentation: 'modal',
                title: 'Payment methods',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen
              name="help-support"
              options={{
                headerShown: true,
                presentation: 'modal',
                title: 'Help & support',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen name="address-search" />
            <Stack.Screen
              name="address-confirm"
              options={{
                headerShown: true,
                title: 'Confirm address',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen
              name="saved-addresses"
              options={{
                headerShown: true,
                presentation: 'modal',
                title: 'Manage addresses',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen
              name="account"
              options={{
                headerShown: true,
                presentation: 'modal',
                title: 'Delete account',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
              }}
            />
            <Stack.Screen
              name="account/confirm"
              options={{
                headerShown: true,
                presentation: 'modal',
                title: 'Confirm deletion',
                headerBackTitle: 'Back',
                headerTintColor: color['text-primary'],
                headerStyle: { backgroundColor: color.surface },
                gestureEnabled: false,
              }}
            />
          </Stack>
        </KeyboardProvider>
      </AppProviders>
      <SplashGate onExit={() => setSplashVisible(false)} />
    </View>
  );
}
