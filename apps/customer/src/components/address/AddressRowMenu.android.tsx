import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

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
 * Android implementation. Uses the low-level Compose `DropdownMenu` so the
 * container color matches the screen background (`color.background`), which
 * the community `MenuView` does not expose.
 */
export function AddressRowMenu({
  addressName,
  onEdit,
  onDelete,
}: AddressRowMenuProps) {
  const [expanded, setExpanded] = useState(false);

  const close = () => setExpanded(false);

  return (
    <Host matchContents>
      <DropdownMenu
        expanded={expanded}
        color={color.background}
        onDismissRequest={close}
      >
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${addressName}`}
              android_disableSound
              onPress={() => setExpanded(true)}
              style={styles.trigger}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={color['text-secondary']}
              />
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          <DropdownMenuItem
            elementColors={{ textColor: color['text-primary'] }}
            onClick={() => {
              close();
              onEdit();
            }}
          >
            <DropdownMenuItem.Text>
              <ComposeText>Edit address</ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
          <DropdownMenuItem
            elementColors={{ textColor: color.danger }}
            onClick={() => {
              close();
              onDelete();
            }}
          >
            <DropdownMenuItem.Text>
              <ComposeText>Delete address</ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
});