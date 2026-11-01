import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  type ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import type { ServiceWorkGroupWithWorks, SkillOption } from '@samona/types';
import { JOB_CUSTOM_SKILL_MAX, JOB_CUSTOM_SKILL_MIN, OTHER_SKILL_SLUG } from '@samona/types';
import { BookingStep } from '@/components/booking/BookingStep';
import { SelectableTile } from '@/components/booking/SelectableTile';
import { WorkGroupNavigation } from '@/components/booking/WorkGroupNavigation';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Input, Text } from '@/components/ui';
import { useServiceCategories, useServiceSkills, useServiceWorkGroups } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import {
  activeWorkGroupAtOffset,
  workGroupScrollOffset,
} from '@/components/booking/work-groups-scroll';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function BookingSkill() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const skills = useServiceSkills(slug);
  const workGroups = useServiceWorkGroups(slug);
  const categories = useServiceCategories();
  const draft = useBookingDraft();
  const [skillId, setSkillId] = useState<string | null>(draft.skill?.id ?? null);
  const [customText, setCustomText] = useState(draft.customSkill);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentTop = useRef(0);
  const groupListTop = useRef(0);
  const groupSectionTops = useRef(new Map<string, number>());
  const absoluteSectionTops = useRef(new Map<string, number>());

  // Resolve the service from the route first. A deep link can land here before
  // the draft has a service, and a previous draft may belong to another slug.
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

  // During a gradual rollout, keep any active work without a group visible in
  // its own clearly named section instead of dropping or misclassifying it.
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

  const resolvedActiveGroupId = displayGroups.some((group) => group.id === activeGroupId)
    ? activeGroupId
    : (displayGroups[0]?.id ?? null);

  const allWorks =
    displayGroups.length > 0 ? displayGroups.flatMap((group) => group.works) : (skills.data ?? []);
  const other = allWorks.find((item) => item.slug === OTHER_SKILL_SLUG) ?? null;
  const predefined = allWorks.filter((item) => item.slug !== OTHER_SKILL_SLUG);
  const isOther = skillId === other?.id;
  const customLength = customText.trim().length;
  const canContinue = isOther
    ? customLength >= JOB_CUSTOM_SKILL_MIN && customLength <= JOB_CUSTOM_SKILL_MAX
    : skillId !== null;

  function goToDetails() {
    router.push(`/booking/new/${slug}/details`);
  }

  // A predefined skill is the whole answer, so a tap commits it and moves on
  // without a separate Continue press.
  function selectPredefined(skill: SkillOption) {
    draft.setSkill(skill);
    goToDetails();
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
      goToDetails();
    }
  }

  function handleGroupLayout(event: LayoutChangeEvent, groupId: string) {
    const top = event.nativeEvent.layout.y;
    groupSectionTops.current.set(groupId, top);
    absoluteSectionTops.current.set(groupId, groupListTop.current + top);
  }

  function handleGroupListLayout(event: LayoutChangeEvent) {
    groupListTop.current = event.nativeEvent.layout.y;
    for (const [groupId, top] of groupSectionTops.current) {
      absoluteSectionTops.current.set(groupId, groupListTop.current + top);
    }
  }

  function scrollToGroup(groupId: string) {
    const sectionTop = absoluteSectionTops.current.get(groupId);
    if (sectionTop === undefined) return;

    setActiveGroupId(groupId);
    scrollRef.current?.scrollTo({
      y: workGroupScrollOffset({
        contentTop: contentTop.current,
        sectionTop,
        stickyHeight,
      }),
      animated: true,
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (displayGroups.length === 0) return;
    const positions = displayGroups.flatMap((group) => {
      const top = absoluteSectionTops.current.get(group.id);
      return top === undefined ? [] : [{ id: group.id, top: contentTop.current + top }];
    });
    const activeId = activeWorkGroupAtOffset(positions, {
      scrollY: event.nativeEvent.contentOffset.y,
      stickyHeight,
    });
    if (activeId) setActiveGroupId((current) => (current === activeId ? current : activeId));
  }

  function handleContentLayout(event: LayoutChangeEvent) {
    contentTop.current = event.nativeEvent.layout.y;
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
      <BookingStep
        step={1}
        service={service ? { name: service.name, icon: service.icon } : undefined}
      >
        <EmptyState
          icon="construct-outline"
          title="Work types coming soon"
          message="There aren't any bookable work types for this service yet."
        />
      </BookingStep>
    );
  }

  return (
    <BookingStep
      step={1}
      service={service ? { name: service.name, icon: service.icon } : undefined}
      stickyContent={
        displayGroups.length > 0 ? (
          <WorkGroupNavigation
            groups={displayGroups}
            activeGroupId={resolvedActiveGroupId}
            onSelectGroup={scrollToGroup}
            onLayout={handleStickyLayout}
          />
        ) : undefined
      }
      scrollRef={scrollRef}
      onScroll={displayGroups.length > 0 ? handleScroll : undefined}
      onContentLayout={handleContentLayout}
      primaryDisabled={!canContinue}
      onPrimary={isOther ? () => void onContinue() : undefined}
    >
      {displayGroups.length > 0 ? (
        <View onLayout={handleGroupListLayout} className="gap-8">
          {displayGroups.map((group) => (
            <View
              key={group.id}
              onLayout={(event) => handleGroupLayout(event, group.id)}
              accessibilityRole="summary"
              className="gap-3"
            >
              <View className="flex-row items-end justify-between gap-3">
                <Text variant="title" className="flex-1">
                  {group.name}
                </Text>
                <Text variant="caption" className="pb-0.5">
                  {group.works.length} {group.works.length === 1 ? 'work' : 'works'}
                </Text>
              </View>
              <View className="-mx-1 flex-row flex-wrap">
                {group.works.map((work) => (
                  <View key={work.id} className="w-1/4 px-1 pb-4">
                    <SelectableTile
                      label={work.name}
                      imageUri={work.slug === OTHER_SKILL_SLUG ? null : work.icon}
                      icon={
                        work.slug === OTHER_SKILL_SLUG
                          ? ('ellipsis-horizontal-circle-outline' as IoniconName)
                          : undefined
                      }
                      selected={work.id === skillId}
                      onToggle={() =>
                        work.slug === OTHER_SKILL_SLUG ? selectOther(work) : selectPredefined(work)
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View className="-mx-1 flex-row flex-wrap">
          {predefined.map((skill) => (
            <View key={skill.id} className="w-1/4 px-1 pb-4">
              <SelectableTile
                label={skill.name}
                imageUri={skill.icon}
                selected={skill.id === skillId}
                onToggle={() => selectPredefined(skill)}
              />
            </View>
          ))}
          {other ? (
            <View className="w-1/4 px-1 pb-4">
              <SelectableTile
                label="Other"
                icon={'ellipsis-horizontal-circle-outline' as IoniconName}
                selected={isOther}
                onToggle={() => selectOther(other)}
              />
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
  );
}
