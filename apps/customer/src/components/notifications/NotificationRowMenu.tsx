import { MenuView } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

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
 * Default (iOS) implementation renders a native SwiftUI menu via
 * `@expo/ui/community/menu`. Android overrides this with a Compose
 * `DropdownMenu` so the container color can match the screen background.
 */
export function NotificationRowMenu({
  noticeTitle,
  onView,
  onDelete,
}: NotificationRowMenuProps) {
  return (
    <MenuView
      actions={[
        {
          id: 'view',
          title: 'View',
        },
        {
          id: 'delete',
          title: 'Delete',
          attributes: { destructive: true },
        },
      ]}
      onPressAction={(e) => {
        if (e.nativeEvent.event === 'view') {
          onView();
        }

        if (e.nativeEvent.event === 'delete') {
          onDelete();
        }
      }}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${noticeTitle}`}
        className="h-8 w-8 items-center justify-center"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={color['text-secondary']} />
      </View>
    </MenuView>
  );
}
