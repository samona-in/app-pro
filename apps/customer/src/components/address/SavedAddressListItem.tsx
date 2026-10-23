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
 * The row leads with the customer's own name for the address (e.g. "Home",
 * "Office", "Mom's place") and shows the address itself as the secondary line.
 * When the row carries a durable place id, the address line is re-resolved in
 * the background and swapped in once it arrives — so the display stays current
 * without storing provider content beyond its permitted window. With no place
 * id (an address saved before the Google switch) the stored label is simply kept.
 */
export function SavedAddressListItem({ address, ...rest }: Props) {
  const { data: resolved } = useResolvedPlace(address.placeId);

  const storedAddress = [address.addressLine1, savedAddressSecondary(address)]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <AddressListItem
      icon={address.label}
      title={address.name.trim() || address.addressLine1}
      subtitle={resolved?.formattedAddress ?? (storedAddress || null)}
      {...rest}
    />
  );
}
