import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ProServiceListItem, ProServiceSkill } from '@samona/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Badge, Button, Divider, Screen, Text } from '@/components/ui';
import { ServiceImage, isImageUrl } from '@/components/services/ServiceImage';
import { RejectionReasonSheet } from '@/components/services/RejectionReasonSheet';
import { useProServices, useRequestProService } from '@/hooks';
import { formatInr } from '@/utils/format';
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
 *
 * Each service is an accordion: expanding it reveals the service's specialties
 * with their image, name and base price. At most one stays open, so a long
 * catalogue never buries the next service.
 */
export default function ManageServicesScreen() {
  const { t } = useTranslation();
  const { data: services = [], isPending, isError, refetch } = useProServices();
  const request = useRequestProService();
  // Service whose specialties are showing; one open at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      <Screen className="bg-white">
        <LoadingState message={t('manageServices.loading')} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen className="bg-white">
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']} className="bg-white">
      <View className="pt-2">
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
                expanded={expandedId === service.id}
                busy={request.isPending}
                loadingThis={request.isPending && request.variables === service.id}
                onToggle={() =>
                  setExpandedId((current) => (current === service.id ? null : service.id))
                }
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
  expanded,
  busy,
  loadingThis,
  onToggle,
  onRequest,
  onViewReason,
}: {
  service: ProServiceListItem;
  expanded: boolean;
  /** True while any request is in flight — the row's peers are held disabled. */
  busy: boolean;
  loadingThis: boolean;
  onToggle: () => void;
  onRequest: () => void;
  /** Opens the rejection-reason sheet; only offered when the verdict is REJECTED. */
  onViewReason: () => void;
}) {
  const { t } = useTranslation();
  const model = serviceRowModel(service.status);
  const statusLabel = t(model.badgeLabelKey);

  const badge = <Badge label={statusLabel} tone={model.badgeTone} />;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('manageServices.a11y.row', {
          service: service.name,
          status: statusLabel,
        })}
        onPress={onToggle}
        className="min-h-[72px] flex-row items-center px-2 py-3 active:opacity-70"
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
        <View className="ml-2">
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={color['text-muted']}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View className="border-t border-border bg-white px-2 pb-3 pt-1">
          {service.skills.length === 0 ? (
            <Text variant="footnote" className="py-2 text-text-muted">
              {t('manageServices.skills.empty')}
            </Text>
          ) : (
            service.skills.map((skill) => <SkillRow key={skill.id} skill={skill} />)
          )}
        </View>
      ) : null}
    </View>
  );
}

function SkillRow({ skill }: { skill: ProServiceSkill }) {
  const { t } = useTranslation();
  const price = formatInr(skill.basePricePaise);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('manageServices.a11y.skill', { skill: skill.name, price })}
      className="flex-row items-center py-2"
    >
      <ServiceThumb icon={skill.icon} name={skill.name} size="sm" />
      <Text variant="body" numberOfLines={1} className="ml-3 flex-1">
        {skill.name}
      </Text>
      <Text variant="body" className="ml-3 font-semibold">
        {price}
      </Text>
    </View>
  );
}

/**
 * The catalogue's `icon` column holds image URLs, but seeded rows still carry
 * legacy Ionicon names — render whichever the value actually is, so no row
 * shows an empty tile.
 */
function ServiceThumb({
  icon,
  name,
  size = 'md',
}: {
  icon: string | null;
  name: string;
  size?: 'md' | 'sm';
}) {
  const tile = size === 'sm' ? 'h-14 w-14 rounded-lg' : 'h-16 w-16 rounded-xl';
  const glyph = size === 'sm' ? 22 : 28;

  if (icon && isImageUrl(icon)) {
    return <ServiceImage uri={icon} accessibilityLabel={name} className={tile} />;
  }
  return (
    <View className={`${tile} items-center justify-center bg-surface`}>
      <Ionicons name={(icon ?? 'grid-outline') as IoniconName} size={glyph} color={color.brand} />
    </View>
  );
}
