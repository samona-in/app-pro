import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SavedAddress } from '@samona/types';
import { AddressListItem } from '@/components/address/AddressListItem';
import { Button, IconButton, Text } from '@/components/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import {
  useDeleteSavedAddress,
  useSavedAddresses,
  useUpdateSavedAddress,
} from '@/hooks';
import { color } from '@/theme';
import { savedAddressSecondary } from '@/utils/address';

/**
 * Manage the customer's saved addresses (Profile → Saved addresses).
 *
 * Each row shows the label and address; the check marks an address as the
 * default (the one shown under the Home pin is the active profile location,
 * which lives separately on the customer profile). Deleting the default lets
 * the server promote the earliest remaining address.
 */
export default function SavedAddresses() {
  const { data, isPending, isError, refetch } = useSavedAddresses();
  const update = useUpdateSavedAddress();
  const remove = useDeleteSavedAddress();

  function makeDefault(item: SavedAddress) {
    update.mutate({ id: item.id, input: { isDefault: true } });
  }

  function confirmDelete(item: SavedAddress) {
    Alert.alert('Delete address?', `${item.addressLine1} will be removed from your saved addresses.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(item.id),
      },
    ]);
  }

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
                <View className="flex-row items-center">
                  {item.isDefault ? (
                    <View className="mr-2 rounded-full bg-success-surface px-2.5 py-1">
                      <Text variant="caption" className="text-success">
                        Default
                      </Text>
                    </View>
                  ) : (
                    <IconButton
                      name="checkmark-circle-outline"
                      accessibilityLabel={`Make ${item.addressLine1} the default address`}
                      tint={color['text-muted']}
                      onPress={() => makeDefault(item)}
                      className="mr-1"
                    />
                  )}
                  <IconButton
                    name="trash-outline"
                    accessibilityLabel={`Delete ${item.addressLine1}`}
                    haptic
                    tint={color.danger}
                    onPress={() => confirmDelete(item)}
                  />
                </View>
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