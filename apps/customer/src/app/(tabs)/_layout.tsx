import { useState } from 'react';
import { Redirect } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui';
import { FloatingTabBar, type FloatingTabBarProps } from '@/components/navigation';
import { UnreadBadge } from '@/components/chat';
import { LoadingState } from '@/components/feedback';
import { useRealtimeSync, useSession, useUnreadMessages } from '@/hooks';
import { ActiveJobHint } from '@/components/booking/ActiveJobSheet';
import {
  ACTIVE_SHEET_GAP,
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/constants';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabBarIconProps {
  focused: boolean;
  color: ColorValue;
  size: number;
}

function tabIcon(outline: IoniconName, filled: IoniconName) {
  return function TabBarIcon({ color: tint, focused }: TabBarIconProps) {
    return <Ionicons name={focused ? filled : outline} size={24} color={tint} />;
  };
}

/** Bookings tab icon with the total unread-chat pill over its corner. */
function bookingsTabIcon(unread: number) {
  return function BookingsTabIcon({ color: tint, focused }: TabBarIconProps) {
    return (
      <View>
        <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={tint} />
        {unread > 0 ? (
          <View className="absolute -right-3 -top-2 rounded-full border-2 border-white">
            <UnreadBadge count={unread} />
          </View>
        ) : null}
      </View>
    );
  };
}

export default function TabsLayout() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep } = useSession();
  const insets = useSafeAreaInsets();

  // Realtime events (shortlist updated, status changed, payment settled)
  // invalidate the bookings cache wherever the signed-in app is mounted.
  useRealtimeSync();

  // Live unread-chat counts for the bookings tab badge and every booking card.
  // Mounted here where the signed-in surface lives so a badge anywhere updates
  // the moment the count changes on the socket (CLAUDE.md "Realtime").
  const unread = useUnreadMessages();

  // Actual on-screen pill height, so the active-order hint always docks to
  // the bar's real top edge on any device (iOS home indicator, Android nav bar).
  const [tabBarHeight, setTabBarHeight] = useState(FLOATING_TAB_BAR_HEIGHT);

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA" />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <TopTabs
        tabBar={(props: FloatingTabBarProps) => (
          <FloatingTabBar {...props} onHeight={setTabBarHeight} />
        )}
        tabBarPosition="bottom"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color['text-primary'],
          tabBarInactiveTintColor: color['text-secondary'],
          sceneStyle: { backgroundColor: color.surface },
        }}
      >
        <TopTabs.Screen
          name="home"
          options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }}
        />
        <TopTabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: tabIcon('search-outline', 'search'),
            // The field grabs the keyboard on focus, so the screen must not
            // mount before the customer asks for it.
            lazy: true,
          }}
        />
        <TopTabs.Screen
          name="bookings"
          options={{ title: 'Bookings', tabBarIcon: bookingsTabIcon(unread.total) }}
        />
        <TopTabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
        />
      </TopTabs>

      {/* Active-order hint, docked above the floating tab pill. */}
      <ActiveJobHint
        bottomOffset={tabBarHeight + insets.bottom + FLOATING_TAB_BAR_BOTTOM_GAP + ACTIVE_SHEET_GAP}
      />
    </View>
  );
}
