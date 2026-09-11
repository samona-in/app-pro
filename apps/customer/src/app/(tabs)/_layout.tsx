import { useState } from 'react';
import { Redirect } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, type ColorValue, type TextStyle, type ViewStyle } from 'react-native';
import { Screen, Text } from '@/components/ui';
import type { MaterialTopTabNavigationOptions } from 'expo-router/js-top-tabs';
import type { TabNavigationState } from 'expo-router/build/react-navigation/native';
import type { ParamListBase } from 'expo-router/build/react-navigation/native';
import { UnreadBadge } from '@/components/chat';
import { LoadingState } from '@/components/feedback';
import { useRealtimeSync, useSession, useUnreadMessages } from '@/hooks';
import { ActiveJobHint } from '@/components/booking/ActiveJobSheet';
import { ACTIVE_SHEET_GAP, CUSTOM_TAB_BAR_HEIGHT } from '@/constants';
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
        <UnreadBadge count={unread} className="absolute -right-3 -top-1.5" />
      </View>
    );
  };
}

const TAB_BAR_STYLE: ViewStyle = {
  backgroundColor: color.surface,
  borderTopColor: color.border,
  height: CUSTOM_TAB_BAR_HEIGHT,
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
  /** Reports the rendered bar height so overlays can dock above it. */
  onHeight?: (height: number) => void;
}

function SwipeableTabBar({ state, descriptors, navigation, onHeight }: SwipeableTabBarProps) {
  return (
    <View
      style={TAB_BAR_STYLE}
      className="flex-row items-start border-t px-1"
      onLayout={(e) => onHeight?.(Math.round(e.nativeEvent.layout.height))}
    >
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
            onPress={() => navigation.navigate(route.name)}
            className="flex-1 items-center"
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            {options.tabBarIcon?.({ focused: isFocused, color: tint })}
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

  // Realtime events (shortlist updated, status changed, payment settled)
  // invalidate the bookings cache wherever the signed-in app is mounted.
  useRealtimeSync();

  // Live unread-chat counts for the bookings tab badge and every booking card.
  // Mounted here where the signed-in surface lives so a badge anywhere updates
  // the moment the count changes on the socket (CLAUDE.md "Realtime").
  const unread = useUnreadMessages();

  // Actual on-screen tab-bar height, so the active-order hint always docks to
  // the bar's real top edge on any device (iOS home indicator, Android nav bar).
  const [tabBarHeight, setTabBarHeight] = useState(CUSTOM_TAB_BAR_HEIGHT);

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
        tabBar={(props: SwipeableTabBarProps) => <SwipeableTabBar {...props} onHeight={setTabBarHeight} />}
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
          name="bookings"
          options={{ title: 'Bookings', tabBarIcon: bookingsTabIcon(unread.total) }}
        />
        <TopTabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
        />
      </TopTabs>

      {/* Active-order hint, docked above the tab bar with a small gap. */}
      <ActiveJobHint bottomOffset={tabBarHeight + ACTIVE_SHEET_GAP} />
    </View>
  );
}
