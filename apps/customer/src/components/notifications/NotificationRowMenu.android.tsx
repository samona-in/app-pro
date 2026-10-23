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

interface NotificationRowMenuProps {
  /** The notice's title, used in the trigger's accessibility label. */
  noticeTitle: string;
  onView: () => void;
  onDelete: () => void;
}

/**
 * The three-dot action menu for a notification row.
 *
 * Android implementation. Uses the low-level Compose `DropdownMenu` so the
 * container color matches the screen background (`color.surface`), which the
 * community `MenuView` does not expose.
 */
export function NotificationRowMenu({
  noticeTitle,
  onView,
  onDelete,
}: NotificationRowMenuProps) {
  const [expanded, setExpanded] = useState(false);

  const close = () => setExpanded(false);

  return (
    <Host matchContents>
      <DropdownMenu expanded={expanded} color={color.surface} onDismissRequest={close}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${noticeTitle}`}
              android_disableSound
              onPress={() => setExpanded(true)}
              style={styles.trigger}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={color['text-secondary']} />
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          <DropdownMenuItem
            elementColors={{ textColor: color['text-primary'] }}
            onClick={() => {
              close();
              onView();
            }}
          >
            <DropdownMenuItem.Text>
              <ComposeText>View</ComposeText>
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
              <ComposeText>Delete</ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
});
