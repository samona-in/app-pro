import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { UnreadBadge } from '@/components/chat';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useRealtimeSync, useSession, useUnreadMessages } from '@/hooks';
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

export default function TabsLayout() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep } = useSession();

  // Realtime events (shortlist updated, status changed, payment settled)
  // invalidate the bookings cache wherever the signed-in app is mounted.
  useRealtimeSync();

  // Live unread-chat counts for the bookings tab badge and every booking card.
  // Mounted here where the signed-in surface lives so a badge anywhere updates
  // the moment the count changes on the socket (CLAUDE.md "Realtime").
  const unread = useUnreadMessages();

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
        name="bookings"
        options={{ title: 'Bookings', tabBarIcon: bookingsTabIcon(unread.total) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
      />
    </Tabs>
  );
}
