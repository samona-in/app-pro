import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useProProfile } from '@/hooks';
import { color } from '@/theme';
import { ProServiceStatus, type ProServiceVerification } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { RejectionReasonSheet } from './RejectionReasonSheet';
import type { TranslationKey } from '@/i18n';

const STATUS_MARK: Record<
  ProServiceStatus,
  { name: React.ComponentProps<typeof Ionicons>['name']; tint: string; labelKey: TranslationKey }
> = {
  [ProServiceStatus.ACCEPTED]: {
    name: 'checkmark-circle',
    tint: color.success,
    labelKey: 'servicesVerification.mark.verified',
  },
  [ProServiceStatus.PENDING]: {
    name: 'time',
    tint: color.warning,
    labelKey: 'servicesVerification.mark.pending',
  },
  [ProServiceStatus.REJECTED]: {
    name: 'close-circle',
    tint: color.danger,
    labelKey: 'servicesVerification.mark.rejected',
  },
};

function ServiceTile({
  service,
  onViewReason,
}: {
  service: ProServiceVerification;
  /** Opens the rejection-reason sheet; only wired up for rejected tiles. */
  onViewReason: () => void;
}) {
  const { t } = useTranslation();
  const mark = STATUS_MARK[service.status];
  const isRejected = service.status === ProServiceStatus.REJECTED;

  return (
    <Pressable
      accessibilityRole={isRejected ? 'button' : undefined}
      accessibilityLabel={t('servicesVerification.a11y.serviceMarked', {
        service: service.name,
        mark: t(mark.labelKey),
      })}
      accessibilityHint={
        isRejected ? t('servicesVerification.a11y.showsRejectionReason') : undefined
      }
      onPress={isRejected ? onViewReason : undefined}
      className="w-24 items-center active:opacity-70"
    >
      <ServiceImage
        uri={service.icon}
        accessibilityLabel={service.name}
        className="h-16 w-16 rounded-lg"
      />
      <View className="mt-1.5 flex-row items-center justify-center">
        <Text variant="caption" numberOfLines={2} className="text-center text-text-secondary">
          {service.name}
        </Text>
        <View className="ml-1">
          <Ionicons name={mark.name} size={12} color={mark.tint} />
        </View>
      </View>
    </Pressable>
  );
}

/** Placeholder tile for adding a service; both tiles open Manage Services. */
function AddServiceTile() {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('servicesVerification.addService')}
      onPress={() => router.push('/manage-services')}
      className="w-24 items-center active:opacity-70"
    >
      <View className="h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted">
        <Ionicons name="add" size={28} color={color['text-secondary']} />
      </View>
      <Text variant="caption" numberOfLines={2} className="mt-1.5 text-center text-text-secondary">
        {t('servicesVerification.addService')}
      </Text>
    </Pressable>
  );
}

/**
 * The pro's selected services as a horizontally scrollable row, styled like
 * the home services grid in the customer app: a rounded image tile with the
 * service name beneath.
 *
 * Each tile shows the service name with a status mark right after it — green
 * tick when SAMONA accepted it, amber clock while pending, red cross when
 * rejected. Tapping a rejected service reveals its reason.
 */
export function ServicesVerificationCard() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const services = profile?.proServices ?? [];
  // Data and visibility are kept apart so the sheet still has something to
  // render while it animates closed.
  const [reasonService, setReasonService] = useState<ProServiceVerification | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  if (services.length === 0) return null;

  function onViewReason(service: ProServiceVerification) {
    setReasonService(service);
    setReasonOpen(true);
  }

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text variant="title">{t('servicesVerification.yourServices')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('servicesVerification.a11y.manageServices')}
          onPress={() => router.push('/manage-services')}
          className="flex-row items-center"
        >
          <Text variant="caption" className="text-brand">
            {t('servicesVerification.manage')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.brand} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerClassName="pr-4"
      >
        {services.map((service) => (
          <ServiceTile
            key={service.id}
            service={service}
            onViewReason={() => onViewReason(service)}
          />
        ))}
        <AddServiceTile />
      </ScrollView>

      <RejectionReasonSheet
        visible={reasonOpen}
        service={reasonService}
        onClose={() => setReasonOpen(false)}
      />
    </View>
  );
}
