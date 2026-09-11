import { View } from 'react-native';
import { EmptyState } from '@/components/feedback';
import { Screen } from '@/components/ui';

export default function PaymentMethods() {
  return (
    <Screen edges={['bottom']}>
      <View className="flex-1">
        <EmptyState icon="card-outline" title="No payment method" />
      </View>
    </Screen>
  );
}