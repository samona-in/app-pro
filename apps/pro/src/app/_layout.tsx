import '@/global.css';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '@/providers';
import { SplashGate } from '@/components/brand/SplashGate';
import { initAppLanguage } from '@/i18n';
import { color } from '@/theme';

// Hold the OS splash until the JS splash has painted, so startup never flashes
// a blank frame. Fading it out is harmless because the two are the same colour.
void NativeSplash.preventAutoHideAsync().catch(() => {});
NativeSplash.setOptions({ duration: 250, fade: true });

/** Failsafe: a stuck dependency must never leave the navigator unmounted. */
const LANGUAGE_INIT_TIMEOUT_MS = 4000;

/**
 * Root layout: mounts global styles and app-wide providers, then declares the
 * top-level navigator. Screens never mount providers themselves.
 *
 * The brand-blue splash sits above the navigator until the boot router has
 * handed off, then crossfades away (`SplashGate`). The language is resolved
 * before any screen mounts so Telugu/Hindi users never see a flash of English.
 */
export default function RootLayout() {
  const { t } = useTranslation();
  const [languageReady, setLanguageReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setLanguageReady(true);
    }, LANGUAGE_INIT_TIMEOUT_MS);

    void initAppLanguage().finally(() => {
      clearTimeout(timeout);
      if (active) setLanguageReady(true);
    });

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: splashVisible ? color.brand : color.background }}>
      <StatusBar style={splashVisible ? 'light' : 'dark'} />
      {languageReady ? (
        <AppProviders>
          <KeyboardProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="choose-language" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen
                name="jobs"
                options={{
                  headerShown: true,
                  title: t('routes.jobPool'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="job-alert/[id]"
                options={{ headerShown: false, animation: 'none' }}
              />
              <Stack.Screen
                name="job/[id]/contact"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.jobActions'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="job/[id]/chat"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.chat'),
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
                  title: t('routes.notifications'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                }}
              />
              <Stack.Screen
                name="device-setup"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.jobAlertSetup'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                }}
              />
              <Stack.Screen
                name="language"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.language'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                }}
              />
              <Stack.Screen
                name="help-support"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.helpSupport'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                }}
              />
              <Stack.Screen
                name="manage-services"
                options={{
                  headerShown: true,
                  title: t('routes.manageServices'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="service-areas"
                options={{
                  headerShown: true,
                  title: t('routes.serviceArea'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="documents"
                options={{
                  headerShown: true,
                  title: t('routes.documents'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="account"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.accountDeletion'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                }}
              />
              <Stack.Screen
                name="account/confirm"
                options={{
                  headerShown: true,
                  presentation: 'modal',
                  title: t('routes.confirmDeletion'),
                  headerBackTitle: t('common.back'),
                  headerTintColor: color['text-primary'],
                  headerStyle: { backgroundColor: color.surface },
                  contentStyle: { backgroundColor: color.background },
                  gestureEnabled: false,
                }}
              />
            </Stack>
          </KeyboardProvider>
        </AppProviders>
      ) : null}
      <SplashGate onExit={() => setSplashVisible(false)} />
    </View>
  );
}
