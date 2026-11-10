import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/utils/cn';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off by default to keep layouts flush. */
  scrollable?: boolean;
  /**
   * Scrollable screens with inputs: swaps the plain `ScrollView` for a
   * `KeyboardAwareScrollView` (react-native-keyboard-controller), which
   * scrolls the focused field clear of the keyboard as it rises instead of
   * letting the keyboard cover it. The keyboard-aware path sizes its content
   * container with styles, so `contentClassName` does not apply to it.
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
  /** Applies the standard horizontal gutter. */
  padded?: boolean;
  /** Safe-area edges to inset. Tab screens usually omit `bottom`. */
  edges?: readonly Edge[];
  /** Decorative layer painted full-bleed behind the safe area and the content. */
  background?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Gap kept between the focused field and the keyboard top, matching the
 *  edit-address sheet so both input flows feel the same. */
const KEYBOARD_BOTTOM_OFFSET = 24;

/** The `grow pb-8` content classes, as styles, for the keyboard-aware path. */
const KEYBOARD_CONTENT_STYLE = { flexGrow: 1, paddingBottom: 32 };

/**
 * Root container for every screen: safe-area insets, background colour and the
 * standard gutter, so individual screens never re-implement them.
 */
export function Screen({
  children,
  scrollable = false,
  keyboardAware = false,
  padded = true,
  edges = ['top'],
  background,
  footer,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const [footerHeight, setFooterHeight] = useState(0);
  const contentClasses = cn(padded && 'px-5', contentClassName);

  return (
    <View className={cn('flex-1 bg-background', className)}>
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
              contentContainerClassName={cn('grow pb-8', contentClasses)}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
