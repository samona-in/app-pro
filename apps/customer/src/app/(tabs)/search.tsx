import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceOption, SkillWithService } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '@/components/feedback';
import { SectionHeader } from '@/components/home/SectionHeader';
import { ServiceGrid } from '@/components/home/ServiceGrid';
import { ServiceImage } from '@/components/home/ServiceImage';
import { IconButton, Text } from '@/components/ui';
import { useServiceCategories, useServiceSearch } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { FLOATING_TAB_BAR_CLEARANCE } from '@/constants';
import { type RecentSearchItem, useSearchStore } from '@/stores/search';
import { color, elevation } from '@/theme';
import { cn } from '@/utils/cn';

export default function Search() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const draft = useBookingDraft();
  const search = useServiceSearch(query);
  const categories = useServiceCategories();

  const recents = useSearchStore((state) => state.recents);
  const addRecent = useSearchStore((state) => state.addRecent);
  const hydrateSearch = useSearchStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateSearch();
  }, [hydrateSearch]);

  const trimmed = query.trim();
  const resultServices = search.data?.services ?? [];
  const resultSkills = search.data?.skills ?? [];
  const hasResults = resultServices.length > 0 || resultSkills.length > 0;

  function handleSelectService(service: ServiceOption) {
    addRecent({ type: 'service', service });
    draft.start(service);
    router.push(`/booking/new/${service.slug}/skill`);
  }

  function handleSelectSkill(skill: SkillWithService) {
    addRecent({ type: 'skill', skill });
    const parentService: ServiceOption = {
      id: skill.service.id,
      slug: skill.service.slug,
      name: skill.service.name,
      icon: skill.service.icon,
    };
    draft.start(parentService);
    // Pre-select the skill so the skill screen is pre-populated after /place.
    // draft.start resets skill to null, so setSkill must come after.
    draft.setSkill({
      id: skill.id,
      serviceId: skill.serviceId,
      slug: skill.slug,
      name: skill.name,
      icon: skill.icon,
    });
    router.push(`/booking/new/${skill.service.slug}/skill`);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: color.surface, paddingTop: insets.top }}
    >
      {/* ── Search field ─────────────────────────────────────────────────── */}
      <View className="bg-surface px-4 pb-3 pt-2">
        <View
          style={elevation.sm}
          className="flex-row items-center rounded-2xl border border-border bg-surface"
        >
          <IconButton
            name="arrow-back"
            accessibilityLabel="Go back"
            size={20}
            // The screen is a tab now, so there is no stack to pop — the
            // arrow goes back to the tab the customer came from.
            onPress={() => router.navigate('/home')}
            className="ml-1"
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            placeholder="Search services or skills…"
            placeholderTextColor={color['text-muted']}
            accessibilityLabel="Search for a service or skill"
            className="min-h-[56px] flex-1 bg-transparent px-1 text-body-lg text-text-primary"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
              className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
            >
              <Ionicons name="close" size={16} color={color['text-secondary']} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }}
      >
        {trimmed.length < 2 ? (
          <Browse
            recents={recents}
            allServices={categories.data ?? []}
            servicesLoading={categories.isPending}
            onSelectService={handleSelectService}
            onSelectRecent={(item) => {
              if (item.type === 'service') handleSelectService(item.service);
              else handleSelectSkill(item.skill);
            }}
          />
        ) : search.isPending ? (
          <View className="items-center py-16">
            <ActivityIndicator size="small" color={color['text-secondary']} />
          </View>
        ) : search.isError ? (
          <View className="mt-6">
            <ErrorState
              title="Couldn't search"
              message="Check your connection and try again."
              onRetry={() => void search.refetch()}
            />
          </View>
        ) : !hasResults ? (
          <NoResults query={trimmed} />
        ) : (
          <SearchResults
            services={resultServices}
            skills={resultSkills}
            onSelectService={handleSelectService}
            onSelectSkill={handleSelectSkill}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface BrowseProps {
  recents: RecentSearchItem[];
  allServices: ServiceOption[];
  servicesLoading?: boolean;
  onSelectService: (s: ServiceOption) => void;
  onSelectRecent: (item: RecentSearchItem) => void;
}

/**
 * What the screen shows before a query is typed: recents as wrapping chips and
 * every category as the same 4-up grid the home screen uses, so the customer
 * can browse just as easily as searching.
 */
function Browse({
  recents,
  allServices,
  servicesLoading = false,
  onSelectService,
  onSelectRecent,
}: BrowseProps) {
  const empty = !servicesLoading && recents.length === 0 && allServices.length === 0;

  return (
    <View className="pt-1">
      {recents.length > 0 ? (
        <View className="px-4">
          <SectionHeader title="Recent searches" className="mb-3" />

          <View className="flex-row flex-wrap gap-2">
            {recents.map((item) => (
              <RecentChip key={itemKey(item)} item={item} onPress={() => onSelectRecent(item)} />
            ))}
          </View>
        </View>
      ) : null}

      {allServices.length > 0 || servicesLoading ? (
        <View className={cn('px-4', recents.length > 0 && 'mt-7')}>
          <SectionHeader
            title="Browse services"
            subtitle="Every category, one tap away"
            className="mb-4"
          />

          {servicesLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={color['text-secondary']} />
            </View>
          ) : (
            <ServiceGrid services={allServices} onSelect={onSelectService} />
          )}
        </View>
      ) : null}

      {empty ? (
        <View className="items-center px-8 pt-20">
          <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
            <Ionicons name="search-outline" size={26} color={color['text-muted']} />
          </View>
          <Text variant="title" className="text-center">
            Search SAMONA
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-secondary">
            Find a service like "Plumbing", or a skill like "Leak repair".
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface RecentChipProps {
  item: RecentSearchItem;
  onPress: () => void;
}

/**
 * A recent search, as a chip: the artwork and the name, sized to sit in a
 * wrapping row. Chips wrap rather than scroll, so every recent stays one tap
 * away.
 */
function RecentChip({ item, onPress }: RecentChipProps) {
  const imageUri =
    item.type === 'service' ? item.service.icon : (item.skill.icon ?? item.skill.service.icon);
  const title = item.type === 'service' ? item.service.name : item.skill.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="max-w-full flex-row items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3 active:opacity-70"
    >
      <ServiceImage uri={imageUri} className="h-7 w-7 rounded-full" />
      <Text variant="footnote" className="shrink text-text-primary">
        {title}
      </Text>
      <Ionicons name="time-outline" size={14} color={color['text-muted']} />
    </Pressable>
  );
}

interface SearchResultsProps {
  services: ServiceOption[];
  skills: SkillWithService[];
  onSelectService: (s: ServiceOption) => void;
  onSelectSkill: (s: SkillWithService) => void;
}

/**
 * Search hits, grouped into the same two quiet cards: services first, then the
 * skills that live under them. A divider starts at the text column, so each
 * card reads as a single object rather than a stack of boxes.
 */
function SearchResults({ services, skills, onSelectService, onSelectSkill }: SearchResultsProps) {
  return (
    <View className="pt-1">
      {services.length > 0 ? (
        <View className="px-4">
          <SectionHeader
            title="Services"
            subtitle={services.length === 1 ? '1 match' : `${services.length} matches`}
            className="mb-3"
          />

          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {services.map((service, index) => (
              <View key={service.id}>
                {index > 0 ? <View className="ml-24 mr-3 h-px bg-border" /> : null}
                <ResultRow
                  imageUri={service.icon}
                  imageLabel={service.name}
                  title={service.name}
                  subtitle="View all skills"
                  onPress={() => onSelectService(service)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {skills.length > 0 ? (
        <View className={cn('px-4', services.length > 0 && 'mt-7')}>
          <SectionHeader
            title="Skills"
            subtitle={skills.length === 1 ? '1 match' : `${skills.length} matches`}
            className="mb-3"
          />

          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {skills.map((skill, index) => (
              <View key={skill.id}>
                {index > 0 ? <View className="ml-24 mr-3 h-px bg-border" /> : null}
                <ResultRow
                  imageUri={skill.icon ?? skill.service.icon}
                  imageLabel={skill.name}
                  title={skill.name}
                  subtitle={skill.service.name}
                  onPress={() => onSelectSkill(skill)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface ResultRowProps {
  imageUri: string | null;
  imageLabel: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function ResultRow({ imageUri, imageLabel, title, subtitle, onPress }: ResultRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-3 px-3 py-3 active:bg-surface-muted"
    >
      <ServiceImage
        uri={imageUri}
        accessibilityLabel={imageLabel}
        className="h-14 w-14 rounded-lg"
      />
      <View className="flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" className="mt-0.5 text-text-secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <View className="items-center px-8 pt-20">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons name="search-outline" size={26} color={color['text-muted']} />
      </View>
      <Text variant="title" className="text-center">
        No matches
      </Text>
      <Text variant="body" className="mt-2 text-center text-text-secondary">
        Nothing matched "{query}". Try another service or skill.
      </Text>
    </View>
  );
}

function itemKey(item: RecentSearchItem): string {
  return item.type === 'service' ? `service:${item.service.id}` : `skill:${item.skill.id}`;
}
