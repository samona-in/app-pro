import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import type { PopularSkill } from '@samona/types';
import { ServiceImage } from './ServiceImage';
import { SectionHeader } from './SectionHeader';

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
 * Zomato-style cards: a bordered white card with the skill artwork on top, the
 * name and its parent service beneath, and a black "Top pick" badge on the
 * first card. The rail scrolls sideways, so a skill past the second is one
 * swipe away. Every skill opens the booking flow with that skill already
 * chosen.
 *
 * The heading and the rail share the same 16px page gutter; the rail keeps
 * that gutter at both ends so the first card lines up with the heading and the
 * last card can scroll clear of the screen edge.
 */
export function PopularSkills({ skills, onSelect, onSeeAll, className }: PopularSkillsProps) {
  if (skills.length === 0) return null;

  return (
    <View testID="popular-right-now" className={className}>
      <SectionHeader
        title="Popular right now"
        className="px-4"
        actionAccessibilityLabel="See all popular skills"
        onPressAction={onSeeAll}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {skills.map((skill) => {
          const isTopPick = 'isTopPick' in skill && skill.isTopPick;

          return (
            <Pressable
              key={skill.id}
              accessibilityRole="button"
              accessibilityLabel={skill.name}
              onPress={() => onSelect(skill)}
              className="w-40 overflow-hidden rounded-2xl border border-border bg-surface active:opacity-80"
            >
              <View className="h-28 w-full">
                <ServiceImage uri={skill.icon ?? skill.service.icon} className="h-full w-full" />

                {isTopPick ? (
                  <View
                    accessibilityLabel="Top pick"
                    className="absolute left-2 top-2 rounded-full bg-black px-2 py-0.5"
                  >
                    {/* A raw label with one colour class: variants carry their
                        own colour and would compete with the white. */}
                    <RNText className="text-caption font-semibold text-white">Top pick</RNText>
                  </View>
                ) : null}
              </View>

              <View className="p-3">
                <RNText
                  numberOfLines={2}
                  className="h-9 text-footnote font-semibold text-text-primary"
                >
                  {skill.name}
                </RNText>
                <RNText numberOfLines={1} className="mt-1 text-caption text-text-muted">
                  {skill.service.name}
                </RNText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
