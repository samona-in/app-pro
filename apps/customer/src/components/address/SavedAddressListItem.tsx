import type { SavedAddress } from '@samona/types';
import { useResolvedPlace } from '@/hooks';
import { savedAddressSecondary } from '@/utils/address';
import { AddressListItem, type AddressListItemProps } from './AddressListItem';

type Props = Omit<AddressListItemProps, 'icon' | 'title' | 'subtitle'> & {
  address: SavedAddress;
};

/**
 * A saved-address row that refreshes its own label.
 *
 * The stored address is rendered immediately; when the row carries a durable
 * place id, the label is re-resolved in the background and swapped in once it
 * arrives — so the display stays current without storing provider content
 * beyond its permitted window. With no place id (an address saved before the
 * Google switch) the stored label is simply kept.
 */
export function SavedAddressListItem({ address, ...rest }: Props) {
  const { data: resolved } = useResolvedPlace(address.placeId);

  return (
    <AddressListItem
      icon={address.label}
      title={resolved?.formattedAddress ?? address.addressLine1}
      subtitle={resolved?.secondary ?? savedAddressSecondary(address)}
      {...rest}
    />
  );
}
