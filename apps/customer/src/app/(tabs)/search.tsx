import { useEffect } from 'react';
import { useState } from 'react';
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
import { ServiceCard } from '@/components/home/ServiceCard';
import { ServiceImage } from '@/components/home/ServiceImage';
import { IconButton, Text } from '@/components/ui';
import { useServiceCategories, useServiceSearch } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { type RecentSearchItem, useSearchStore } from '@/stores/search';
import { color } from '@/theme';

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
      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <View className="px-5 pb-3">
        <View className="flex-row items-center rounded-xl border border-border bg-surface">
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
            className="min-h-[52px] flex-1 bg-transparent px-2 text-body text-text-primary"
          />
        </View>
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {trimmed.length < 2 ? (
          <EmptyState
            recents={recents}
            allServices={categories.data ?? []}
            onSelectService={handleSelectService}
            onSelectRecent={(item) => {
              if (item.type === 'service') handleSelectService(item.service);
              else handleSelectSkill(item.skill);
            }}
          />
        ) : search.isPending ? (
          <View className="items-center px-5 py-8">
            <ActivityIndicator size="small" color={color.brand} />
          </View>
        ) : search.isError ? (
          <View className="px-5 py-8">
            <Text variant="body" className="text-text-secondary">
              Couldn't search — check your connection and try again.
            </Text>
          </View>
        ) : !hasResults ? (
          <View className="px-5 py-8">
            <Text variant="body" className="text-text-secondary">
              No results for "{trimmed}".
            </Text>
          </View>
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

interface EmptyStateProps {
  recents: RecentSearchItem[];
  allServices: ServiceOption[];
  onSelectService: (s: ServiceOption) => void;
  onSelectRecent: (item: RecentSearchItem) => void;
}

function EmptyState({ recents, allServices, onSelectService, onSelectRecent }: EmptyStateProps) {
  return (
    <>
      {/* Recently searched */}
      {recents.length > 0 ? (
        <View className="mb-2">
          <Text variant="label" className="mb-2 px-5 pt-2">
            Recent
          </Text>
          <View className="flex-row flex-wrap gap-2 px-5">
            {recents.map((item) => (
              <RecentChip key={itemKey(item)} item={item} onPress={() => onSelectRecent(item)} />
            ))}
          </View>
        </View>
      ) : null}

      {/* All services — horizontal strip */}
      {allServices.length > 0 ? (
        <View>
          {recents.length > 0 ? <View className="my-2 h-px bg-border" /> : null}
          <Text variant="label" className="mb-3 px-5 pt-2">
            Services
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
          >
            {allServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onPress={() => onSelectService(service)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Shown only when there is absolutely nothing to display */}
      {recents.length === 0 && allServices.length === 0 ? (
        <View className="px-5 py-8">
          <Text variant="body" className="text-text-secondary">
            Search for a service like "Plumbing", or a skill like "Leak repair".
          </Text>
        </View>
      ) : null}
    </>
  );
}

interface RecentChipProps {
  item: RecentSearchItem;
  onPress: () => void;
}

/**
 * A recent search, as a chip: the artwork and the name, sized to sit in a
 * wrapping row. Chips wrap rather than scroll, so every recent stays one tap
 * away — and the screen already has a horizontal strip further down.
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
      className="max-w-full flex-row items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-2.5 active:opacity-70"
    >
      <ServiceImage uri={imageUri} className="h-6 w-6 rounded-full" />
      <Text variant="footnote" className="shrink text-text-primary">
        {title}
      </Text>
      <Ionicons name="time-outline" size={14} color={color['text-secondary']} />
    </Pressable>
  );
}

interface SearchResultsProps {
  services: ServiceOption[];
  skills: SkillWithService[];
  onSelectService: (s: ServiceOption) => void;
  onSelectSkill: (s: SkillWithService) => void;
}

function SearchResults({ services, skills, onSelectService, onSelectSkill }: SearchResultsProps) {
  return (
    <>
      {services.length > 0 ? (
        <View className="mb-2 px-5">
          <Text variant="label" className="mb-1 mt-2">
            Services
          </Text>
          {services.map((service) => (
            <ResultRow
              key={service.id}
              imageUri={service.icon}
              imageLabel={service.name}
              title={service.name}
              subtitle="View all skills"
              onPress={() => onSelectService(service)}
            />
          ))}
        </View>
      ) : null}

      {skills.length > 0 ? (
        <View className="px-5">
          {services.length > 0 ? <View className="my-1 h-px bg-border" /> : null}
          <Text variant="label" className="mb-1 mt-2">
            Skills
          </Text>
          {skills.map((skill) => (
            <ResultRow
              key={skill.id}
              imageUri={skill.service.icon}
              imageLabel={skill.service.name}
              title={skill.name}
              subtitle={skill.service.name}
              onPress={() => onSelectSkill(skill)}
            />
          ))}
        </View>
      ) : null}
    </>
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
      className="flex-row items-center py-3 active:opacity-70"
    >
      <ServiceImage
        uri={imageUri}
        accessibilityLabel={imageLabel}
        className="h-12 w-12 rounded-xl"
      />
      <View className="ml-3 flex-1">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" className="text-text-secondary">
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color['text-secondary']} />
    </Pressable>
  );
}

function itemKey(item: RecentSearchItem): string {
  return item.type === 'service' ? `service:${item.service.id}` : `skill:${item.skill.id}`;
}
