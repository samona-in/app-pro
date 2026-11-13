import { View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Text } from '@/components/ui';
import { cartWorksCount, useBookingDraft } from '@/stores/booking';

/**
 * The home header's cart affordance.
 *
 * The cart can hold works from several services, so it lives beside the
 * notifications bell rather than inside any one service. The pill mirrors the
 * bell: it carries how many works are waiting in the cart.
 */
export function CartButton() {
  const groups = useBookingDraft((state) => state.groups);
  const worksCount = cartWorksCount(groups);
  const label =
    worksCount === 0
      ? 'Cart, empty'
      : `Cart, ${worksCount} ${worksCount === 1 ? 'work' : 'works'}`;

  return (
    <View>
      <IconButton
        name="cart-outline"
        accessibilityLabel={label}
        onPress={() => router.push('/booking/cart')}
      />
      {worksCount > 0 ? (
        <View
          pointerEvents="none"
          className="absolute right-0 top-0 min-w-[18px] items-center rounded-full bg-danger px-1 py-0.5"
        >
          <Text
            variant="caption"
            className="text-[10px] font-bold leading-[12px] text-text-inverse"
          >
            {worksCount > 9 ? '9+' : worksCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
