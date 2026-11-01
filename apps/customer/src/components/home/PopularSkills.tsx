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
    <View testID="popular-right-now" className={cn('pb-2 pl-4', className)}>
      <View className="flex-row items-center justify-between px-2">
        <View className="flex-row items-center gap-1.5">
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

      {/* The section is inset on the left only — a 16px gutter so the rail sits
          clear of the screen edge — and runs full-bleed to the right, so the
          next skill peeks in from the edge as the rail scrolls. Inside that
          gutter the heading and the first skill both land at 24px, and the 8px
          start padding leaves room for the top-pick badge, which overhangs the
          artwork's corner and would otherwise be clipped by the rail. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-1"
        contentContainerStyle={{ paddingLeft: 8, paddingTop: 12, gap: 4 }}
      >
        {skills.map((skill) => (
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
                className="h-16 w-16 rounded-lg"
              />
              {'isTopPick' in skill && skill.isTopPick ? (
                <View
                  accessibilityLabel="Top pick"
                  className="absolute -left-2 -top-2 h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-warning-surface"
                >
                  <Ionicons name="trending-up" size={13} color={color.warning} />
                </View>
              ) : null}
            </View>

            {/* The name carries the item, so it gets the strongest colour and
                the type, not weight, to make it read: plain black on regular
                weight. The two-line box keeps every service label in the rail
                on the same baseline. */}
            <Text numberOfLines={2} variant="footnote" className="mt-[2px] h-10 text-black">
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
