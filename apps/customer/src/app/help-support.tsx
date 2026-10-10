import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text } from '@/components/ui';
import {
  APP_VERSION,
  FAQS,
  PRIVACY_URL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  TERMS_URL,
  supportEmailUrl,
  type FaqCategory,
} from '@/constants/support';
import { color } from '@/theme';
import { openExternalUrl } from '@/utils/open-url';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const FAQ_CATEGORIES: readonly FaqCategory[] = ['Booking', 'Payment', 'Account', 'Safety'];

interface LinkRowProps {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
  trailingValue?: string;
  last?: boolean;
}

/** A flat, borderless settings-style row (no card), matching the profile tab. */
function LinkRow({ icon, label, onPress, trailingValue, last }: LinkRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      className="bg-background py-2.5 active:opacity-70"
    >
      <View className="flex-row items-center">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
          <Ionicons name={icon} size={18} color={color['text-secondary']} />
        </View>
        <Text variant="body" className="ml-3 flex-1">
          {label}
        </Text>
        {trailingValue ? (
          <Text variant="body" className="text-text-secondary">
            {trailingValue}
          </Text>
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
        ) : null}
      </View>
      {!last ? <View className="my-2 -mx-5 h-px bg-border" /> : null}
    </Pressable>
  );
}

interface FaqRowProps {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
  last: boolean;
}

function FaqRow({ question, answer, open, onToggle, last }: FaqRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={question}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="bg-background py-2.5 active:opacity-70"
    >
      <View className="flex-row items-center">
        <Text variant="body" className="flex-1 pr-2">
          {question}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={color['text-muted']}
        />
      </View>
      {open ? (
        <Text variant="footnote" className="mt-1.5 pr-6 text-text-secondary">
          {answer}
        </Text>
      ) : null}
      {!last ? <View className="my-2 -mx-5 h-px bg-border" /> : null}
    </Pressable>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <Text variant="label" className="mt-6 first:mt-4">
      {children}
    </Text>
  );
}

export default function HelpSupport() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggleFaq(index: number) {
    setOpenIndex((current) => (current === index ? null : index));
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <SectionHeading>Contact us</SectionHeading>
      <View className="mt-1">
        <LinkRow
          icon="call-outline"
          label="Call support"
          onPress={() =>
            openExternalUrl(
              `tel:${SUPPORT_PHONE}`,
              'Could not start the call',
              'No app on this device can place calls.',
            )
          }
        />
        <LinkRow
          icon="logo-whatsapp"
          label="WhatsApp"
          onPress={() =>
            openExternalUrl(
              `https://wa.me/${SUPPORT_WHATSAPP}`,
              'Could not open WhatsApp',
              'No app on this device can open WhatsApp.',
            )
          }
        />
        <LinkRow
          icon="mail-outline"
          label="Email us"
          last
          onPress={() =>
            openExternalUrl(
              supportEmailUrl(),
              'Could not open email',
              'No app on this device can send email.',
            )
          }
        />
      </View>

      <SectionHeading>Report an issue</SectionHeading>
      <View className="mt-1">
        <LinkRow
          icon="flag-outline"
          label="Report an issue"
          last
          onPress={() =>
            openExternalUrl(
              supportEmailUrl('Support request - Samona'),
              'Could not open email',
              'No app on this device can send email.',
            )
          }
        />
      </View>

      <SectionHeading>FAQ</SectionHeading>
      <View className="mt-1">
        {FAQ_CATEGORIES.map((category) => {
          const entries = FAQS.filter((entry) => entry.category === category);
          const firstIndex = FAQS.findIndex((entry) => entry.category === category);
          return (
            <View key={category}>
              <Text variant="caption" className="mt-4 font-semibold text-text-muted">
                {category}
              </Text>
              {entries.map((entry, entryIndex) => {
                const globalIndex = firstIndex + entryIndex;
                const isLast =
                  globalIndex === FAQS.length - 1 || FAQS[globalIndex + 1]?.category !== category;
                return (
                  <FaqRow
                    key={entry.question}
                    question={entry.question}
                    answer={entry.answer}
                    open={openIndex === globalIndex}
                    onToggle={() => toggleFaq(globalIndex)}
                    last={isLast}
                  />
                );
              })}
            </View>
          );
        })}
      </View>

      <SectionHeading>About</SectionHeading>
      <View className="mt-1">
        <LinkRow
          icon="information-circle-outline"
          label="App version"
          trailingValue={APP_VERSION}
        />
        <LinkRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() =>
            openExternalUrl(
              TERMS_URL,
              'Could not open page',
              'Check your connection and try again.',
            )
          }
        />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          last
          onPress={() =>
            openExternalUrl(
              PRIVACY_URL,
              'Could not open page',
              'Check your connection and try again.',
            )
          }
        />
      </View>
    </Screen>
  );
}
