import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { MaterialTopTabNavigationOptions } from 'expo-router/js-top-tabs';
import type { ParamListBase, TabNavigationState } from 'expo-router/build/react-navigation/native';
import * as Haptics from 'expo-haptics';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
  FLOATING_TAB_BAR_MARGIN,
} from '@/constants';
import { useIsReduceMotionEnabled } from '@/hooks/use-reduce-motion';
import { color, elevation } from '@/theme';

/** Native liquid glass is only rendered on iOS 26+ builds that expose the API. */
const LIQUID_GLASS_SUPPORTED =
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

const BAR_HEIGHT = FLOATING_TAB_BAR_HEIGHT;
const BAR_RADIUS = BAR_HEIGHT / 2;
/** Inset that keeps the selection lens and tab icons off the glass rim. */
const BAR_PADDING = 6;
const LENS_HEIGHT = BAR_HEIGHT - 16;
const LENS_MAX_WIDTH = 64;
const LENS_MIN_WIDTH = 44;

const LENS_SPRING = { damping: 22, stiffness: 280, mass: 0.9 };
const PRESS_SPRING = { damping: 18, stiffness: 380, mass: 0.6 };
const FOCUS_SPRING = { damping: 16, stiffness: 260, mass: 0.7 };

export interface FloatingTabBarProps {
  state: TabNavigationState<ParamListBase>;
  descriptors: Record<string, { options: MaterialTopTabNavigationOptions }>;
  navigation: { navigate: (routeName: string) => void };
  /** Reports the rendered bar height so overlays can dock above it. */
  onHeight?: (height: number) => void;
}

interface SelectionLensProps {
  activeIndex: number;
  itemCount: number;
  rowWidth: number;
  reduceMotion: boolean;
}

/**
 * The soft, neutral "lens" that glides between tabs. It is an ordinary
 * view (not native glass) so it can animate cheaply and look consistent on
 * every platform.
 */
function SelectionLens({ activeIndex, itemCount, rowWidth, reduceMotion }: SelectionLensProps) {
  const position = useSharedValue(activeIndex);

  useEffect(() => {
    position.value = reduceMotion ? activeIndex : withSpring(activeIndex, LENS_SPRING);
  }, [activeIndex, position, reduceMotion]);

  const itemWidth = (rowWidth - BAR_PADDING * 2) / itemCount;
  const lensWidth = Math.min(Math.max(itemWidth - 18, LENS_MIN_WIDTH), LENS_MAX_WIDTH);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: BAR_PADDING + position.value * itemWidth + (itemWidth - lensWidth) / 2,
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.lens,
        { width: lensWidth, height: LENS_HEIGHT, top: (BAR_HEIGHT - LENS_HEIGHT) / 2 },
        animatedStyle,
      ]}
    >
      <View style={styles.lensSheen} />
    </Animated.View>
  );
}

interface TabButtonProps {
  focused: boolean;
  label: string;
  icon?: ReactNode;
  reduceMotion: boolean;
  onPress: () => void;
}

/** Icon-only tab with a springy press scale and a gentle active-state pop. */
function TabButton({ focused, label, icon, reduceMotion, onPress }: TabButtonProps) {
  const pressScale = useSharedValue(1);
  const focusScale = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    focusScale.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, FOCUS_SPRING);
  }, [focusScale, focused, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value * (1 + focusScale.value * 0.08) }],
  }));

  function handlePress() {
    if (!focused) {
      // A short tick makes the tab switch feel physical, matching the glass.
      void Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : undefined}
      hitSlop={4}
      onPress={handlePress}
      onPressIn={() => {
        pressScale.value = withSpring(0.86, PRESS_SPRING);
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, PRESS_SPRING);
      }}
      style={styles.tab}
    >
      <Animated.View style={iconStyle}>{icon}</Animated.View>
    </Pressable>
  );
}

interface BarSurfaceProps {
  children: ReactNode;
}

/**
 * The glass body. iOS 26 gets the real system Liquid Glass material; every
 * other platform gets a layered fallback that mirrors the same rim light,
 * specular streak and neutral tint with plain views.
 */
function BarSurface({ children }: BarSurfaceProps) {
  if (LIQUID_GLASS_SUPPORTED) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="light"
        tintColor="rgba(255, 255, 255, 0.10)"
        style={[styles.shell, styles.shadow]}
      >
        {children}
      </GlassView>
    );
  }

  return <View style={[styles.shell, styles.fallbackSurface, styles.shadow]}>{children}</View>;
}

/**
 * Floating, Instagram-style bottom bar for the swipeable tab pager.
 *
 * The bar overlays the scene instead of occupying layout space, so screens add
 * `FLOATING_TAB_BAR_CLEARANCE` bottom padding to keep their last row clear. It
 * stays in sync with the pager because both drive the same navigator state.
 */
export function FloatingTabBar({ state, descriptors, navigation, onHeight }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useIsReduceMotionEnabled();
  const [rowWidth, setRowWidth] = useState(0);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: insets.bottom + FLOATING_TAB_BAR_BOTTOM_GAP }]}
      onLayout={(event) => onHeight?.(Math.round(event.nativeEvent.layout.height))}
    >
      <BarSurface>
        {/* Decorative glass layers, painted beneath the tab row. */}
        <View pointerEvents="none" style={styles.tintWash} />
        <View pointerEvents="none" style={styles.specular} />

        <View
          style={styles.row}
          onLayout={(event) => {
            const width = Math.round(event.nativeEvent.layout.width);
            if (width !== rowWidth) setRowWidth(width);
          }}
        >
          {rowWidth > 0 ? (
            <SelectionLens
              activeIndex={state.index}
              itemCount={state.routes.length}
              rowWidth={rowWidth}
              reduceMotion={reduceMotion}
            />
          ) : null}

          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            if (!descriptor) return null;
            const { options } = descriptor;
            const active = options.tabBarActiveTintColor ?? color['text-primary'];
            const inactive = options.tabBarInactiveTintColor ?? color['text-secondary'];
            const focused = state.index === index;
            const tint = focused ? active : inactive;
            const label =
              (typeof options.tabBarLabel === 'string' ? options.tabBarLabel : undefined) ??
              options.title ??
              route.name;

            return (
              <TabButton
                key={route.key}
                focused={focused}
                label={label}
                icon={options.tabBarIcon?.({ focused, color: tint })}
                reduceMotion={reduceMotion}
                onPress={() => navigation.navigate(route.name)}
              />
            );
          })}
        </View>

        {/* A single rim light along the top edge keeps the glass crisp. The
            full outline is gone: the shadow already separates the bar from
            the screen, and the hairline read as a stray line. */}
        <View pointerEvents="none" style={styles.topSheen} />
      </BarSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: FLOATING_TAB_BAR_MARGIN,
    right: FLOATING_TAB_BAR_MARGIN,
  },
  shell: {
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  fallbackSurface: {
    // High-opacity frost doubles as the readable backdrop on platforms
    // without a native blur; the highlights below supply the glass look.
    backgroundColor: 'rgba(252, 252, 252, 0.95)',
  },
  shadow: {
    ...elevation.lg,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  tintWash: {
    ...StyleSheet.absoluteFill,
    borderRadius: BAR_RADIUS,
    backgroundColor: 'rgba(241, 245, 249, 0.55)',
  },
  specular: {
    position: 'absolute',
    top: 4,
    left: 16,
    width: '46%',
    height: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
    transform: [{ rotate: '-4deg' }],
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_PADDING,
  },
  tab: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: {
    position: 'absolute',
    borderRadius: LENS_HEIGHT / 2,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.18)',
  },
  lensSheen: {
    position: 'absolute',
    top: 1,
    left: 10,
    right: 10,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  topSheen: {
    position: 'absolute',
    top: StyleSheet.hairlineWidth,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
});
