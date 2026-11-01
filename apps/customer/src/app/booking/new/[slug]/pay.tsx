import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BookingStep } from '@/components/booking';
import { Input, Text } from '@/components/ui';
import { useBookingDraft } from '@/stores/booking';
import { formatRupees } from '@/utils/format';

/** Upper bound in paise, shared with the server-side validation. */
const MAX_BASE_PAY_PAISE = 100_000_000;

const BASE_PAY_HELP =
  'This is the guaranteed amount a professional is offered for the request. ' +
  'You agree on the final price with the professional later — you only pay after the work is done.';

export default function BookingPay() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const draft = useBookingDraft();
  const suggestedBasePayPaise = draft.skill?.basePricePaise ?? 0;
  const [amount, setAmount] = useState(
    draft.basePayPaise > 0
      ? String(draft.basePayPaise / 100)
      : suggestedBasePayPaise > 0
        ? String(suggestedBasePayPaise / 100)
        : '',
  );

  const rupees = Number(amount);
  const paise = Math.round(rupees * 100);
  const valid = Number.isInteger(rupees) && rupees >= 1 && paise <= MAX_BASE_PAY_PAISE;
  const showInvalid = amount.length > 0 && !valid;

  function onContinue() {
    if (!valid) return;
    draft.setBasePay(paise);
    router.push(`/booking/new/${slug}/review`);
  }

  return (
    <BookingStep
      step={3}
      title="What should we quote as base pay?"
      subtitle={
        suggestedBasePayPaise > 0
          ? `Suggested base pay: ${formatRupees(suggestedBasePayPaise)}. You can adjust it. ${BASE_PAY_HELP}`
          : BASE_PAY_HELP
      }
      primaryDisabled={!valid}
      onPrimary={() => void onContinue()}
    >
      <View className="flex-row items-center gap-3">
        <Text variant="titleLg" className={showInvalid ? 'text-danger' : undefined}>
          ₹
        </Text>
        <View className="flex-1">
          <Input
            label="Base pay"
            keyboardType="number-pad"
            placeholder="e.g. 500"
            value={amount}
            onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
            maxLength={7}
            error={showInvalid ? 'Enter a whole amount from ₹1 up to ₹1,00,000.' : undefined}
          />
        </View>
      </View>

      <View className="mt-4 rounded-lg bg-surface-muted p-4">
        <Text variant="label">Overview</Text>
        <Text variant="bodyLg" className="mt-1">
          {valid ? formatRupees(paise) : '—'}
        </Text>
        <Text variant="footnote" className="mt-1">
          Base pay, GST and any negotiated additions are shown here before you confirm.
        </Text>
      </View>
    </BookingStep>
  );
}
