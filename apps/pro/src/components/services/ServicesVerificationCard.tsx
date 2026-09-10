import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, Text } from '@/components/ui';
import type { BadgeTone } from '@/components/ui/Badge';
import { useProProfile } from '@/hooks';
import { color } from '@/theme';
import { ProServiceStatus, type ProServiceVerification } from '@samona/types';

const STATUS_TONE: Record<ProServiceStatus, { tone: BadgeTone; label: string }> = {
  [ProServiceStatus.ACCEPTED]: { tone: 'success', label: 'Verified' },
  [ProServiceStatus.PENDING]: { tone: 'warning', label: 'Pending' },
  [ProServiceStatus.REJECTED]: { tone: 'danger', label: 'Rejected' },
};

function ServiceRow({ service }: { service: ProServiceVerification }) {
  const { tone, label } = STATUS_TONE[service.status];
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
      accessibilityLabel={`${service.name}, ${label}`}
      accessibilityHint={isRejected ? 'Shows the rejection reason' : undefined}
      onPress={isRejected ? showReason : undefined}
      className="min-h-[48px] flex-row items-center active:opacity-70"
    >
      {icon ? (
        <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name={icon} size={18} color={color['text-secondary']} />
        </View>
      ) : null}
      <Text variant="bodyStrong" className={icon ? 'ml-3 flex-1' : 'flex-1'}>
        {service.name}
      </Text>
      <Badge label={label} tone={tone} className="ml-3" />
      {isRejected ? (
        <View className="ml-1">
          <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The pro's selected services and their verification status.
 *
 * A service is only bookable once SAMONA accepts it; everything starts
 * `PENDING` and an admin flips it to `ACCEPTED` or `REJECTED` offline (there is
 * no admin panel yet, so this is read-only). A rejected service keeps its
 * reason hidden until tapped.
 */
export function ServicesVerificationCard() {
  const { data: profile } = useProProfile();
  const services = profile?.proServices ?? [];

  if (services.length === 0) return null;

  return (
    <Card className="mt-6">
      <Text variant="title">Your services</Text>
      <Text variant="footnote" className="mt-1 text-text-secondary">
        Each service is verified by SAMONA before you can be booked for it.
      </Text>
      <View className="mt-4 gap-3">
        {services.map((service, index) => (
          <View key={service.id}>
            {index > 0 ? <View className="mb-3 h-px w-full bg-border" /> : null}
            <ServiceRow service={service} />
          </View>
        ))}
      </View>
      <Text variant="caption" className="mt-4 text-text-muted">
        {services.some((s) => s.status === ProServiceStatus.PENDING)
          ? "Some of your services are still being reviewed. You'll be able to work them once approved."
          : 'You can be booked for every service listed here.'}
      </Text>
    </Card>
  );
}
