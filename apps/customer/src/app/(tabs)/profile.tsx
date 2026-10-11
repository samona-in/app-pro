import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Badge, Button, Screen, Text } from '@/components/ui';
import { useCustomerProfile, useSession, useUploadAvatar } from '@/hooks';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETTINGS_ROWS: { icon: IoniconName; label: string; onPress?: () => void }[] = [
  {
    icon: 'location-outline',
    label: 'Manage addresses',
    onPress: () => router.push('/saved-addresses'),
  },
  {
    icon: 'card-outline',
    label: 'Payment methods',
    onPress: () => router.push('/payment-methods'),
  },
  {
    icon: 'notifications-outline',
    label: 'Notification settings',
    onPress: () => void Linking.openSettings(),
  },
  {
    icon: 'help-circle-outline',
    label: 'Help & support',
    onPress: () => router.push('/help-support'),
  },
];

function SettingsRow({
  icon,
  label,
  last,
  destructive,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  last?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      className="bg-background py-1.5 active:opacity-70"
    >
      <View className="flex-row items-center">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
          <Ionicons
            name={icon}
            size={18}
            color={destructive ? color.danger : color['text-secondary']}
          />
        </View>
        <Text variant="body" className={`ml-3 flex-1${destructive ? ' text-danger' : ''}`}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
      </View>
      {!last ? <View className="my-1.5 -mx-5 h-px bg-border" /> : null}
    </Pressable>
  );
}

export default function Profile() {
  const { user, signOut } = useSession();
  const { data: profile } = useCustomerProfile();
  const uploadAvatar = useUploadAvatar();
  const [uploadSource, setUploadSource] = useState<string | null>(null);

  const displayName = profile?.displayName ?? user?.fullName ?? 'SAMONA Customer';
  const avatarUrl = profile?.avatarUrl ?? null;
  const uploading = uploadSource !== null || uploadAvatar.isPending;

  // Preview the freshly picked photo while it uploads; each upload records a
  // brand-new object URL server-side, so afterwards the stored URL replaced
  // the preview without any cache-busting.
  function shownAvatarUri(): string | null {
    return uploadSource ?? avatarUrl ?? null;
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setUploadSource(asset.uri);
    uploadAvatar.mutate(
      { localUri: asset.uri, mimeType: asset.mimeType },
      {
        onSuccess: () => {
          setUploadSource(null);
        },
        onError: () => {
          setUploadSource(null);
          Alert.alert('Could not update photo', 'The photo did not upload. Please try again.');
        },
      },
    );
  }

  function onSignOut() {
    Alert.alert('Sign out?', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen scrollable>
      <View className="pt-2">
        <Text variant="titleLg">Profile</Text>
      </View>

      <View className="-mx-5 mt-2 bg-surface-muted px-5 py-4">
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            accessibilityState={{ disabled: uploading, busy: uploading }}
            disabled={uploading}
            onPress={() => void pickAvatar()}
            className="active:opacity-70"
          >
            <View className="relative">
              <Avatar name={displayName} uri={shownAvatarUri()} size="lg" />
              {uploading ? (
                <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
                  <ActivityIndicator size="small" color="#ffffff" />
                </View>
              ) : (
                <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-brand">
                  <Ionicons name="camera" size={13} color={color['brand-contrast']} />
                </View>
              )}
            </View>
          </Pressable>
          <View className="ml-4 flex-1">
            <Text variant="title">{displayName}</Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {user?.phone ?? 'Profile not set up yet'}
            </Text>
            <Badge label="Verified" tone="success" className="mt-2" />
          </View>
        </View>
      </View>

      <View className="mt-6">
        {SETTINGS_ROWS.map((row) => (
          <SettingsRow
            key={row.label}
            icon={row.icon}
            label={row.label}
            onPress={row.onPress}
          />
        ))}
      </View>

      <View>
        <SettingsRow
          icon="trash-outline"
          label="Delete account"
          destructive
          last
          onPress={() => router.push('/account')}
        />
      </View>

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => void onSignOut()}
        className="mt-6"
      />
    </Screen>
  );
}
