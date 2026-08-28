import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PlaceType, JOB_DESCRIPTION_MIN } from '@samona/types';
import { BookingStep } from '@/components/booking';
import { Card, Divider, Text } from '@/components/ui';
import { useCreateBooking } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { color } from '@/theme';
import { formatRupees } from '@/utils/format';

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="py-2.5">
      <Text variant="label">{label}</Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

export default function BookingReview() {
  const draft = useBookingDraft();
  const create = useCreateBooking();

  const placeLabel =
    draft.placeType === PlaceType.OTHER ? draft.placeDescription : humanize(draft.placeType);

  function humanize(value: string | null): string {
    if (!value) return '—';
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  async function onSubmit() {
    if (!draft.service || !draft.skill || !draft.placeType) return;
    if (draft.description.trim().length < JOB_DESCRIPTION_MIN) return;

    const job = await create.mutateAsync({
      serviceSlug: draft.service.slug,
      skillSlug: draft.skill.slug,
      placeType: draft.placeType,
      placeDescription:
        draft.placeType === PlaceType.OTHER ? draft.placeDescription || undefined : undefined,
      description: draft.description.trim(),
      imagePaths: draft.images
        .map((image) => image.path)
        .filter((path): path is string => Boolean(path)),
      basePayPaise: draft.basePayPaise,
    });

    if (job) {
      draft.reset();
      router.replace('/booking/success');
    }
  }

  return (
    <BookingStep
      step={5}
      title="Review your request"
      subtitle="Check the details before we look for a matching professional."
      primaryLabel="Place request"
      isSaving={create.isPending}
      error={create.isError ? 'Could not place your request. Please try again.' : null}
      onPrimary={() => void onSubmit()}
    >
      <Card>
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-surface-muted">
            <Ionicons
              name={
                (draft.service?.icon ?? 'construct-outline') as React.ComponentProps<
                  typeof Ionicons
                >['name']
              }
              size={22}
              color={color['text-secondary']}
            />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="title">{draft.service?.name ?? '—'}</Text>
            <Text variant="caption">{draft.skill?.name ?? '—'}</Text>
          </View>
        </View>

        <Divider spaced />

        <SummaryRow label="Where">
          <Text variant="body">{placeLabel}</Text>
        </SummaryRow>
        <Divider />
        <SummaryRow label="What's needed">
          <Text variant="body">{draft.description}</Text>
        </SummaryRow>

        {draft.images.length > 0 ? (
          <>
            <Divider />
            <SummaryRow label={`Reference photos (${draft.images.length})`}>
              <View className="flex-row flex-wrap gap-2">
                {draft.images.map((image) =>
                  image.uri ? (
                    <Image
                      key={image.uri}
                      source={{ uri: image.uri }}
                      className="h-16 w-16 rounded-lg"
                    />
                  ) : null,
                )}
              </View>
            </SummaryRow>
          </>
        ) : null}
      </Card>

      <Card className="mt-4">
        <View className="flex-row items-center justify-between">
          <Text variant="body">Base pay</Text>
          <Text variant="bodyStrong">{formatRupees(draft.basePayPaise)}</Text>
        </View>
        <Text variant="footnote" className="mt-2">
          A guarantee to the professional before work starts. You'll agree on the final amount with
          them once they're on the job.
        </Text>
      </Card>
    </BookingStep>
  );
}
