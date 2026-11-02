import { View } from 'react-native';
import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, ListRow, Screen, Text } from '@/components/ui';
import { useProProfile, useSession } from '@/hooks';
import type { TranslationKey } from '@/i18n';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type SettingsRow = {
  icon: IoniconName;
  labelKey: TranslationKey;
  route: string;
  destructive?: boolean;
};

export default function Profile() {
  const { t } = useTranslation();
  const { user, signOut } = useSession();
  const { data: proProfile } = useProProfile();

  // The pro's own display name (set during onboarding) is authoritative; the
  // shared identity row may not have one. Never fall back to a placeholder name.
  const profileName = proProfile?.displayName?.trim() || user?.fullName?.trim() || '';

  // One continuous list: every row shares the same hairline rhythm, so no row
  // reads taller than another.
  const settingsRows: SettingsRow[] = [
    {
      icon: 'construct-outline',
      labelKey: 'profile.settings.servicesSkills',
      route: '/manage-services',
    },
    { icon: 'location-outline', labelKey: 'profile.settings.serviceArea', route: '/service-areas' },
    { icon: 'document-text-outline', labelKey: 'profile.settings.documents', route: '/documents' },
    {
      icon: 'notifications-outline',
      labelKey: 'profile.settings.jobAlertSetup',
      route: '/device-setup',
    },
    {
      icon: 'help-circle-outline',
      labelKey: 'profile.settings.helpSupport',
      route: '/help-support',
    },
    { icon: 'language-outline', labelKey: 'profile.settings.language', route: '/language' },
    {
      icon: 'trash-outline',
      labelKey: 'profile.settings.deleteAccount',
      route: '/account',
      destructive: true,
    },
  ];

  return (
    <Screen scrollable className="bg-surface">
      <View className="pt-2">
        <Text variant="titleLg">{t('tabs.profile')}</Text>
      </View>

      <View className="-mx-5 mt-2 bg-surface-muted px-5 py-4">
        <View className="flex-row items-center">
          <Avatar
            name={profileName || t('brand.samonaPro')}
            uri={proProfile?.selfiePhotoUrl ?? null}
            size="lg"
          />
          <View className="ml-4 flex-1">
            {profileName ? <Text variant="title">{profileName}</Text> : null}
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
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
        </View>
      </View>

      <View className="mt-6">
        {settingsRows.map((row, index) => (
          <ListRow
            key={row.labelKey}
            icon={row.icon}
            label={t(row.labelKey)}
            destructive={row.destructive}
            showDivider={index < settingsRows.length - 1}
            onPress={() => router.push(row.route)}
          />
        ))}
      </View>

      <Button
        label={t('profile.signOut')}
        variant="secondary"
        onPress={() => void signOut()}
        className="mt-6"
      />
    </Screen>
  );
}
