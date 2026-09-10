import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { useProProfile } from '@/hooks';
import { color } from '@/theme';
import { ProServiceStatus, type ProServiceVerification } from '@samona/types';

const STATUS_MARK: Record<
  ProServiceStatus,
  { name: React.ComponentProps<typeof Ionicons>['name']; tint: string; label: string }
> = {
  [ProServiceStatus.ACCEPTED]: { name: 'checkmark-circle', tint: color.success, label: 'verified' },
  [ProServiceStatus.PENDING]: { name: 'time', tint: color.warning, label: 'pending' },
  [ProServiceStatus.REJECTED]: { name: 'close-circle', tint: color.danger, label: 'rejected' },
};

function ServiceTile({ service }: { service: ProServiceVerification }) {
  const mark = STATUS_MARK[service.status];
  const isRejected = service.status === ProServiceStatus.REJECTED;
  const icon = (service.icon ?? undefined) as
    React.ComponentProps<typeof Ionicons>['name'] | undefined;

  function showReason() {
    const reason = service.rejectionReason?.trim();
    Alert.alert(
      service.name,
      reason || 'No reason was provided. Please reach out to SAMONA support for details.',
    );
  }

  return (
    <Pressable
      accessibilityRole={isRejected ? 'button' : undefined}
      accessibilityLabel={`${service.name}, ${mark.label}`}
      accessibilityHint={isRejected ? 'Shows the rejection reason' : undefined}
      onPress={isRejected ? showReason : undefined}
      className="w-24 items-center active:opacity-70"
    >
      <View className="h-16 w-16 items-center justify-center rounded-lg bg-surface-muted">
        {icon ? <Ionicons name={icon} size={28} color={color['text-secondary']} /> : null}
        <View className="absolute -right-1.5 -top-1.5 h-4 w-4 items-center justify-center rounded-full border border-border bg-surface">
          <Ionicons name={mark.name} size={10} color={mark.tint} />
        </View>
      </View>
      <Text variant="caption" numberOfLines={2} className="mt-1.5 text-center text-text-secondary">
        {service.name}
      </Text>
    </Pressable>
  );
}

/** Placeholder tile for adding a service; linked up later. */
function AddServiceTile() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add service"
      onPress={() => undefined}
      className="w-24 items-center active:opacity-70"
    >
      <View className="h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted">
        <Ionicons name="add" size={28} color={color['text-secondary']} />
      </View>
      <Text variant="caption" numberOfLines={2} className="mt-1.5 text-center text-text-secondary">
        Add service
      </Text>
    </Pressable>
  );
}

/**
 * The pro's selected services as a horizontally scrollable row, styled like
 * the home services grid in the customer app: a light icon tile with the
 * service name beneath.
 *
 * Each tile carries a corner badge with the verification status — green tick
 * when SAMONA accepted it, amber clock while pending, red cross when rejected.
 * Tapping a rejected service reveals its reason.
 */
export function ServicesVerificationCard() {
  const { data: profile } = useProProfile();
  const services = profile?.proServices ?? [];

  if (services.length === 0) return null;

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between">
        <Text variant="title">Your services</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage services"
          onPress={() => undefined}
          className="flex-row items-center"
        >
          <Text variant="caption" className="text-brand">
            Manage
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.brand} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerClassName="gap-3"
      >
        {services.map((service) => (
          <ServiceTile key={service.id} service={service} />
        ))}
        <AddServiceTile />
      </ScrollView>
    </View>
  );
}
