import { View } from 'react-native';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useSession } from '@/hooks';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETTINGS_ROWS: { icon: IoniconName; label: string }[] = [
  { icon: 'construct-outline', label: 'Services & skills' },
  { icon: 'time-outline', label: 'Availability' },
  { icon: 'location-outline', label: 'Service area' },
  { icon: 'document-text-outline', label: 'Documents' },
  { icon: 'card-outline', label: 'Payout details' },
  { icon: 'help-circle-outline', label: 'Help & support' },
];

function SettingsRow({ icon, label }: { icon: IoniconName; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
    >
      <Ionicons name={icon} size={20} color={color['text-secondary']} />
      <Text variant="body" className="ml-3 flex-1">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function Profile() {
  const { user, signOut } = useSession();

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
        <Avatar name={user?.fullName ?? 'SAMONA Pro'} uri={user?.avatarUrl} size="lg" />
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
            <SettingsRow icon={row.icon} label={row.label} />
          </View>
        ))}
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
