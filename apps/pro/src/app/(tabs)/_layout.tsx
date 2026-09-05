import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { useEffect } from 'react';
import { LoadingState } from '@/components/feedback';
import { IncomingJobOverlay } from '@/components/jobs';
import { Screen } from '@/components/ui';
import { useJobAlert, useRealtimeSync, useSession } from '@/hooks';
import { useIncomingJobStore } from '@/stores/incoming-job';
import { jobNotificationService } from '@/services/job-notifications';
import { initializeJobAlertService, stopJobAlertService } from '@/services/foreground-service';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabBarIconProps {
  focused: boolean;
  color: ColorValue;
  size: number;
}

/** Tab icons paired as outline (inactive) / filled (active). */
function tabIcon(outline: IoniconName, filled: IoniconName) {
  return function TabBarIcon({ color: tint, focused }: TabBarIconProps) {
    return <Ionicons name={focused ? filled : outline} size={24} color={tint} />;
  };
}

export default function TabsLayout() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep } = useSession();

  // The signed-in surface of the app: keep every jobs query in step with the
  // realtime channel (offers, status changes, payments).
  useRealtimeSync();
  // Drives the incoming-job alert overlay and its looping alarm.
  useJobAlert();

  // The overlay reads directly from the store so it survives tab switches.
  const activeJob = useIncomingJobStore((state) => state.job);
  const resolution = useIncomingJobStore((state) => state.resolution);
  const pendingJobs = useIncomingJobStore((state) => state.pendingJobs);
  const resolve = useIncomingJobStore((state) => state.resolve);
  const advance = useIncomingJobStore((state) => state.advance);
  const clear = useIncomingJobStore((state) => state.clear);

  // Handle initial notification that launched the app from a killed state.
  // This runs once after authentication and onboarding are complete. The
  // signed-in surface also keeps the Android foreground service in line with
  // the online status; signing out releases it even though the status store is
  // never told to go offline on logout.
  useEffect(() => {
    if (isAuthenticated && isOnboardingComplete) {
      jobNotificationService.handleInitialNotificationIfNeeded();
      initializeJobAlertService();
    } else {
      stopJobAlertService();
    }
  }, [isAuthenticated, isOnboardingComplete]);

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA Pro" />
      </Screen>
    );
  }

  // Covers signing out and any deep link into the app while signed out. The
  // server rejects unauthenticated requests regardless; this is navigation, not
  // a security control.
  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  // A Pro without a usable profile cannot be matched to work, so the tabs would
  // be empty and confusing. Send them back to finish.
  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.brand,
          tabBarInactiveTintColor: color['text-muted'],
          tabBarStyle: {
            backgroundColor: color.surface,
            borderTopColor: color.border,
            height: 88,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          sceneStyle: { backgroundColor: color.background },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }}
        />
        <Tabs.Screen
          name="jobs"
          options={{ title: 'Jobs', tabBarIcon: tabIcon('briefcase-outline', 'briefcase') }}
        />
        <Tabs.Screen
          name="earnings"
          options={{ title: 'Earnings', tabBarIcon: tabIcon('wallet-outline', 'wallet') }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
        />
      </Tabs>

      {activeJob ? (
        <IncomingJobOverlay
          job={activeJob}
          resolution={resolution}
          queueCount={pendingJobs.length}
          onResolve={resolve}
          onAdvance={advance}
          onDismiss={clear}
        />
      ) : null}
    </>
  );
}
