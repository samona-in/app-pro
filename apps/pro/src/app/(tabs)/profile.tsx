import { View } from 'react-native';
import { Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useDeviceReadiness, useProProfile, useSession } from '@/hooks';
import { requestOverlayPermission } from '@/services/overlay-alert';
import type { TranslationKey } from '@/i18n';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETTINGS_ROWS: {
  icon: IoniconName;
  labelKey: TranslationKey;
  route?: string;
  destructive?: boolean;
}[] = [
  {
    icon: 'construct-outline',
    labelKey: 'profile.settings.servicesSkills',
    route: '/manage-services',
  },
  {
    icon: 'location-outline',
    labelKey: 'profile.settings.serviceArea',
    route: '/service-areas',
  },
  { icon: 'document-text-outline', labelKey: 'profile.settings.documents', route: '/documents' },
  {
    icon: 'notifications-outline',
    labelKey: 'profile.settings.jobAlertSetup',
    route: '/device-setup',
  },
  { icon: 'help-circle-outline', labelKey: 'profile.settings.helpSupport', route: '/help-support' },
  { icon: 'language-outline', labelKey: 'profile.settings.language', route: '/language' },
  {
    icon: 'trash-outline',
    labelKey: 'profile.settings.deleteAccount',
    route: '/account',
    destructive: true,
  },
];

function SettingsRow({
  icon,
  label,
  route,
  destructive = false,
}: {
  icon: IoniconName;
  label: string;
  route?: string;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
      onPress={() => {
        if (route) router.push(route);
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? color.danger : color['text-secondary']}
      />
      <Text variant="body" className={`ml-3 flex-1 ${destructive ? 'text-danger' : ''}`}>
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
  const { t } = useTranslation();
  const { readiness } = useDeviceReadiness();
  const enabled = readiness?.overlayPermissionEnabled ?? false;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('profile.overlay.a11y')}
      className="min-h-[56px] flex-row items-center px-4 py-2 active:opacity-60"
      onPress={() => void requestOverlayPermission()}
    >
      <Ionicons name="layers-outline" size={20} color={color['text-secondary']} />
      <View className="ml-3 flex-1 pr-2">
        <Text variant="body">{t('profile.overlay.rowLabel')}</Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          {t('profile.overlay.rowCaption')}
        </Text>
      </View>
      <Badge
        label={enabled ? t('common.on') : t('common.off')}
        tone={enabled ? 'success' : 'warning'}
        withDot
      />
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user, signOut } = useSession();
  const { data: proProfile } = useProProfile();

  // The pro's own display name (set during onboarding) is authoritative; the
  // shared identity row may not have one. Never fall back to a placeholder name.
  const profileName = proProfile?.displayName?.trim() || user?.fullName?.trim() || '';

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
        <Text variant="titleLg">{t('tabs.profile')}</Text>
      </View>

      <Card className="mt-4 flex-row items-center">
        <Avatar
          name={profileName || t('brand.samonaPro')}
          uri={proProfile?.selfiePhotoUrl ?? null}
          size="lg"
        />
        <View className="ml-4 flex-1">
          {profileName ? <Text variant="title">{profileName}</Text> : null}
          <Text variant="footnote" className="mt-0.5">
            {user?.phone ?? t('profile.notSetUpYet')}
          </Text>
          <Badge
            label={
              proProfile?.isVerified ? t('profile.verified') : t('profile.verificationPending')
            }
            tone={proProfile?.isVerified ? 'success' : 'warning'}
            className="mt-2"
          />
        </View>
      </Card>

      <Card className="mt-4" padded={false}>
        {SETTINGS_ROWS.map((row, index) => (
          <View key={row.labelKey}>
            {index > 0 ? <Divider /> : null}
            <SettingsRow icon={row.icon} label={t(row.labelKey)} route={row.route} />
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
        label={t('profile.signOut')}
        variant="secondary"
        onPress={() => void onSignOut()}
        className="mt-6"
      />
    </Screen>
  );
}
