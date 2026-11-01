import type { ReactNode, RefObject } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
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

export function Screen({
  children,
  scrollable = false,
  padded = true,
  edges = ['top'],
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
  const contentClasses = cn(padded && 'px-5', contentClassName);

  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-surface', className)} {...rest}>
      {scrollable ? (
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
      ) : (
        <View className={cn('flex-1', contentClasses)}>{children}</View>
      )}
    </SafeAreaView>
  );
}
