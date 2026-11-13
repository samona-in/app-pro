import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  View,
  type ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceWorkGroupWithWorks, SkillOption } from '@samona/types';
import {
  JOB_CUSTOM_SKILL_MAX,
  JOB_CUSTOM_SKILL_MIN,
  JOB_ITEMS_LIMIT,
  OTHER_SKILL_SLUG,
} from '@samona/types';
import {
  BookingDetailsSheet,
  type BookingDetailsSelection,
} from '@/components/booking/BookingDetailsSheet';
import { BookingStep } from '@/components/booking/BookingStep';
import { QuantityStepper } from '@/components/booking/QuantityStepper';
import { WorkGroupNavigation } from '@/components/booking/WorkGroupNavigation';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Input, Text } from '@/components/ui';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import { useServiceCategories, useServiceSkills, useServiceWorkGroups } from '@/hooks';
import {
  cartTotalPaise,
  cartUnitCount,
  cartWorksCount,
  groupItems,
  useBookingDraft,
  type DraftItem,
} from '@/stores/booking';
import { color, elevation } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRupees } from '@/utils/format';
import {
  activeWorkGroupAtOffset,
  scrollToWorkGroup,
} from '@/components/booking/work-groups-scroll';
import {
  clampDuration,
  durationStepMinutes,
  formatDuration,
  maxDurationMinutes,
  maxQuantity,
  minDurationMinutes,
  minQuantity,
  pricingModelOf,
} from '@/utils/pricing';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function SkillRow({
  label,
  imageUri,
  icon,
  selected,
  onToggle,
  basePricePaise,
  pricingModel,
  unitLabel,
  cartItem,
  onQuantity,
  onDuration,
  onRemove,
}: {
  label: string;
  imageUri?: string | null;
  icon?: IoniconName;
  selected: boolean;
  onToggle: () => void;
  basePricePaise?: number | null;
  pricingModel?: 'PER_UNIT' | 'PER_BOOKING' | 'PER_HOUR';
  unitLabel?: string | null;
  /** This work's entry in the cart, once it has been added. */
  cartItem?: DraftItem | null;
  onQuantity?: (quantity: number) => void;
  onDuration?: (durationMinutes: number) => void;
  onRemove?: () => void;
}) {
  const hasImage = isImageUrl(imageUri ?? null);
  const height = Dimensions.get('window').height / 4;
  const priceText = basePricePaise
    ? `₹${Math.round(basePricePaise / 100)}${
        pricingModel === 'PER_UNIT'
          ? ` / ${unitLabel ?? 'unit'}`
          : pricingModel === 'PER_HOUR'
            ? ' / hr'
            : ''
      }`
    : null;

  // Once a work is in the cart its pill becomes a working stepper, so the
  // customer can change the quantity or duration without opening the sheet
  // again. Fixed-price works have nothing to step and keep the "Added" pill.
  const cartModel = cartItem ? pricingModelOf(cartItem.skill) : null;
  const steppable = cartModel === 'PER_UNIT' || cartModel === 'PER_HOUR';
  const byDuration = cartModel === 'PER_HOUR';
  const minQty = minQuantity(cartItem?.skill);
  const maxQty = maxQuantity(cartItem?.skill);
  const minDuration = minDurationMinutes(cartItem?.skill);
  const maxDuration = maxDurationMinutes(cartItem?.skill);
  const durationStep = durationStepMinutes(cartItem?.skill);
  const quantity = cartItem?.quantity ?? minQty;
  const duration = cartItem?.durationMinutes ?? minDuration;
  const stepValue = byDuration ? formatDuration(duration) : quantity;

  /** At the smallest selection the minus drops the work out of the cart. */
  function decrease() {
    if (!cartItem) return;
    if (byDuration) {
      if (duration <= minDuration) {
        onRemove?.();
        return;
      }
      onDuration?.(clampDuration(cartItem.skill, duration - durationStep));
      return;
    }
    if (quantity <= minQty) {
      onRemove?.();
      return;
    }
    onQuantity?.(quantity - 1);
  }

  function increase() {
    if (!cartItem) return;
    if (byDuration) {
      onDuration?.(clampDuration(cartItem.skill, duration + durationStep));
      return;
    }
    onQuantity?.(quantity + 1);
  }

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="flex-row items-center justify-between px-2 active:opacity-70"
      style={{ height }}
    >
      <View className="flex-1 pr-3">
        <Text
          variant="body"
          style={{ fontSize: 16, fontWeight: '700' }}
          numberOfLines={2}
          className={cn(selected && 'text-brand')}
        >
          {label}
        </Text>
        {priceText ? (
          <Text
            variant="footnote"
            style={{ fontSize: 14, fontWeight: '700', color: '#000000' }}
            className={cn('mt-0.5')}
          >
            {priceText}
          </Text>
        ) : null}
      </View>
      <View style={{ position: 'relative', overflow: 'visible' }}>
        <View
          className={cn(
            'aspect-square h-[112px] w-[112px] items-center justify-center overflow-hidden rounded-sm border',
            selected ? 'border-brand' : 'border-border',
          )}
        >
          {hasImage ? (
            <ServiceImage uri={imageUri} accessibilityLabel={label} className="h-full w-full" />
          ) : (
            <Ionicons
              name={icon ?? 'pricetag-outline'}
              size={24}
              color={selected ? color.brand : color['text-secondary']}
            />
          )}
        </View>
        <View
          style={{ position: 'absolute', bottom: -14, left: 0, right: 0, alignItems: 'center' }}
        >
          {steppable ? (
            <QuantityStepper
              variant="pill"
              value={stepValue}
              valueLabel={`${label} ${byDuration ? 'duration' : 'quantity'} ${stepValue}`}
              decreaseLabel={`Reduce ${byDuration ? 'duration' : 'quantity'} of ${label}`}
              increaseLabel={`Increase ${byDuration ? 'duration' : 'quantity'} of ${label}`}
              onDecrease={decrease}
              onIncrease={increase}
              increaseDisabled={byDuration ? duration >= maxDuration : quantity >= maxQty}
              valueClassName={byDuration ? 'min-w-9' : 'min-w-4'}
            />
          ) : (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 16,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? '#054DFF' : '#2563eb',
              }}
            >
              <Text
                style={{ color: selected ? '#054DFF' : '#2563eb', fontSize: 12, fontWeight: '600' }}
              >
                {selected ? 'Added' : 'Book now'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The bar's surface, matched to the floating tab bar's frosted glass: the same
 * near-white frost with its cool tint wash composited in, so the cart chrome
 * reads as part of the same layer as the tab pill.
 */
const CART_BAR_SURFACE = 'rgba(246, 248, 250, 0.97)';

/**
 * The pinned cart summary: how many works the request carries, its estimate,
 * and the way to the cart. It appears as soon as the first work is added and
 * stays visible while the catalogue scrolls.
 */
function CartSummaryBar({
  worksCount,
  units,
  totalPaise,
  onContinue,
}: {
  worksCount: number;
  units: number;
  totalPaise: number;
  onContinue: () => void;
}) {
  return (
    <View className="bg-surface px-2 pb-3 pt-2">
      <View
        className="min-h-[60px] flex-row items-center rounded-full pl-5 pr-2"
        style={[elevation.md, { backgroundColor: CART_BAR_SURFACE }]}
      >
        <View className="flex-1 pr-3">
          <Text variant="bodyStrong" numberOfLines={1}>
            {worksCount} {worksCount === 1 ? 'work' : 'works'}
            {units > worksCount ? ` · ${units} items` : ''}
          </Text>
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-secondary">
            Estimated total {formatRupees(totalPaise)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View cart with ${worksCount} ${
            worksCount === 1 ? 'work' : 'works'
          } in cart`}
          onPress={onContinue}
          className="min-h-[46px] items-center justify-center rounded-full bg-brand px-6 active:opacity-80"
        >
          <Text variant="bodyLg" className="font-semibold text-white">
            View cart
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function BookingSkill() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const skills = useServiceSkills(slug);
  const workGroups = useServiceWorkGroups(slug);
  const categories = useServiceCategories();
  const draft = useBookingDraft();
  /**
   * The work driving the "Other" free-text input (and the arrival highlight
   * for a popular-work or search-result pick). Which works are actually
   * booked is the cart's, not this screen's, opinion.
   */
  const [skillId, setSkillId] = useState<string | null>(draft.preselectedSkillId);
  const [customText, setCustomText] = useState(
    () =>
      groupItems(draft.groups, draft.service?.id).find(
        (item) => item.skill.slug === OTHER_SKILL_SLUG,
      )?.customSkill ?? '',
  );
  /** The work whose details sheet is open; null while browsing the catalogue. */
  const [detailsSkill, setDetailsSkill] = useState<SkillOption | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentTop = useRef(0);
  /** Top of the sections list within the grouped catalogue wrapper. */
  const sectionsListTop = useRef(0);
  /** Each section's top within the sections list, by group id. */
  const groupSectionTops = useRef(new Map<string, number>());
  const heroTop = useRef(0);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const catalogueService =
    categories.data?.find((item) => item.slug === slug) ?? workGroups.data?.service ?? null;
  const service = catalogueService ?? (draft.service?.slug === slug ? draft.service : null);
  const serviceId =
    workGroups.data?.service?.id ??
    skills.data?.[0]?.serviceId ??
    (draft.service?.slug === slug ? draft.service.id : '');

  useEffect(() => {
    if (!service || draft.service?.id === service.id) return;

    // Opening a service only switches which group the catalogue edits. Works
    // already in the cart for other services are kept: one checkout can carry
    // several trades, each becoming its own booking.
    draft.start(service);
  }, [draft.service?.id, draft.start, service]);

  // While the details sheet is open, a back press dismisses the sheet instead of
  // leaving the catalogue screen. Without this, Android's back gesture popped
  // the whole booking step and dropped the customer back on home.
  useEffect(() => {
    if (!detailsSkill) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailsSkill(null);
      return true;
    });

    return () => subscription.remove();
  }, [detailsSkill]);

  const displayGroups = useMemo(() => {
    const configuredGroups = workGroups.data?.groups ?? [];
    if (configuredGroups.length === 0) return [];
    const groupedIds = new Set(
      configuredGroups.flatMap((group) => group.works.map((work) => work.id)),
    );
    const ungroupedWorks = (skills.data ?? []).filter((work) => !groupedIds.has(work.id));
    if (ungroupedWorks.length === 0) return configuredGroups;

    const additionalGroup: ServiceWorkGroupWithWorks = {
      id: `${slug}-additional-work`,
      serviceId,
      name: 'Additional work',
      slug: 'additional-work',
      imageUrl: 'asset://service-work-groups/toolbox',
      sortOrder: 999,
      isActive: true,
      works: ungroupedWorks,
    };
    return [...configuredGroups, additionalGroup];
  }, [workGroups.data?.groups, serviceId, skills.data, slug]);

  const resolvedActiveGroupId = null;

  const allWorks =
    displayGroups.length > 0 ? displayGroups.flatMap((group) => group.works) : (skills.data ?? []);
  const other = allWorks.find((item) => item.slug === OTHER_SKILL_SLUG) ?? null;
  const predefined = allWorks.filter((item) => item.slug !== OTHER_SKILL_SLUG);
  const isOther = skillId === other?.id;
  const customLength = customText.trim().length;
  const canContinue = isOther
    ? customLength >= JOB_CUSTOM_SKILL_MIN && customLength <= JOB_CUSTOM_SKILL_MAX
    : skillId !== null;

  function selectPredefined(skill: SkillOption) {
    setDetailsSkill(skill);
  }

  function selectOther(skill: SkillOption) {
    if (skillId === skill.id) return;
    setSkillId(skill.id);
    // Reopening "Other" restores whatever the cart already holds for it.
    const carted = groupItems(draft.groups, draft.service?.id).find(
      (item) => item.skill.id === skill.id,
    );
    setCustomText(carted?.customSkill ?? '');
  }

  function onContinue() {
    if (!canContinue) return;
    if (isOther && other) {
      setDetailsSkill(other);
    }
  }

  /** This service's cart entry for a work, once the customer added it. */
  function cartedItem(workId: string): DraftItem | undefined {
    return groupItems(draft.groups, draft.service?.id).find((item) => item.skill.id === workId);
  }

  function onDetailsAdd(description: string, selection: BookingDetailsSelection) {
    if (!detailsSkill) return;
    const added = draft.addItem({
      skill: detailsSkill,
      customSkill: detailsSkill.slug === OTHER_SKILL_SLUG ? customText.trim() : '',
      quantity: selection.quantity,
      durationMinutes: selection.durationMinutes,
      totalPaise: selection.totalPaise,
    });
    if (!added) {
      Alert.alert(
        'Cart is full',
        `You can book up to ${JOB_ITEMS_LIMIT} works in one request. Remove one to add another.`,
      );
      return;
    }
    draft.setDescription(description);
    setDetailsSkill(null);
  }

  function handleGroupLayout(event: LayoutChangeEvent, groupId: string) {
    groupSectionTops.current.set(groupId, event.nativeEvent.layout.y);
  }

  function handleSectionsLayout(event: LayoutChangeEvent) {
    sectionsListTop.current = event.nativeEvent.layout.y;
  }

  /**
   * Jumps the catalogue to the tapped group: the section is scrolled to the
   * top of the list, right below the pinned header, so the group name leads
   * its first work row, without leaving the screen.
   */
  function scrollToGroup(groupId: string) {
    const sectionTop = groupSectionTops.current.get(groupId);
    if (sectionTop === undefined) return;

    setActiveGroupId(groupId);
    scrollToWorkGroup(scrollRef.current, {
      sectionsTop: sectionsListTop.current,
      sectionTop,
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const scrollY = event.nativeEvent.contentOffset.y;
    const threshold = heroTop.current - 60;
    if (scrollY > threshold) {
      if ((headerOpacity as any)._value !== 1) {
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    } else {
      if ((headerOpacity as any)._value !== 0) {
        Animated.timing(headerOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    }

    if (displayGroups.length === 0) return;
    const positions = displayGroups.flatMap((group) => {
      const top = groupSectionTops.current.get(group.id);
      return top === undefined ? [] : [{ id: group.id, top }];
    });
    const activeId = activeWorkGroupAtOffset(positions, {
      scrollY,
      stickyHeight,
    });
    if (activeId) setActiveGroupId((current) => (current === activeId ? current : activeId));
  }

  function handleContentLayout(event: LayoutChangeEvent) {
    contentTop.current = event.nativeEvent.layout.y;
  }

  function handleHeroLayout(event: LayoutChangeEvent) {
    heroTop.current = event.nativeEvent.layout.y + contentTop.current;
  }

  function handleStickyLayout(event: LayoutChangeEvent) {
    setStickyHeight(event.nativeEvent.layout.height);
  }

  if (skills.isPending || workGroups.isPending || (!service && categories.isPending)) {
    return (
      <View className="flex-1 justify-center">
        <LoadingState message="Loading job categories" size="inline" />
      </View>
    );
  }

  if (!workGroups.data && !skills.data) {
    return (
      <View className="flex-1 justify-center">
        <ErrorState
          title="Couldn't load job categories"
          message="Check your connection and try again."
          onRetry={() => {
            void skills.refetch();
            void workGroups.refetch();
          }}
        />
      </View>
    );
  }

  if (!service) {
    return (
      <View className="flex-1 justify-center">
        <ErrorState
          title="Couldn't load service details"
          message="Check your connection and try again."
          onRetry={() => {
            void categories.refetch();
            void skills.refetch();
            void workGroups.refetch();
          }}
        />
      </View>
    );
  }

  if (allWorks.length === 0) {
    return (
      <BookingStep step={1} service={{ name: service.name }}>
        <EmptyState
          icon="construct-outline"
          title="Work types coming soon"
          message="There aren't any bookable work types for this service yet."
        />
      </BookingStep>
    );
  }

  return (
    <View className="flex-1">
      {/*
       * The iOS edge-swipe pops the screen natively, so it cannot be caught by
       * a back listener. Disabling the gesture while the sheet is up keeps the
       * customer on the catalogue: the sheet's own swipe-down and backdrop
       * still close it.
       */}
      <Stack.Screen options={{ gestureEnabled: detailsSkill === null }} />

      <BookingStep
        step={1}
        service={undefined}
        scrollRef={scrollRef}
        onScroll={handleScroll}
        onContentLayout={handleContentLayout}
        primaryDisabled={!canContinue}
        onPrimary={undefined}
        footer={
          cartWorksCount(draft.groups) > 0 ? (
            <CartSummaryBar
              worksCount={cartWorksCount(draft.groups)}
              units={cartUnitCount(draft.groups)}
              totalPaise={cartTotalPaise(draft.groups)}
              onContinue={() => router.push('/booking/cart')}
            />
          ) : undefined
        }
        headerExtra={
          <Animated.View
            style={{
              opacity: headerOpacity,
              transform: [
                {
                  translateY: (headerOpacity as any).interpolate
                    ? (headerOpacity as any).interpolate({
                        inputRange: [0, 1],
                        outputRange: [-4, 0],
                      })
                    : 0,
                },
              ],
            }}
            className="flex-1 pr-2"
          >
            <Text variant="bodyStrong" numberOfLines={1}>
              {service.name}
            </Text>
          </Animated.View>
        }
      >
        {displayGroups.length > 0 ? (
          <View>
            <View onLayout={handleHeroLayout} className="justify-center pb-4 pt-4 px-0">
              <Text variant="titleLg" numberOfLines={2} className="font-bold">
                {service.name}
              </Text>
            </View>
            <WorkGroupNavigation
              groups={displayGroups}
              activeGroupId={null}
              onSelectGroup={scrollToGroup}
              onLayout={handleStickyLayout}
            />
            <View
              testID="work-group-sections"
              onLayout={handleSectionsLayout}
              className="-mx-2"
              collapsable={false}
            >
              {displayGroups.map((group) => (
                <View
                  key={group.id}
                  testID={`work-group-section-${group.id}`}
                  onLayout={(event) => handleGroupLayout(event, group.id)}
                  accessibilityRole="summary"
                  collapsable={false}
                >
                  <View className="px-2 pb-2 pt-6">
                    <Text variant="titleLg" className="font-bold">
                      {group.name}
                    </Text>
                  </View>
                  {group.works.map((work, idx) => {
                    const carted = cartedItem(work.id);
                    return (
                      <View key={work.id}>
                        {idx === 0 ? null : <View className="-mx-2 h-px bg-border" />}
                        <SkillRow
                          label={work.name}
                          imageUri={work.slug === OTHER_SKILL_SLUG ? null : work.icon}
                          icon={
                            work.slug === OTHER_SKILL_SLUG
                              ? ('ellipsis-horizontal-circle-outline' as IoniconName)
                              : undefined
                          }
                          selected={Boolean(carted) || work.id === skillId}
                          basePricePaise={work.basePricePaise}
                          pricingModel={work.pricingModel}
                          unitLabel={work.unitLabel}
                          cartItem={carted}
                          onQuantity={(quantity) => draft.setQuantity(work.id, quantity)}
                          onDuration={(durationMinutes) =>
                            draft.setDurationMinutes(work.id, durationMinutes)
                          }
                          onRemove={() => draft.removeItem(work.id)}
                          onToggle={() =>
                            work.slug === OTHER_SKILL_SLUG
                              ? selectOther(work)
                              : selectPredefined(work)
                          }
                        />
                        {idx === group.works.length - 1 ? (
                          <View className="-mx-2 h-[2px] bg-border mt-1" />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {predefined.map((skill, idx) => {
              const carted = cartedItem(skill.id);
              return (
                <View key={skill.id}>
                  {idx > 0 ? <View className="h-px bg-border" /> : null}
                  <SkillRow
                    label={skill.name}
                    imageUri={skill.icon}
                    selected={Boolean(carted) || skill.id === skillId}
                    basePricePaise={skill.basePricePaise}
                    pricingModel={skill.pricingModel}
                    unitLabel={skill.unitLabel}
                    cartItem={carted}
                    onQuantity={(quantity) => draft.setQuantity(skill.id, quantity)}
                    onDuration={(durationMinutes) =>
                      draft.setDurationMinutes(skill.id, durationMinutes)
                    }
                    onRemove={() => draft.removeItem(skill.id)}
                    onToggle={() => selectPredefined(skill)}
                  />
                </View>
              );
            })}
            {other ? (
              <View>
                {predefined.length > 0 ? <View className="h-px bg-border" /> : null}
                <SkillRow
                  label="Other"
                  icon={'ellipsis-horizontal-circle-outline' as IoniconName}
                  selected={isOther || Boolean(cartedItem(other.id))}
                  basePricePaise={other.basePricePaise}
                  pricingModel={other.pricingModel}
                  unitLabel={other.unitLabel}
                  cartItem={cartedItem(other.id)}
                  onQuantity={(quantity) => draft.setQuantity(other.id, quantity)}
                  onDuration={(durationMinutes) =>
                    draft.setDurationMinutes(other.id, durationMinutes)
                  }
                  onRemove={() => draft.removeItem(other.id)}
                  onToggle={() => selectOther(other)}
                />
                <View className="h-px bg-border" />
              </View>
            ) : null}
          </View>
        )}

        {isOther ? (
          <Input
            label="What kind of job is it?"
            placeholder="e.g. Inverter battery bank, garden setup"
            value={customText}
            onChangeText={setCustomText}
            autoCapitalize="sentences"
            maxLength={JOB_CUSTOM_SKILL_MAX}
            returnKeyType="done"
            onSubmitEditing={() => void onContinue()}
          />
        ) : null}
      </BookingStep>

      {detailsSkill ? (
        <BookingDetailsSheet
          skillName={detailsSkill.slug === OTHER_SKILL_SLUG ? customText.trim() : detailsSkill.name}
          skillIcon={detailsSkill.slug === OTHER_SKILL_SLUG ? null : detailsSkill.icon}
          pricing={detailsSkill}
          onClose={() => setDetailsSkill(null)}
          onAdd={onDetailsAdd}
        />
      ) : null}
    </View>
  );
}
