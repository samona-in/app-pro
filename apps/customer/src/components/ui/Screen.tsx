import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  scrollable?: boolean;
  /**
   * Scrollable screens with inputs: swaps the plain `ScrollView` for a
   * `KeyboardAwareScrollView` (react-native-keyboard-controller), which
   * scrolls the focused field clear of the keyboard as it rises instead of
   * letting the keyboard cover it. The keyboard-aware path sizes its content
   * container with styles, so `contentClassName` does not apply to it, and
   * the scroll extras below (sticky indices, refresh, scroll ref) stay
   * wired to the plain scroll path.
   */
  keyboardAware?: boolean;
  /**
   * Content pinned below the scrollable area instead of scrolling with it —
   * typically the primary CTA. On keyboard-aware screens the footer rides
   * just above the keyboard (`KeyboardStickyView`), and its measured height
   * is added to the scroll view's keyboard offset so the focused field is
   * kept clear of the footer, not just the keyboard. The pinned footer draws
   * over the scroll content, so it carries an opaque `bg-surface` — screens
   * with a different background should wrap their footer in one.
   */
  footer?: ReactNode;
  padded?: boolean;
  edges?: readonly Edge[];
  /** Decorative layer painted full-bleed behind the safe area and the content. */
  background?: ReactNode;
  /** Indexes of scrollable children that stay pinned to the top while scrolling. */
  stickyHeaderIndices?: number[];
  /** Ref for screens that scroll to measured child sections. */
  scrollRef?: RefObject<ScrollView | null>;
  onScroll?: ScrollViewProps['onScroll'];
  scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
  /** Enables pull-to-refresh; called when the scrollable content is dragged down. */
  onRefresh?: () => void;
  /** Whether the pull-to-refresh spinner is visible. */
  refreshing?: boolean;
  className?: string;
  contentClassName?: string;
}

/** Gap kept between the focused field and the keyboard top, matching the
 *  edit-address sheet so both input flows feel the same. */
const KEYBOARD_BOTTOM_OFFSET = 24;

/** The `grow pb-8` content classes, as styles, for the keyboard-aware path. */
const KEYBOARD_CONTENT_STYLE = { flexGrow: 1, paddingBottom: 32 };

export function Screen({
  children,
  scrollable = false,
  keyboardAware = false,
  padded = true,
  edges = ['top'],
  background,
  footer,
  stickyHeaderIndices,
  scrollRef,
  onScroll,
  scrollEventThrottle,
  onRefresh,
  refreshing = false,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const [footerHeight, setFooterHeight] = useState(0);
  const contentClasses = cn(padded && 'px-5', contentClassName);

  return (
    <View className={cn('flex-1 bg-surface', className)}>
      {background ? (
        <View pointerEvents="none" className="absolute inset-0">
          {background}
        </View>
      ) : null}

      <SafeAreaView edges={edges} className="flex-1" {...rest}>
        {scrollable && keyboardAware ? (
          <>
            <KeyboardAwareScrollView
              /* Claim the space above the pinned footer, so the footer sits
                 at the bottom of the screen instead of right under the
                 (short) scroll content. */
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              /* The footer rides above the keyboard, so the focused field
                 must clear the footer's height as well as the gap above it. */
              bottomOffset={KEYBOARD_BOTTOM_OFFSET + footerHeight}
              /* These screens carry less content than the viewport, so the
                 scroll view alone cannot travel far enough to lift a field
                 above both the keyboard and the footer: extend the
                 scrollable area by the footer's height as well. The extra
                 space exists only while the keyboard is open, so nothing is
                 scrollable into blank space at rest. */
              extraKeyboardSpace={footerHeight}
              contentContainerStyle={{
                ...KEYBOARD_CONTENT_STYLE,
                paddingHorizontal: padded ? 20 : 0,
              }}
            >
              {children}
            </KeyboardAwareScrollView>
            {footer ? (
              <KeyboardStickyView>
                <View
                  className={cn('bg-surface', padded && 'px-5')}
                  onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
                >
                  {footer}
                </View>
              </KeyboardStickyView>
            ) : null}
          </>
        ) : scrollable ? (
          <>
            <ScrollView
              ref={scrollRef}
              contentContainerClassName={cn('grow pb-8', contentClasses)}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              stickyHeaderIndices={stickyHeaderIndices}
              onScroll={onScroll}
              scrollEventThrottle={scrollEventThrottle}
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={color.brand}
                    colors={[color.brand]}
                    progressBackgroundColor={color.surface}
                  />
                ) : undefined
              }
            >
              {children}
            </ScrollView>
            {footer}
          </>
        ) : (
          <>
            <View className={cn('flex-1', contentClasses)}>{children}</View>
            {footer}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
