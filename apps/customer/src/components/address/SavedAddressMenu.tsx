import { Host, Menu, Button, Divider } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { color } from '@/theme';

interface SavedAddressMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

export function SavedAddressMenu({ onEdit, onDelete }: SavedAddressMenuProps) {
  return (
    <Host matchContents={true}>
      <Menu
        label={
          <View
            accessibilityRole="button"
            accessibilityLabel="More actions"
            style={styles.trigger}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={color['text-secondary']}
            />
          </View>
        }
      >
        <Button
          label="Edit address"
          systemImage="pencil"
          onPress={onEdit}
        />
        <Divider />
        <Button
          label="Delete address"
          systemImage="trash"
          role="destructive"
          onPress={onDelete}
        />
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
});