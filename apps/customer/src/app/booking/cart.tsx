import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BookingStep } from '@/components/booking/BookingStep';
import { QuantityStepper } from '@/components/booking/QuantityStepper';
import { ServiceSelectionSheet } from '@/components/booking/ServiceSelectionSheet';
import { EmptyState } from '@/components/feedback';
import { Button, Text } from '@/components/ui';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import {
  cartServiceCount,
  cartTotalPaise,
  cartUnitCount,
  cartWorksCount,
  draftItemName,
  draftTotalPaise,
  draftUnitCount,
  useBookingDraft,
  type DraftGroup,
  type DraftItem,
} from '@/stores/booking';
import { color, elevation } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRupees } from '@/utils/format';
import {
  durationStepMinutes,
  formatDuration,
  maxDurationMinutes,
  maxQuantity,
  minDurationMinutes,
  minQuantity,
  pricingModelOf,
  unitPricePaise,
} from '@/utils/pricing';

/**
 * One booked work in the cart: what it is, how its amount was chosen (a
 * quantity for `PER_UNIT`, a duration for `PER_HOUR`, nothing for a fixed
 * price) and what it adds to the visit's estimate.
 */
function CartRow({
  item,
  onQuantity,
  onDuration,
  onRemove,
}: {
  item: DraftItem;
  onQuantity: (quantity: number) => void;
  onDuration: (durationMinutes: number) => void;
  onRemove: () => void;
}) {
  const name = draftItemName(item);
  const model = pricingModelOf(item.skill);
  const unitPrice = unitPricePaise(item.skill);
  const minQty = minQuantity(item.skill);
  const maxQty = maxQuantity(item.skill);
  const minDuration = minDurationMinutes(item.skill);
  const maxDuration = maxDurationMinutes(item.skill);
  const step = durationStepMinutes(item.skill);
  const artwork = isImageUrl(item.skill.icon ?? null) ? item.skill.icon : null;

  const priceCaption =
    model === 'PER_UNIT'
      ? `${formatRupees(unitPrice ?? 0)} / ${item.skill.unitLabel ?? 'unit'}`
      : model === 'PER_HOUR'
        ? `${formatRupees(unitPrice ?? 0)} / hr`
        : 'Fixed price';

  /** At the smallest selection, the minus offers to remove the work instead. */
  function confirmRemove() {
    Alert.alert('Remove this work?', `Remove ${name} from your cart?`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ]);
  }

  return (
    <View className="flex-row items-center gap-3 px-2 py-3">
      <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
        {artwork ? (
          <ServiceImage uri={artwork} accessibilityLabel={name} className="h-full w-full" />
        ) : (
          <Ionicons name="pricetag-outline" size={22} color={color['text-secondary']} />
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-secondary">
          {priceCaption}
        </Text>
      </View>

      <View className="items-end gap-1.5">
        {model === 'PER_UNIT' ? (
          <QuantityStepper
            value={item.quantity}
            valueLabel={`${name} quantity ${item.quantity}`}
            decreaseLabel={`Reduce quantity of ${name}`}
            increaseLabel={`Increase quantity of ${name}`}
            onDecrease={() =>
              item.quantity <= minQty ? confirmRemove() : onQuantity(item.quantity - 1)
            }
            onIncrease={() => onQuantity(item.quantity + 1)}
            increaseDisabled={item.quantity >= maxQty}
            valueClassName="min-w-4"
          />
        ) : model === 'PER_HOUR' ? (
          <QuantityStepper
            value={formatDuration(item.durationMinutes ?? minDuration)}
            valueLabel={`${name} duration ${formatDuration(item.durationMinutes ?? minDuration)}`}
            decreaseLabel={`Reduce duration of ${name}`}
            increaseLabel={`Increase duration of ${name}`}
            onDecrease={() =>
              (item.durationMinutes ?? minDuration) <= minDuration
                ? confirmRemove()
                : onDuration((item.durationMinutes ?? minDuration) - step)
            }
            onIncrease={() => onDuration((item.durationMinutes ?? minDuration) + step)}
            increaseDisabled={(item.durationMinutes ?? minDuration) >= maxDuration}
            valueClassName="min-w-8"
          />
        ) : null}
        <Text variant="bodyStrong" numberOfLines={1}>
          {formatRupees(item.totalPaise)}
        </Text>
      </View>
    </View>
  );
}

/**
 * One service's slice of the cart. Each becomes its own booking on checkout,
 * with its own professional and cash payment, so the header names the trade
 * and its own estimate.
 */
function ServiceGroup({
  group,
  first = false,
  onQuantity,
  onDuration,
  onRemove,
}: {
  group: DraftGroup;
  /** The leading group hugs the header instead of adding a top gap. */
  first?: boolean;
  onQuantity: (skillId: string, quantity: number) => void;
  onDuration: (skillId: string, durationMinutes: number) => void;
  onRemove: (skillId: string) => void;
}) {
  return (
    <View
      className={cn('rounded-lg border border-border bg-surface', first ? undefined : 'mt-4')}
    >
      {/* The service head straddles the top border, centred like a legend. */}
      <View className="absolute left-0 right-0 items-start pl-3" style={{ top: -10 }}>
        <View className="flex-row items-center gap-2 rounded-full bg-surface px-3">
          <ServiceImage
            uri={group.service.icon}
            accessibilityLabel={group.service.name}
            className="h-4 w-4"
          />
          <Text variant="bodyStrong" numberOfLines={1}>
            {group.service.name}
          </Text>
        </View>
      </View>

      <View className="items-start px-3 pb-1 pt-4">
        <Text variant="caption" numberOfLines={1} className="text-text-secondary">
          {group.items.length} {group.items.length === 1 ? 'work' : 'works'} ·{' '}
          {formatRupees(draftTotalPaise(group.items))}
        </Text>
      </View>

      {group.items.map((item, index) => (
        <View key={item.skill.id}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          <CartRow
            item={item}
            onQuantity={(quantity) => onQuantity(item.skill.id, quantity)}
            onDuration={(durationMinutes) => onDuration(item.skill.id, durationMinutes)}
            onRemove={() => onRemove(item.skill.id)}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The cart step: every work the customer has added, grouped by service. Each
 * service becomes its own booking on checkout, with its own professional and
 * cash payment; the customer reviews the whole visit together.
 */
export default function BookingCart() {
  const draft = useBookingDraft();
  /**
   * A cart mixing services asks which ones to book before moving on, so a
   * customer can split a visit without emptying the rest of the cart.
   */
  const [choosingServices, setChoosingServices] = useState(false);

  const groups = draft.groups;
  const worksCount = cartWorksCount(groups);
  const units = cartUnitCount(groups);
  const totalPaise = cartTotalPaise(groups);
  const serviceCount = cartServiceCount(groups);
  /** The header's quiet summary, in the inbox's subtitle slot. */
  const headerSubtitle =
    worksCount > 0
      ? `${worksCount} ${worksCount === 1 ? 'work' : 'works'} · ${serviceCount} ${
          serviceCount === 1 ? 'service' : 'services'
        }`
      : undefined;

  if (worksCount === 0) {
    return (
      <BookingStep
        step={1}
        headerTitle="Your cart"
        headerCloseLabel="Close cart"
        contentClassName="pt-2"
      >
        <EmptyState
          icon="cart-outline"
          title="Nothing booked yet"
          message="Pick the works you need from any service."
          actionLabel="Browse works"
          onAction={() => router.back()}
        />
      </BookingStep>
    );
  }

  function handleContinue() {
    // One service goes straight to review; several need a pick first.
    if (groups.length > 1) {
      setChoosingServices(true);
      return;
    }
    router.push('/booking/review');
  }

  function handleContinueWith(serviceSlugs: string[]) {
    setChoosingServices(false);
    router.push({
      pathname: '/booking/review',
      params: { services: serviceSlugs.join(',') },
    });
  }

  return (
    <View className="flex-1">
      <BookingStep
        step={1}
        headerTitle="Your cart"
        headerSubtitle={headerSubtitle}
        headerCloseLabel="Close cart"
        contentClassName="pt-3"
        footer={
          <View
            className="gap-3 bg-surface px-2 pb-4 pt-2"
            style={[elevation.md, { shadowOffset: { width: 0, height: -4 } }]}
          >
            <View className="flex-row items-center justify-between px-3">
              <Text variant="bodyStrong">
                {worksCount} {worksCount === 1 ? 'work' : 'works'}
                {units > worksCount ? ` · ${units} ${units === 1 ? 'item' : 'items'}` : ''}
              </Text>
              <Text variant="titleLg">{formatRupees(totalPaise)}</Text>
            </View>
            <Button label="Continue" size="lg" onPress={handleContinue} />
          </View>
        }
      >
        {groups.map((group, index) => (
          <ServiceGroup
            key={group.service.id}
            group={group}
            first={index === 0}
            onQuantity={draft.setQuantity}
            onDuration={draft.setDurationMinutes}
            onRemove={draft.removeItem}
          />
        ))}

        <Button
          label="Add more works"
          variant="ghost"
          onPress={() => router.back()}
          className="mt-6"
        />
      </BookingStep>

      <ServiceSelectionSheet
        visible={choosingServices}
        groups={groups}
        onClose={() => setChoosingServices(false)}
        onContinue={handleContinueWith}
      />
    </View>
  );
}
