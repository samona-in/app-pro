import '@/global.css';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '@/providers';
import { initAppLanguage } from '@/i18n';
import { color } from '@/theme';

/**
 * Root layout: mounts global styles and app-wide providers, then declares the
 * top-level navigator. Screens never mount providers themselves.
 */
export default function RootLayout() {
  const { t } = useTranslation();
  const [languageReady, setLanguageReady] = useState(false);

  // Resolve the language before any screen mounts so Telugu/Hindi users never
  // see a flash of English. A SecureStore read takes milliseconds.
  useEffect(() => {
    let active = true;
    void initAppLanguage().finally(() => {
      if (active) setLanguageReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!languageReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.background,
        }}
      >
        <ActivityIndicator size="large" color={color.brand} />
      </View>
    );
  }

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
          <Stack.Screen name="job-alert/[id]" options={{ headerShown: false, animation: 'none' }} />
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
        </Stack>
      </KeyboardProvider>
    </AppProviders>
  );
}
