import { Redirect } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, type ColorValue, type TextStyle, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import { Screen, Text } from '@/components/ui';
import type { MaterialTopTabNavigationOptions } from 'expo-router/js-top-tabs';
import type { TabNavigationState } from 'expo-router/build/react-navigation/native';
import type { ParamListBase } from 'expo-router/build/react-navigation/native';
import { LoadingState } from '@/components/feedback';
import { useRealtimeSync, useSession, useUnreadMessages } from '@/hooks';
import { useIncomingOffersStore } from '@/stores';
import { initializeJobAlertService, stopJobAlertService } from '@/services/foreground-service';
import { jobNotificationService } from '@/services/job-notifications';
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

const TAB_BAR_STYLE: ViewStyle = {
  backgroundColor: color.surface,
  borderTopColor: color.border,
  height: 88,
  paddingTop: 8,
};
const TAB_LABEL_STYLE: TextStyle = { fontSize: 11, fontWeight: '600' };

/**
 * Bottom-positioned bar for the swipeable tab pager. Pager and bar stay in
 * sync because both drive the same navigator state: swiping dispatches a
 * navigate action, and pressing a tab does the same. Replaces the material
 * top-aligned bar, so the swipeable tabs keep the app's existing bottom bar.
 */
interface SwipeableTabBarProps {
  state: TabNavigationState<ParamListBase>;
  descriptors: Record<string, { options: MaterialTopTabNavigationOptions }>;
  navigation: { navigate: (routeName: string) => void };
}

function SwipeableTabBar({ state, descriptors, navigation }: SwipeableTabBarProps) {
  const pendingCount = useIncomingOffersStore((s) => Object.keys(s.offersById).length);

  return (
    <View style={TAB_BAR_STYLE} className="flex-row items-start border-t px-1">
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const active = options.tabBarActiveTintColor ?? color.brand;
        const inactive = options.tabBarInactiveTintColor ?? color['text-muted'];
        const isFocused = state.index === index;
        const tint = isFocused ? active : inactive;
        const label =
          (typeof options.tabBarLabel === 'string' ? options.tabBarLabel : undefined) ??
          options.title ??
          route.name;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={isFocused ? { selected: true } : undefined}
            accessibilityLabel={
              route.name === 'incoming-jobs' && pendingCount > 0
                ? `${label}, ${pendingCount} pending`
                : label
            }
            onPress={() => navigation.navigate(route.name)}
            className="flex-1 items-center"
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <View>
              {options.tabBarIcon?.({ focused: isFocused, color: tint })}
              {route.name === 'incoming-jobs' && pendingCount > 0 ? (
                <View className="absolute -right-2.5 -top-1.5 min-w-[18px] items-center rounded-full bg-brand px-1">
                  <Text className="text-[10px] font-bold leading-4 text-brand-contrast">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[TAB_LABEL_STYLE, { color: tint }]} className="mt-0.5">
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep } = useSession();

  // The signed-in surface of the app: keep every jobs query in step with the
  // realtime channel (offers, status changes, payments). Job-request
  // *presentation* is native (overlay/full-screen/tray), so the JS side only
  // keeps the native alert layer in step — clearing a ring the moment realtime
  // says the job was claimed — plus the foreground service that keeps the
  // online process alive for pushes.
  useRealtimeSync();

  // Live unread-chat counts for every badge across the app. Mounted here where
  // the signed-in surface lives so a badge anywhere updates the moment the
  // count changes on the socket (CLAUDE.md "Realtime").
  useUnreadMessages();

  // The foreground service mirrors the online status so a backgrounded pro
  // still receives pushes; signing out releases it even though the status store
  // is never told to go offline on logout. The job-notification service rides
  // the same signed-in lifetime for its realtime cleanup.
  useEffect(() => {
    if (isAuthenticated && isOnboardingComplete) {
      initializeJobAlertService();
      void jobNotificationService.initialize();
    } else {
      stopJobAlertService();
      jobNotificationService.cleanup();
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
    <TopTabs
      tabBar={SwipeableTabBar}
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color['text-muted'],
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <TopTabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <TopTabs.Screen
        name="incoming-jobs"
        options={{
          title: 'Requests',
          tabBarIcon: tabIcon('file-tray-full-outline', 'file-tray-full'),
        }}
      />
      <TopTabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: tabIcon('wallet-outline', 'wallet') }}
      />
      <TopTabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
      />
    </TopTabs>
  );
}
