import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AadhaarReferenceCard, type AadhaarFlowSource } from '@/components/aadhaar';
import { Button, Screen, Text } from '@/components/ui';
import { useAadhaarStore } from '@/stores';
import { color } from '@/theme';

/**
 * Aadhaar introduction and consent.
 *
 * This screen is the only place the Pro opts in. The consent checkbox gates
 * the capture button, the copy explains what is collected and why, and it
 * states plainly that this is a manual document review — not UIDAI
 * authentication and not an instant verification.
 */
export default function AadhaarIntroScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ source?: string }>();
  const source: AadhaarFlowSource = params.source === 'onboarding' ? 'onboarding' : 'profile';
  const [consented, setConsented] = useState(false);

  // A fresh attempt never inherits a previous attempt's images. The capture
  // screen also cleans local files when it is abandoned, so this is only a
  // guard against stale in-memory references after a hot reload.
  useEffect(() => {
    useAadhaarStore.getState().reset();
  }, []);

  return (
    <Screen
      scrollable
      edges={['top', 'bottom']}
      className="bg-surface"
      contentClassName="pb-4"
      footer={
        <View className="gap-3 pb-4 pt-2">
          <ConsentRow
            checked={consented}
            onToggle={() => setConsented((current) => !current)}
            label={t('aadhaar.intro.consent')}
          />
          <Button
            label={t('aadhaar.intro.start')}
            size="lg"
            disabled={!consented}
            onPress={() => router.push({ pathname: '/aadhaar/capture', params: { source } })}
          />
        </View>
      }
    >
      <View className="mt-2 h-14 w-14 self-center items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name="shield-checkmark-outline" size={28} color={color.brand} />
      </View>

      <Text variant="titleLg" className="mt-4">
        {t('aadhaar.intro.title')}
      </Text>
      <Text variant="body" className="mt-2 text-text-secondary">
        {t('aadhaar.intro.subtitle')}
      </Text>

      <AadhaarReferenceCard className="mt-6" />

      <View className="mt-6 gap-5">
        <InfoBlock
          icon="shield-checkmark-outline"
          title={t('aadhaar.intro.whyTitle')}
          body={t('aadhaar.intro.whyBody')}
        />
        <InfoBlock
          icon="lock-closed-outline"
          title={t('aadhaar.intro.privacyTitle')}
          body={t('aadhaar.intro.privacyBody')}
        />
      </View>

      <View className="mt-6 rounded-xl border border-border p-3">
        <Text variant="body" className="font-semibold">
          {t('aadhaar.intro.tipsTitle')}
        </Text>
        <View className="mt-3 gap-2.5">
          <Tip text={t('aadhaar.intro.tipLight')} />
          <Tip text={t('aadhaar.intro.tipFlat')} />
          <Tip text={t('aadhaar.intro.tipCorners')} />
        </View>
      </View>

      <Text variant="caption" className="mt-5 text-text-muted">
        {t('aadhaar.intro.disclaimer')}
      </Text>
    </Screen>
  );
}

function InfoBlock({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row">
      <View className="mr-3 h-9 w-9 items-center justify-center">
        <Ionicons name={icon} size={18} color={color.brand} />
      </View>
      <View className="flex-1">
        <Text variant="body" className="font-semibold">
          {title}
        </Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View className="flex-row items-center">
      <Ionicons name="checkmark" size={16} color={color.success} />
      <Text variant="footnote" className="ml-2 flex-1 text-text-secondary">
        {text}
      </Text>
    </View>
  );
}

function ConsentRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      className="flex-row items-start rounded-lg el p-3 active:opacity-80"
    >
      <View
        className={`mr-3 mt-0.5 h-5 w-5 items-center justify-center rounded-[6px] border ${
          checked ? 'border-brand bg-brand' : 'border-border-strong bg-surface'
        }`}
      >
        {checked ? <Ionicons name="checkmark" size={14} color={color.white} /> : null}
      </View>
      <Text variant="footnote" className="flex-1 text-text-secondary">
        {label}
      </Text>
    </Pressable>
  );
}
