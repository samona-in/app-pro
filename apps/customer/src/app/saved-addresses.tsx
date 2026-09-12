import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SavedAddress } from '@samona/types';

import { Button, Text } from '@/components/ui';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/feedback';
import { EditSavedAddressSheet } from '@/components/address/EditSavedAddressSheet';
import { SavedAddressActionsSheet } from '@/components/address/SavedAddressActionsSheet';

import {
  useDeleteSavedAddress,
  useSavedAddresses,
} from '@/hooks';

import { color } from '@/theme';

import {
  ADDRESS_LABEL_NAMES,
  savedAddressSecondary,
} from '@/utils/address';

/**
 * Manage the customer's saved addresses.
 *
 * Profile → Manage addresses
 */
export default function SavedAddresses() {
  const {
    data,
    isPending,
    isError,
    refetch,
  } = useSavedAddresses();

  const deleteAddress = useDeleteSavedAddress();

  const rows = data ?? [];

  const [menuFor, setMenuFor] =
    useState<SavedAddress | null>(null);

  const [editFor, setEditFor] =
    useState<SavedAddress | null>(null);

  /**
   * Delete saved address.
   */
  const handleDelete = useCallback(
    (address: SavedAddress) => {
      Alert.alert(
        'Delete address?',
        `This removes "${address.name}" permanently.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteAddress.mutateAsync(address.id);
              } catch {
                Alert.alert(
                  'Unable to delete address',
                  'Please try again.',
                );
              }
            },
          },
        ],
      );
    },
    [deleteAddress],
  );

  /**
   * Open the address search screen to add a new address.
   */
  const handleAddAddress = useCallback(() => {
    router.push('/address-search');
  }, []);

  /**
   * Open an existing address for editing in a bottom sheet.
   */
  const handleEditAddress = useCallback(
    (address: SavedAddress) => {
      setMenuFor(null);
      setEditFor(address);
    },
    [],
  );

  if (isPending) {
    return (
      <View className="flex-1">
        <LoadingState message="Loading saved addresses" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1">
        <ErrorState
          title="Couldn't load saved addresses"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View className="flex-1">
        <EmptyState
          title="No saved addresses yet"
          message="Save an address to quickly use it again next time."
          actionLabel="Add an address"
          onAction={handleAddAddress}
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 pb-6"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const secondary = savedAddressSecondary(item);

          return (
            <View className="bg-background">
              <View className="flex-row items-start py-3">
                <View className="flex-1 pr-3">
                  <Text
                    variant="bodyStrong"
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>

                  <Text
                    variant="footnote"
                    numberOfLines={1}
                    className="mt-0.5 text-text-secondary"
                  >
                    {ADDRESS_LABEL_NAMES[item.label]}
                  </Text>

                  {secondary ? (
                    <Text
                      variant="caption"
                      numberOfLines={2}
                      className="mt-0.5 text-text-muted"
                    >
                      {secondary}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More actions for ${item.name}`}
                  hitSlop={8}
                  onPress={() => setMenuFor(item)}
                  className="p-3 active:opacity-60"
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={20}
                    color={color['text-secondary']}
                  />
                </Pressable>
              </View>

              <View className="-mx-5 h-px bg-border" />
            </View>
          );
        }}
        ListFooterComponent={
          <Button
            label="Add a new address"
            variant="secondary"
            leading={
              <Ionicons
                name="add"
                size={20}
                color={color['text-primary']}
              />
            }
            className="mt-4"
            onPress={handleAddAddress}
          />
        }
      />

      {menuFor ? (
        <SavedAddressActionsSheet
          address={menuFor}
          onEdit={() => handleEditAddress(menuFor)}
          onDelete={() => {
            const address = menuFor;

            setMenuFor(null);
            handleDelete(address);
          }}
          onClose={() => setMenuFor(null)}
        />
      ) : null}

      {editFor ? (
        <EditSavedAddressSheet
          key={editFor.id}
          address={editFor}
          onClose={() => setEditFor(null)}
        />
      ) : null}
    </View>
  );
}