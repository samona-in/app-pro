import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Divider, ListRow, Screen, Text } from '@/components/ui';
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
import { formatPhoneForCall } from '@/utils/phone';

function SectionHeading({ children }: { children: string }) {
  return (
    <Text variant="label" className="mt-6 first:mt-4">
      {children}
    </Text>
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
      className="min-h-[56px] justify-center py-2.5 active:opacity-60"
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
    <Screen scrollable edges={['bottom']} className="bg-surface">
      <SectionHeading>{t('helpSupport.sections.contactUs')}</SectionHeading>
      <View className="mt-1">
        <ListRow
          icon="call-outline"
          label={t('helpSupport.rows.callSupport')}
          onPress={() => {
            const formatted = formatPhoneForCall(SUPPORT_PHONE);
            if (!formatted) return;
            openExternalUrl(
              `tel:${formatted}`,
              t('helpSupport.errors.callFailedTitle'),
              t('helpSupport.errors.callFailedMessage'),
            );
          }}
        />
        <ListRow
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
        <ListRow
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
      </View>

      <SectionHeading>{t('helpSupport.sections.reportIssue')}</SectionHeading>
      <View className="mt-1">
        <ListRow
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
      </View>

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
            <View className="mt-1.5">
              {entries.map((entry, entryIndex) => {
                const globalIndex = firstIndex + entryIndex;
                return (
                  <View key={entry.questionKey}>
                    {entryIndex > 0 ? <Divider className="-mx-5" /> : null}
                    <FaqRow
                      question={t(entry.questionKey)}
                      answer={t(entry.answerKey)}
                      open={openIndex === globalIndex}
                      onToggle={() => toggleFaq(globalIndex)}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <SectionHeading>{t('helpSupport.sections.about')}</SectionHeading>
      <View className="mt-1">
        <ListRow
          icon="information-circle-outline"
          label={t('helpSupport.rows.appVersion')}
          trailing={
            <Text variant="body" className="text-text-secondary">
              {APP_VERSION}
            </Text>
          }
        />
        <ListRow
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
        <ListRow
          icon="shield-checkmark-outline"
          label={t('helpSupport.rows.privacy')}
          showDivider={false}
          onPress={() =>
            openExternalUrl(
              PRIVACY_URL,
              t('helpSupport.errors.pageFailedTitle'),
              t('helpSupport.errors.pageFailedMessage'),
            )
          }
        />
      </View>
    </Screen>
  );
}
