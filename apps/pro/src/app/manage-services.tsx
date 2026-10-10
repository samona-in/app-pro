import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ProServiceListItem } from '@samona/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Badge, Button, Divider, Screen, Text } from '@/components/ui';
import { ServiceImage, isImageUrl } from '@/components/services/ServiceImage';
import { RejectionReasonSheet } from '@/components/services/RejectionReasonSheet';
import { useProServices, useRequestProService } from '@/hooks';
import { messageForRequestError, serviceRowModel } from '@/utils/manage-services';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Manage Services — the whole catalogue with this pro's own verification
 * status, reached from Profile or the home services card.
 *
 * The screen lists every active service, not just selected ones: `status`
 * is the pro's verdict from the server (null = never requested), and the
 * only action it offers is a request — approval itself belongs to an admin.
 * Requesting moves a row towards PENDING; the server answers races and
 * state changes, the client just refetches and shows what landed.
 */
export default function ManageServicesScreen() {
  const { t } = useTranslation();
  const { data: services = [], isPending, isError, refetch } = useProServices();
  const request = useRequestProService();
  // The rejected row whose reason is being read: data and visibility are kept
  // apart so the sheet still has something to render while it animates closed.
  const [reasonService, setReasonService] = useState<ProServiceListItem | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  function onRequest(service: ProServiceListItem) {
    request.mutate(service.id, {
      onError: (error) => {
        Alert.alert(t('manageServices.requestFailedTitle'), messageForRequestError(error, t));
      },
    });
  }

  function onViewReason(service: ProServiceListItem) {
    setReasonService(service);
    setReasonOpen(true);
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState message={t('manageServices.loading')} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">{t('manageServices.title')}</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('manageServices.subtitle')}
        </Text>
      </View>

      {services.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title={t('manageServices.emptyTitle')}
          message={t('manageServices.emptyMessage')}
          className="mt-8"
        />
      ) : (
        <View className="mt-2">
          {services.map((service, index) => (
            <View key={service.id}>
              {index > 0 ? <Divider className="-mx-5" /> : null}
              <ServiceRow
                service={service}
                busy={request.isPending}
                loadingThis={request.isPending && request.variables === service.id}
                onRequest={() => onRequest(service)}
                onViewReason={() => onViewReason(service)}
              />
            </View>
          ))}
        </View>
      )}

      <RejectionReasonSheet
        visible={reasonOpen}
        service={reasonService}
        onClose={() => setReasonOpen(false)}
      />
    </Screen>
  );
}

function ServiceRow({
  service,
  busy,
  loadingThis,
  onRequest,
  onViewReason,
}: {
  service: ProServiceListItem;
  /** True while any request is in flight — the row's peers are held disabled. */
  busy: boolean;
  loadingThis: boolean;
  onRequest: () => void;
  /** Opens the rejection-reason sheet; only offered when the verdict is REJECTED. */
  onViewReason: () => void;
}) {
  const { t } = useTranslation();
  const model = serviceRowModel(service.status);
  const statusLabel = t(model.badgeLabelKey);

  const badge = <Badge label={statusLabel} tone={model.badgeTone} />;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t('manageServices.a11y.row', {
        service: service.name,
        status: statusLabel,
      })}
      className="min-h-[72px] flex-row items-center px-4 py-3"
    >
      <ServiceThumb icon={service.icon} name={service.name} />
      <View className="ml-3 flex-1">
        <Text variant="body" className="font-semibold" numberOfLines={1}>
          {service.name}
        </Text>
        <View className="mt-1 flex-row items-center">
          {model.canViewRejectionReason ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('manageServices.a11y.viewRejectionReason', {
                service: service.name,
              })}
              hitSlop={8}
              onPress={onViewReason}
              className="flex-row items-center active:opacity-70"
            >
              {badge}
              <View className="ml-1.5">
                <Ionicons name="information-circle-outline" size={16} color={color.danger} />
              </View>
            </Pressable>
          ) : (
            badge
          )}
        </View>
      </View>
      {model.action && model.actionLabelKey ? (
        <Button
          label={t(model.actionLabelKey)}
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={busy}
          loading={loadingThis}
          onPress={onRequest}
          className="ml-3"
        />
      ) : null}
    </View>
  );
}

/**
 * The catalogue's `icon` column holds image URLs, but seeded rows still carry
 * legacy Ionicon names — render whichever the value actually is, so no row
 * shows an empty tile.
 */
function ServiceThumb({ icon, name }: { icon: string | null; name: string }) {
  if (icon && isImageUrl(icon)) {
    return <ServiceImage uri={icon} accessibilityLabel={name} className="h-12 w-12 rounded-lg" />;
  }
  return (
    <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-muted">
      <Ionicons name={(icon ?? 'grid-outline') as IoniconName} size={22} color={color.brand} />
    </View>
  );
}
