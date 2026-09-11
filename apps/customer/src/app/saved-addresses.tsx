import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { useSavedAddresses } from '@/hooks';
import { color } from '@/theme';
import { ADDRESS_LABEL_NAMES, savedAddressSecondary } from '@/utils/address';

/**
 * Manage the customer's saved addresses (Profile → Manage addresses).
 *
 * Flat, borderless rows styled like the bookings list. The active location
 * shown under the Home pin lives separately on the customer profile.
 */
export default function SavedAddresses() {
  const { data, isPending, isError, refetch } = useSavedAddresses();

  const rows = data ?? [];

  return (
    <View className="flex-1">
      {isPending ? (
        <LoadingState message="Loading saved addresses" />
      ) : isError ? (
        <ErrorState
          title="Couldn't load saved addresses"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title="No saved addresses yet"
          message="When you confirm a new address, you can save it here for next time."
          actionLabel="Add an address"
          onAction={() => router.push('/address-search')}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-6"
          renderItem={({ item }) => (
            <View className="bg-background py-3">
              <View className="flex-row items-start">
                <View className="flex-1">
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {item.addressLine1}
                  </Text>
                  <Text variant="footnote" numberOfLines={1} className="mt-0.5 text-text-secondary">
                    {ADDRESS_LABEL_NAMES[item.label]}
                  </Text>
                  {savedAddressSecondary(item) ? (
                    <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-muted">
                      {savedAddressSecondary(item)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className="my-2 -mx-5 h-px bg-border" />
            </View>
          )}
          ListFooterComponent={
            <Button
              label="Add a new address"
              variant="secondary"
              leading={<Ionicons name="add" size={20} color={color['text-primary']} />}
              className="mt-4"
              onPress={() => router.push('/address-search')}
            />
          }
        />
      )}
    </View>
  );
}