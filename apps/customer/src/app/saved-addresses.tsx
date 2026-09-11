import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AddressListItem } from '@/components/address/AddressListItem';
import { Button, Text } from '@/components/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { useSavedAddresses } from '@/hooks';
import { color } from '@/theme';
import { savedAddressSecondary } from '@/utils/address';

/**
 * Manage the customer's saved addresses (Profile → Manage addresses).
 *
 * Each row shows the label and address, with the default highlighted. The
 * active location shown under the Home pin lives separately on the customer
 * profile and is not the same as the default here.
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
            <AddressListItem
              icon={item.label}
              title={item.addressLine1}
              subtitle={savedAddressSecondary(item)}
              trailing={
                item.isDefault ? (
                  <View className="rounded-full bg-success-surface px-2.5 py-1">
                    <Text variant="caption" className="text-success">
                      Default
                    </Text>
                  </View>
                ) : undefined
              }
            />
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