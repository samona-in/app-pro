import { Alert, Pressable, View } from 'react-native';
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
      className="grow basis-1/4 rounded-xl border border-border bg-surface-muted p-1.5 active:opacity-70"
    >
      <View className="items-end">
        <Ionicons name={mark.name} size={14} color={mark.tint} />
      </View>
      <View className="mt-1 items-center px-0.5">
        {icon ? <Ionicons name={icon} size={18} color={color['text-primary']} /> : null}
        <Text variant="caption" numberOfLines={2} className="mt-1 text-center">
          {service.name}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The pro's selected services as a compact 4-column grid.
 *
 * Each card shows just the service icon and name, with a status mark in the
 * corner: green tick when SAMONA accepted it, amber clock while pending, red
 * cross when rejected. Tapping a rejected service reveals its reason.
 */
export function ServicesVerificationCard() {
  const { data: profile } = useProProfile();
  const services = profile?.proServices ?? [];

  if (services.length === 0) return null;

  return (
    <View className="mt-6">
      <Text variant="title">Your services</Text>
      <View className="mt-3 flex-row flex-wrap gap-1.5">
        {services.map((service) => (
          <ServiceTile key={service.id} service={service} />
        ))}
      </View>
    </View>
  );
}
