import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceOption, SkillWithService } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Input, Text } from '@/components/ui';
import { useServiceSearch } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { color } from '@/theme';

export default function Search() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const draft = useBookingDraft();
  const search = useServiceSearch(query);

  const trimmed = query.trim();
  const services = search.data?.services ?? [];
  const skills = search.data?.skills ?? [];
  const hasResults = services.length > 0 || skills.length > 0;

  function handleSelectService(service: ServiceOption) {
    draft.start(service);
    router.push(`/booking/new/${service.slug}/skill`);
  }

  function handleSelectSkill(skill: SkillWithService) {
    const parentService: ServiceOption = {
      id: skill.service.id,
      slug: skill.service.slug,
      name: skill.service.name,
      icon: null,
    };
    draft.start(parentService);
    draft.setSkill({
      id: skill.id,
      serviceId: skill.serviceId,
      slug: skill.slug,
      name: skill.name,
    });
    router.push(`/booking/new/${skill.service.slug}/skill`);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: color.background, paddingTop: insets.top }}
    >
      <View className="flex-row items-center gap-1 px-2 pb-3">
        <IconButton name="arrow-back" accessibilityLabel="Go back" onPress={() => router.back()} />
        <View className="flex-1">
          <Input
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            placeholder="Search services or skills…"
            accessibilityLabel="Search for a service or skill"
            containerClassName="w-full"
          />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {trimmed.length < 2 ? (
          <View className="px-5 py-8">
            <Text variant="body" className="text-text-secondary">
              Search for a service like "Plumbing", or a skill like "Leak repair".
            </Text>
          </View>
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
          <>
            {services.length > 0 ? (
              <View className="mb-2 px-5">
                <Text variant="label" className="mb-1 mt-2">
                  Services
                </Text>
                {services.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={service.name}
                    onPress={() => handleSelectService(service)}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: color['surface-muted'] }}
                    >
                      <Ionicons name="grid-outline" size={20} color={color.brand} />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text variant="bodyStrong">{service.name}</Text>
                      <Text variant="caption" className="text-text-secondary">
                        View all skills
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={color['text-secondary']} />
                  </Pressable>
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
                  <Pressable
                    key={skill.id}
                    accessibilityRole="button"
                    accessibilityLabel={skill.name}
                    onPress={() => handleSelectSkill(skill)}
                    className="flex-row items-center py-3 active:opacity-70"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: color['surface-muted'] }}
                    >
                      <Ionicons name="construct-outline" size={20} color={color.brand} />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text variant="bodyStrong">{skill.name}</Text>
                      <Text variant="caption" className="text-text-secondary">
                        {skill.service.name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={color['text-secondary']} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
