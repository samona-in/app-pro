import { View } from 'react-native';
import { Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useDeviceReadiness, useProProfile, useSession } from '@/hooks';
import { requestOverlayPermission } from '@/services/overlay-alert';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETTINGS_ROWS: { icon: IoniconName; label: string; route?: string }[] = [
  { icon: 'construct-outline', label: 'Services & skills' },
  { icon: 'time-outline', label: 'Availability' },
  { icon: 'location-outline', label: 'Service area' },
  { icon: 'document-text-outline', label: 'Documents' },
  { icon: 'notifications-outline', label: 'Job alert setup', route: '/device-setup' },
  { icon: 'card-outline', label: 'Payout details' },
  { icon: 'help-circle-outline', label: 'Help & support' },
];

function SettingsRow({ icon, label, route }: { icon: IoniconName; label: string; route?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
      onPress={() => {
        if (route) router.push(route);
      }}
    >
      <Ionicons name={icon} size={20} color={color['text-secondary']} />
      <Text variant="body" className="ml-3 flex-1">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

/**
 * Direct entry point to the Android "Display over other apps" screen for this
 * package — the one permission the native job-alert overlay depends on. The
 * current grant state re-probes whenever the app returns to the foreground, so
 * the badge updates the moment the pro comes back from granting it.
 */
function OverlayPermissionRow() {
  const { readiness } = useDeviceReadiness();
  const enabled = readiness?.overlayPermissionEnabled ?? false;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Appear on top — job-alert overlay permission"
      className="min-h-[56px] flex-row items-center px-4 py-2 active:opacity-60"
      onPress={() => void requestOverlayPermission()}
    >
      <Ionicons name="layers-outline" size={20} color={color['text-secondary']} />
      <View className="ml-3 flex-1 pr-2">
        <Text variant="body">Appear on top</Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          Lets the job-alert overlay show while the app is closed
        </Text>
      </View>
      <Badge label={enabled ? 'On' : 'Off'} tone={enabled ? 'success' : 'warning'} withDot />
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function Profile() {
  const { user, signOut } = useSession();
  const { data: proProfile } = useProProfile();

  /**
   * Supabase clears the persisted session; the tabs layout guard observes the
   * signed-out state and redirects to the auth stack, so there is no manual
   * navigation here to race it.
   */
  async function onSignOut() {
    await signOut();
  }

  return (
    <Screen scrollable>
      <View className="pt-2">
        <Text variant="titleLg">Profile</Text>
      </View>

      <Card className="mt-4 flex-row items-center">
        <Avatar
          name={user?.fullName ?? 'SAMONA Pro'}
          uri={proProfile?.avatarUrl ?? null}
          size="lg"
        />
        <View className="ml-4 flex-1">
          <Text variant="title">{user?.fullName ?? 'SAMONA Pro'}</Text>
          <Text variant="footnote" className="mt-0.5">
            {user?.phone ?? 'Profile not set up yet'}
          </Text>
          <Badge label="Verification pending" tone="warning" className="mt-2" />
        </View>
      </Card>

      <Card className="mt-4" padded={false}>
        {SETTINGS_ROWS.map((row, index) => (
          <View key={row.label}>
            {index > 0 ? <Divider /> : null}
            <SettingsRow icon={row.icon} label={row.label} route={row.route} />
          </View>
        ))}
        {Platform.OS === 'android' ? (
          <>
            <Divider />
            <OverlayPermissionRow />
          </>
        ) : null}
      </Card>

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => void onSignOut()}
        className="mt-6"
      />
    </Screen>
  );
}
