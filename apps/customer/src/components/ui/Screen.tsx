import type { ReactNode } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '@/utils/cn';

export interface ScreenProps extends ViewProps {
  children: ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  className?: string;
  contentClassName?: string;
}

export function Screen({
  children,
  scrollable = false,
  padded = true,
  edges = ['top'],
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const contentClasses = cn(padded && 'px-5', contentClassName);

  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-surface', className)} {...rest}>
      {scrollable ? (
        <ScrollView
          contentContainerClassName={cn('grow pb-8', contentClasses)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={cn('flex-1', contentClasses)}>{children}</View>
      )}
    </SafeAreaView>
  );
}
