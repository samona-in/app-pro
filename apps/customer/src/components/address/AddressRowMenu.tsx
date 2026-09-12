import { MenuView } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { color } from '@/theme';

interface AddressRowMenuProps {
  /** Name of the address, used in the trigger's accessibility label. */
  addressName: string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * The three-dot action menu for a saved address row.
 *
 * Default (iOS) implementation renders a native SwiftUI menu via
 * `@expo/ui/community/menu`. Android overrides this with a Compose
 * `DropdownMenu` so the container color can match the screen background.
 */
export function AddressRowMenu({
  addressName,
  onEdit,
  onDelete,
}: AddressRowMenuProps) {
  return (
    <MenuView
      actions={[
        {
          id: 'edit',
          title: 'Edit address',
        },
        {
          id: 'delete',
          title: 'Delete address',
          attributes: { destructive: true },
        },
      ]}
      onPressAction={(e) => {
        if (e.nativeEvent.event === 'edit') {
          onEdit();
        }

        if (e.nativeEvent.event === 'delete') {
          onDelete();
        }
      }}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${addressName}`}
        className="p-3"
      >
        <Ionicons
          name="ellipsis-vertical"
          size={20}
          color={color['text-secondary']}
        />
      </View>
    </MenuView>
  );
}