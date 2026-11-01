import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  View,
  type ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceWorkGroupWithWorks, SkillOption } from '@samona/types';
import { JOB_CUSTOM_SKILL_MAX, JOB_CUSTOM_SKILL_MIN, OTHER_SKILL_SLUG } from '@samona/types';
import { BookingDetailsSheet } from '@/components/booking/BookingDetailsSheet';
import { BookingStep } from '@/components/booking/BookingStep';
import { WorkGroupNavigation } from '@/components/booking/WorkGroupNavigation';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Input, Text } from '@/components/ui';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import { useServiceCategories, useServiceSkills, useServiceWorkGroups } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { activeWorkGroupAtOffset } from '@/components/booking/work-groups-scroll';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function SkillRow({
  label,
  imageUri,
  icon,
  selected,
  onToggle,
  basePricePaise,
}: {
  label: string;
  imageUri?: string | null;
  icon?: IoniconName;
  selected: boolean;
  onToggle: () => void;
  basePricePaise?: number | null;
}) {
  const hasImage = isImageUrl(imageUri ?? null);
  const height = Dimensions.get('window').height / 4;
  const priceText = basePricePaise ? `Starts at ₹ ${Math.round(basePricePaise / 100)}` : null;

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
            'aspect-square h-[112px] w-[112px] items-center justify-center overflow-hidden rounded-md border',
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
          <View
            style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 16,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#2563eb',
            }}
          >
            <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '600' }}>Book now</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function BookingSkill() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const skills = useServiceSkills(slug);
  const workGroups = useServiceWorkGroups(slug);
  const categories = useServiceCategories();
  const draft = useBookingDraft();
  const [skillId, setSkillId] = useState<string | null>(draft.skill?.id ?? null);
  const [customText, setCustomText] = useState(draft.customSkill);
  /** The work whose details sheet is open; null while browsing the catalogue. */
  const [detailsSkill, setDetailsSkill] = useState<SkillOption | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentTop = useRef(0);
  const groupListTop = useRef(0);
  const groupSectionTops = useRef(new Map<string, number>());
  const absoluteSectionTops = useRef(new Map<string, number>());
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
    if (service && draft.service?.id !== service.id) {
      draft.start(service);
    }
  }, [draft.service?.id, draft.start, service]);

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
    draft.setSkill(skill);
    setDetailsSkill(skill);
  }

  function selectOther(skill: SkillOption) {
    if (skillId === skill.id) return;
    setSkillId(skill.id);
    setCustomText('');
  }

  function onContinue() {
    if (!canContinue) return;
    if (isOther && other) {
      draft.setSkill(other, customText.trim());
      setDetailsSkill(other);
    }
  }

  function onDetailsContinue(description: string) {
    draft.setDescription(description);
    draft.setBasePay(detailsSkill?.basePricePaise ?? 0);
    setDetailsSkill(null);
    router.push(`/booking/new/${slug}/review`);
  }

  function handleGroupLayout(event: LayoutChangeEvent, groupId: string) {
    const top = event.nativeEvent.layout.y;
    groupSectionTops.current.set(groupId, top);
    absoluteSectionTops.current.set(groupId, top);
  }

  function handleGroupListLayout(event: LayoutChangeEvent) {
    groupListTop.current = event.nativeEvent.layout.y;
    for (const [groupId, top] of groupSectionTops.current) {
      absoluteSectionTops.current.set(groupId, top);
    }
  }

  function scrollToGroup(groupId: string) {
    const sectionTop = absoluteSectionTops.current.get(groupId);
    if (sectionTop === undefined) return;

    setActiveGroupId(groupId);
    scrollRef.current?.scrollTo({ y: Math.max(0, sectionTop - 10), animated: true });
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
      const top = absoluteSectionTops.current.get(group.id);
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
    for (const [groupId, top] of groupSectionTops.current) {
      absoluteSectionTops.current.set(groupId, top);
    }
  }

  function handleHeroLayout(event: LayoutChangeEvent) {
    heroTop.current = event.nativeEvent.layout.y + contentTop.current;
    for (const [groupId, top] of groupSectionTops.current) {
      absoluteSectionTops.current.set(groupId, top);
    }
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
      <BookingStep
        step={1}
        service={undefined}
        scrollRef={scrollRef}
        onScroll={handleScroll}
        onContentLayout={handleContentLayout}
        primaryDisabled={!canContinue}
        onPrimary={undefined}
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
            <View onLayout={handleGroupListLayout}>
              <WorkGroupNavigation
                groups={displayGroups}
                activeGroupId={null}
                onSelectGroup={(groupId) => {
                  const sectionTop = absoluteSectionTops.current.get(groupId);
                  if (sectionTop !== undefined) {
                    scrollRef.current?.scrollTo({
                      y: Math.max(0, sectionTop - 20),
                      animated: true,
                    });
                    setActiveGroupId(groupId);
                    return;
                  }
                  scrollToGroup(groupId);
                }}
                onLayout={handleStickyLayout}
              />
            </View>
            <View className="-mx-2">
              {displayGroups.map((group) => (
                <View
                  key={group.id}
                  onLayout={(event) => handleGroupLayout(event, group.id)}
                  accessibilityRole="summary"
                  collapsable={false}
                >
                  <View className="px-2 pb-2 pt-6">
                    <Text variant="titleLg" className="font-bold">
                      {group.name}
                    </Text>
                  </View>
                  {group.works.map((work, idx) => (
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
                        selected={work.id === skillId}
                        basePricePaise={work.basePricePaise}
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
                  ))}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {predefined.map((skill, idx) => (
              <View key={skill.id}>
                {idx > 0 ? <View className="h-px bg-border" /> : null}
                <SkillRow
                  label={skill.name}
                  imageUri={skill.icon}
                  selected={skill.id === skillId}
                  onToggle={() => selectPredefined(skill)}
                />
              </View>
            ))}
            {other ? (
              <View>
                {predefined.length > 0 ? <View className="h-px bg-border" /> : null}
                <SkillRow
                  label="Other"
                  icon={'ellipsis-horizontal-circle-outline' as IoniconName}
                  selected={isOther}
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

        {false && skillId && !isOther ? (
          <View
            style={{ position: 'absolute', bottom: -50, left: 0, right: 0, alignItems: 'center' }}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => {
                const skill = allWorks.find((item) => item.id === skillId);
                if (skill && skill.slug !== OTHER_SKILL_SLUG) {
                  selectPredefined(skill);
                }
              }}
              className="mb-12 bg-brand px-10 py-3 rounded-full active:opacity-90"
              style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }}
            >
              <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                Book now
              </Text>
            </Pressable>
          </View>
        ) : null}
      </BookingStep>

      {detailsSkill ? (
        <BookingDetailsSheet
          skillName={detailsSkill.slug === OTHER_SKILL_SLUG ? customText.trim() : detailsSkill.name}
          skillIcon={detailsSkill.slug === OTHER_SKILL_SLUG ? null : detailsSkill.icon}
          basePricePaise={detailsSkill.basePricePaise ?? null}
          onClose={() => setDetailsSkill(null)}
          onContinue={onDetailsContinue}
        />
      ) : null}
    </View>
  );
}
