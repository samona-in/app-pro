import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { color } from '@/theme';

const JOURNEY_ICONS = ['map-outline', 'location-outline', 'home-outline'] as const;

/**
 * Announcement banner that coaches the pro towards better outcomes: keep the
 * location on and answer requests fast. A signal icon leads the copy, and a
 * map → pin → home sweep illustrates the journey to a completed job.
 */
export function EarnMoreBanner() {
  return (
    <Card className="mt-6 border-0 bg-brand-soft">
      <View className="flex-row items-center gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-brand">
          <Ionicons name="cellular" size={18} color={color['brand-contrast']} />
        </View>
        <Text variant="title">Earn more with Samona</Text>
      </View>
      <Text variant="footnote" className="mt-2 text-text-secondary">
        Keep your location on and respond quickly when a job request arrives.
      </Text>
      <View className="mt-4 flex-row items-center justify-center gap-8">
        {JOURNEY_ICONS.map((name, index) => (
          <Ionicons
            key={name}
            name={name}
            size={index === 1 ? 22 : 26}
            color={color['brand-muted']}
            style={{ opacity: 0.5 + index * 0.25 }}
          />
        ))}
      </View>
    </Card>
  );
}
