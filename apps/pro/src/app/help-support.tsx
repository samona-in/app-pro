import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Card, Divider, Screen, Text } from '@/components/ui';
import {
  APP_VERSION,
  FAQ_CATEGORY_KEYS,
  FAQS,
  PRIVACY_URL,
  SUPPORT_ISSUE_SUBJECT,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  TERMS_URL,
  supportEmailUrl,
} from '@/constants/support';
import { color } from '@/theme';
import { openExternalUrl } from '@/utils/open-url';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function SectionHeading({ children }: { children: string }) {
  return (
    <Text variant="label" className="mt-6 first:mt-4">
      {children}
    </Text>
  );
}

interface LinkRowProps {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
  trailingValue?: string;
}

/** A pro-style settings row for placing an external call / link. */
function LinkRow({ icon, label, onPress, trailingValue }: LinkRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
    >
      <Ionicons name={icon} size={20} color={color['text-secondary']} />
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
    </Pressable>
  );
}

interface FaqRowProps {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}

function FaqRow({ question, answer, open, onToggle }: FaqRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={question}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="min-h-[56px] justify-center px-4 py-2.5 active:opacity-60"
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
    </Pressable>
  );
}

export default function HelpSupport() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggleFaq(index: number) {
    setOpenIndex((current) => (current === index ? null : index));
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <SectionHeading>{t('helpSupport.sections.contactUs')}</SectionHeading>
      <Card className="mt-1" padded={false}>
        <LinkRow
          icon="call-outline"
          label={t('helpSupport.rows.callSupport')}
          onPress={() =>
            openExternalUrl(
              `tel:${SUPPORT_PHONE}`,
              t('helpSupport.errors.callFailedTitle'),
              t('helpSupport.errors.callFailedMessage'),
            )
          }
        />
        <Divider />
        <LinkRow
          icon="logo-whatsapp"
          label={t('helpSupport.rows.whatsapp')}
          onPress={() =>
            openExternalUrl(
              `https://wa.me/${SUPPORT_WHATSAPP}`,
              t('helpSupport.errors.whatsappFailedTitle'),
              t('helpSupport.errors.whatsappFailedMessage'),
            )
          }
        />
        <Divider />
        <LinkRow
          icon="mail-outline"
          label={t('helpSupport.rows.emailUs')}
          onPress={() =>
            openExternalUrl(
              supportEmailUrl(),
              t('helpSupport.errors.emailFailedTitle'),
              t('helpSupport.errors.emailFailedMessage'),
            )
          }
        />
      </Card>

      <SectionHeading>{t('helpSupport.sections.reportIssue')}</SectionHeading>
      <Card className="mt-1" padded={false}>
        <LinkRow
          icon="flag-outline"
          label={t('helpSupport.rows.reportAnIssue')}
          onPress={() =>
            openExternalUrl(
              supportEmailUrl(SUPPORT_ISSUE_SUBJECT),
              t('helpSupport.errors.emailFailedTitle'),
              t('helpSupport.errors.emailFailedMessage'),
            )
          }
        />
      </Card>

      <SectionHeading>{t('helpSupport.sections.faq')}</SectionHeading>
      {FAQ_CATEGORY_KEYS.map((categoryKey) => {
        const entries = FAQS.filter((entry) => entry.categoryKey === categoryKey);
        if (entries.length === 0) return null;
        const firstIndex = FAQS.findIndex((entry) => entry.categoryKey === categoryKey);
        return (
          <View key={categoryKey} className="mt-3">
            <Text variant="caption" className="font-semibold text-text-muted">
              {t(categoryKey)}
            </Text>
            <Card className="mt-1.5" padded={false}>
              {entries.map((entry, entryIndex) => {
                const globalIndex = firstIndex + entryIndex;
                return (
                  <View key={entry.questionKey}>
                    {entryIndex > 0 ? <Divider /> : null}
                    <FaqRow
                      question={t(entry.questionKey)}
                      answer={t(entry.answerKey)}
                      open={openIndex === globalIndex}
                      onToggle={() => toggleFaq(globalIndex)}
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}

      <SectionHeading>{t('helpSupport.sections.about')}</SectionHeading>
      <Card className="mt-1" padded={false}>
        <LinkRow
          icon="information-circle-outline"
          label={t('helpSupport.rows.appVersion')}
          trailingValue={APP_VERSION}
        />
        <Divider />
        <LinkRow
          icon="document-text-outline"
          label={t('helpSupport.rows.terms')}
          onPress={() =>
            openExternalUrl(
              TERMS_URL,
              t('helpSupport.errors.pageFailedTitle'),
              t('helpSupport.errors.pageFailedMessage'),
            )
          }
        />
        <Divider />
        <LinkRow
          icon="shield-checkmark-outline"
          label={t('helpSupport.rows.privacy')}
          onPress={() =>
            openExternalUrl(
              PRIVACY_URL,
              t('helpSupport.errors.pageFailedTitle'),
              t('helpSupport.errors.pageFailedMessage'),
            )
          }
        />
      </Card>
    </Screen>
  );
}
