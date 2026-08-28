import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import { PLACE_TYPES, PlaceType } from '@samona/types';
import { BookingStep } from '@/components/booking';
import { SelectableCard } from '@/components/onboarding';
import { Input } from '@/components/ui';
import { useServiceCategories } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function BookingPlace() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const categories = useServiceCategories();
  const draft = useBookingDraft();

  const [placeType, setPlaceType] = useState<PlaceType | null>(draft.placeType);
  const [placeDescription, setPlaceDescription] = useState(draft.placeDescription);

  const service = categories.data?.find((item) => item.slug === slug);
  const isOther = placeType === PlaceType.OTHER;
  const canContinue =
    placeType !== null && (!isOther || placeDescription.trim().length > 0) && Boolean(service);

  function onContinue() {
    if (!canContinue || !placeType || !service) return;
    // A cold-start entry (deep link, process restart) can reach this screen
    // before the draft was started on the home grid — start it from the slug
    // the moment the customer actually commits to the flow.
    if (draft.service?.slug !== slug) draft.start(service);
    draft.setPlace(placeType, isOther ? placeDescription.trim() : '');
    router.push(`/booking/new/${slug}/skill`);
  }

  return (
    <BookingStep
      step={1}
      title="Where do you need the work done?"
      subtitle={`We'll share this with nearby ${service?.name.toLowerCase() ?? 'professionals'}.`}
      primaryDisabled={!canContinue}
      onPrimary={() => void onContinue()}
    >
      <View className="gap-3">
        {PLACE_TYPES.map((option) => (
          <SelectableCard
            key={option.value}
            label={option.label}
            icon={option.icon as IoniconName}
            single
            selected={placeType === option.value}
            onToggle={() => {
              setPlaceType(option.value);
              if (option.value !== PlaceType.OTHER) setPlaceDescription('');
            }}
          />
        ))}

        {isOther ? (
          <View className="mt-2">
            <Input
              label="Describe the place"
              placeholder="e.g. Community hall, shop, parking lot"
              value={placeDescription}
              onChangeText={setPlaceDescription}
              autoCapitalize="sentences"
              maxLength={100}
            />
          </View>
        ) : null}
      </View>
    </BookingStep>
  );
}
