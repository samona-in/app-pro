import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Badge, Button, Screen, Text } from '@/components/ui';
import { useCustomerProfile, useSession, useUploadAvatar } from '@/hooks';
import { FLOATING_TAB_BAR_CLEARANCE } from '@/constants';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The account's age, the way the quiet header shows it: "Member since
 * 12 August 2024". Falls back to a plain line when the account has no
 * creation date to read.
 */
function memberSinceLabel(createdAt?: string | null): string {
  if (!createdAt) return 'Your SAMONA account';

  const joined = new Date(createdAt);
  if (Number.isNaN(joined.getTime())) return 'Your SAMONA account';

  return `Member since ${joined.getDate()} ${MONTH_NAMES[joined.getMonth()]} ${joined.getFullYear()}`;
}

interface SettingsRowItem {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
}

const SETTINGS_GROUPS: { label: string; rows: SettingsRowItem[] }[] = [
  {
    label: 'Account',
    rows: [
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
    ],
  },
  {
    label: 'Preferences',
    rows: [
      {
        icon: 'notifications-outline',
        label: 'Notification settings',
        onPress: () => void Linking.openSettings(),
      },
    ],
  },
  {
    label: 'More',
    rows: [
      {
        icon: 'help-circle-outline',
        label: 'Help & support',
        onPress: () => router.push('/help-support'),
      },
    ],
  },
];

/**
 * One tappable row inside a settings card.
 *
 * The icon stays bare — no tile or background — so the row reads as a quiet
 * label with a chevron, and the hairline between rows starts at the label, not
 * under the icon.
 */
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
      className="active:bg-surface-muted"
    >
      <View className="min-h-[52px] flex-row items-center px-4">
        <View className="h-5 w-5 items-center justify-center">
          <Ionicons
            name={icon}
            size={18}
            color={destructive ? color.danger : color['text-secondary']}
          />
        </View>
        <Text variant="body" className={cn('ml-3 flex-1', destructive && 'text-danger')}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
      </View>

      {!last ? <View className="ml-8 mr-4 h-px bg-border" /> : null}
    </Pressable>
  );
}

/**
 * A labelled group of rows in one rounded card, the way settings are grouped
 * on the Zomato profile: a small uppercase label above a white bordered card.
 */
function SettingsSection({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={className}>
      {label ? (
        <Text variant="label" className="mb-2">
          {label}
        </Text>
      ) : null}

      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {children}
      </View>
    </View>
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
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
    <Screen scrollable padded={false} contentClassName="px-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View className="pt-4">
        <Text variant="titleLg">Profile</Text>
        <Text variant="footnote" className="mt-1">
          {memberSinceLabel(user?.createdAt)}
        </Text>
      </View>

      {/* ── Identity card ───────────────────────────────────────────────── */}
      <View className="mt-5 flex-row items-center rounded-2xl border border-border bg-surface p-4">
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
              <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-brand">
                <Ionicons name="camera" size={13} color={color['brand-contrast']} />
              </View>
            )}
          </View>
        </Pressable>

        <View className="ml-4 flex-1">
          <Text variant="title" numberOfLines={1}>
            {displayName}
          </Text>
          <Text variant="footnote" numberOfLines={1} className="mt-0.5">
            {user?.phone ?? 'Profile not set up yet'}
          </Text>
          <Badge label="Verified" tone="success-solid" className="mt-2" />
        </View>
      </View>

      {SETTINGS_GROUPS.map((group) => (
        <SettingsSection key={group.label} label={group.label} className="mt-6">
          {group.rows.map((row, index) => (
            <SettingsRow
              key={row.label}
              icon={row.icon}
              label={row.label}
              last={index === group.rows.length - 1}
              onPress={row.onPress}
            />
          ))}
        </SettingsSection>
      ))}

      <SettingsSection className="mt-6">
        <SettingsRow
          icon="trash-outline"
          label="Delete account"
          destructive
          last
          onPress={() => router.push('/account')}
        />
      </SettingsSection>

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => void onSignOut()}
        className="mt-8"
      />

      {/* Keep the sign-out button scrollable clear of the floating tab pill. */}
      <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
    </Screen>
  );
}
