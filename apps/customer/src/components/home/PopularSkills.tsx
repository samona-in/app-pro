import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PopularSkill } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface PopularSkillsProps {
  /** The curated skills, in the order the server returned them. */
  skills: PopularSkill[];
  /** Fired when a skill is tapped. */
  onSelect: (skill: PopularSkill) => void;
  /** Fired when "See all" is tapped. */
  onSeeAll?: () => void;
  className?: string;
}

/**
 * The "Popular right now" rail under the service grid on the customer home.
 *
 * Deliberately not a row of cards: the artwork and the type carry the section
 * on their own, with no box, border or shadow around a skill. The rail
 * scrolls sideways, so a skill past the third is one swipe away.
 *
 * The first skill is flagged as the top pick, and every skill opens the
 * booking flow with that skill already chosen.
 */
export function PopularSkills({ skills, onSelect, onSeeAll, className }: PopularSkillsProps) {
  if (skills.length === 0) return null;

  return (
    <View className={cn('pb-2', className)}>
      <View className="flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="flame" size={16} color={color.brand} />
          <Text variant="bodyLg" className="font-semibold text-text-primary">
            Popular right now
          </Text>
        </View>

        {onSeeAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all popular skills"
            onPress={onSeeAll}
            className="flex-row items-center active:opacity-70"
          >
            <Text variant="footnote" className="font-semibold text-brand">
              See all
            </Text>
            <Ionicons name="chevron-forward" size={13} color={color.brand} />
          </Pressable>
        ) : null}
      </View>

      {/* The rail bleeds to the screen edge on the right, but the first skill
          keeps the same 16px inset as the heading above it — a negative
          margin here would push the first artwork off the left of the screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-4"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
      >
        {skills.map((skill, index) => (
          <Pressable
            key={skill.id}
            accessibilityRole="button"
            accessibilityLabel={skill.name}
            onPress={() => onSelect(skill)}
            className="w-24"
          >
            <View>
              <ServiceImage
                uri={skill.icon ?? skill.service.icon}
                className="h-16 w-16 rounded-xl"
              />
              {index === 0 ? (
                <View className="absolute -left-2 -top-2 flex-row items-center gap-0.5 rounded-full border-2 border-background bg-warning-surface px-1.5 py-0.5">
                  <Ionicons name="flame" size={9} color={color.warning} />
                  <Text className="text-[10px] font-bold leading-[12px] text-warning">Top</Text>
                </View>
              ) : null}
            </View>

            <Text
              numberOfLines={2}
              variant="footnote"
              className="mt-2 h-9 font-semibold text-text-primary"
            >
              {skill.name}
            </Text>
            <Text numberOfLines={1} variant="caption" className="text-text-muted">
              {skill.service.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
