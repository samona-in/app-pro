import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { BrandBanner } from '@/components/home/BrandBanner';
import { CompleteProfileCard } from '@/components/home/CompleteProfileCard';
import { InstagramLink } from '@/components/home/InstagramLink';
import { ServicesVerificationCard } from '@/components/services/ServicesVerificationCard';
import { useProProfile, useProfileCompletion, useSession } from '@/hooks';
import { color } from '@/theme';
import { onboardingHref } from '@/utils/onboarding-route';

/**
 * Collapsed sheet height. It is chosen to fit the grab handle plus whichever
 * compact first section is showing — the services row, or the complete-profile
 * prompt — so the pro sees the most relevant thing without dragging and the
 * sheet does not eat more map than it needs to.
 */
const COLLAPSED_HEIGHT = 172;
const EXPANDED_RATIO = 0.82;
const HALF_RATIO = 0.5;
const SPRING = { damping: 22, stiffness: 240, mass: 0.8 } as const;

function SectionHeader({
  title,
  action,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="title">{title}</Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? action}
          onPress={onPress}
          className="min-h-[44px] flex-row items-center"
        >
          <Text variant="caption" className="font-semibold text-brand">
            {action}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The Home bottom sheet.
 *
 * The collapsed state already shows the thing the pro most often needs: their
 * services once the profile is ready, or the prompt to finish it if it is not.
 * "Ready" means onboarding is complete *and* the admin review has verified the
 * profile — a Pro waiting on document/verification approval is not yet
 * receiving requests, so the services block would be misleading. The profile
 * standing and brand line appear when the sheet is pulled up. The grab area is
 * only the handle, so dragging it never competes with map panning; the scroll
 * body is disabled until the sheet is fully expanded, so the same drag cannot
 * fight a nested scroll either.
 */
export const HomeSheet = memo(function HomeSheet() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  // The server's routing decision, not a local re-derivation: Home shows the
  // services block only once onboarding is actually COMPLETED, and the same
  // session `nextStep` resumes the flow while it is not.
  const { isOnboardingComplete, nextStep: onboardingNextStep } = useSession();
  const {
    isVerified,
    isPending: isCompletionLoading,
    isError: isCompletionError,
    nextStep,
    refetch: refetchCompletion,
  } = useProfileCompletion();
  const hasServices = (profile?.proServices ?? []).length > 0;

  // Verification is the last milestone. Documents waiting on review are the
  // same wait, because the ID proof cannot be approved until they are. While
  // either is outstanding the Pro still sees the completion prompt, not the
  // services they cannot yet be booked for. Completion data is skipped until
  // it is trustworthy, so a verified Pro never flashes the prompt on load or
  // loses their services to a failed documents request.
  const isAwaitingVerification =
    !isCompletionLoading &&
    !isCompletionError &&
    !isVerified &&
    (nextStep?.key === 'verification' || nextStep?.key === 'documents');
  const showCompletionPrompt = !isOnboardingComplete || isAwaitingVerification;

  // Resume onboarding at the server's own step (the session already carries
  // it). Once onboarding is done, the completion derivation owns the route:
  // Documents while review is pending, or the read-only verification status.
  const nextRoute = isAwaitingVerification ? nextStep?.route : onboardingHref(onboardingNextStep);

  // Refresh when Home regains focus (returning from Documents, Manage Services
  // or another tab) so an admin verdict that landed while the Pro was away is
  // reflected immediately. The first focus is skipped because the queries are
  // already fetching on mount.
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      void refetchCompletion();
    }, [refetchCompletion]),
  );

  const [height, setHeight] = useState(0);
  const [snapIndex, setSnapIndex] = useState(2);
  const translateY = useSharedValue(1000);
  const startY = useSharedValue(0);

  const geometry = useMemo(() => {
    const expandedHeight = Math.max(0, Math.round(height * EXPANDED_RATIO));
    const expandedY = height - expandedHeight;
    const collapsedY = Math.max(expandedY, height - COLLAPSED_HEIGHT);
    const halfY = Math.min(collapsedY, Math.max(expandedY, Math.round(height * HALF_RATIO)));
    return {
      expandedHeight,
      expandedOffset: 0,
      halfOffset: Math.max(0, halfY - expandedY),
      collapsedOffset: Math.max(0, collapsedY - expandedY),
    };
  }, [height]);

  useEffect(() => {
    if (!height) return;
    translateY.value = geometry.collapsedOffset;
  }, [height, geometry.collapsedOffset, translateY]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    // A resize (rotation, split screen) invalidates the current snap offset, so
    // park the sheet back at its compact state.
    setSnapIndex((current) => (current === 2 ? current : 2));
  }, []);

  // A pan is needed on two surfaces:
  //  - the grab handle, always (so a fully expanded sheet can be pulled down);
  //  - the body, only while the sheet is not fully expanded. When expanded the
  //    body is a real scroll view, and a pan there would fight scrolling.
  // `failOffsetX` lets horizontal service tiles win before the vertical pan
  // activates, so the row still scrolls sideways.
  const buildPan = useCallback(
    (enabled: boolean) => {
      const { collapsedOffset, halfOffset } = geometry;
      return Gesture.Pan()
        .enabled(enabled && collapsedOffset > 0)
        .activeOffsetY([-8, 8])
        .failOffsetX([-16, 16])
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          const next = startY.value + event.translationY;
          translateY.value = Math.min(collapsedOffset, Math.max(0, next));
        })
        .onEnd((event) => {
          const projected = translateY.value + event.velocityY * 0.12;
          const target =
            projected < halfOffset / 2
              ? 0
              : projected < (halfOffset + collapsedOffset) / 2
                ? halfOffset
                : collapsedOffset;

          translateY.value = withSpring(target, SPRING);
          runOnJS(setSnapIndex)(target === 0 ? 0 : target === halfOffset ? 1 : 2);
        });
    },
    [geometry, startY, translateY],
  );

  const pan = useMemo(() => buildPan(true), [buildPan]);
  const bodyPan = useMemo(() => buildPan(snapIndex !== 0), [buildPan, snapIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const isExpanded = snapIndex === 0;

  return (
    <View pointerEvents="box-none" onLayout={onLayout} className="absolute inset-0 overflow-hidden">
      <Animated.View
        style={[
          animatedStyle,
          {
            height: geometry.expandedHeight,
            opacity: height > 0 ? 1 : 0,
            shadowColor: color['text-primary'],
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -6 },
            elevation: 16,
          },
        ]}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface"
      >
        <GestureDetector gesture={pan}>
          <View className="items-center pb-2 pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border-strong" />
          </View>
        </GestureDetector>

        {/*
          The pan sits on a plain wrapper, never on the ScrollView itself: a
          native scroll view owns its own native gesture recognizer, and
          attaching an RNGH pan to it makes the two fight over the same touch —
          which is what stopped the collapsed sheet from opening. The wrapper
          keeps the drag working everywhere on the body, and the ScrollView is
          only scrollable once the sheet is expanded.
        */}
        <GestureDetector gesture={bodyPan}>
          <View className="flex-1">
            <ScrollView
              scrollEnabled={isExpanded}
              showsVerticalScrollIndicator={false}
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: 4 }}
            >
              {showCompletionPrompt ? (
                // The profile is either unfinished or still under review, so
                // the CTA resumes at the derived next step (onboarding, a
                // document re-upload, or the read-only verification status)
                // and the services block is hidden, including its verdicts.
                <CompleteProfileCard nextRoute={nextRoute} />
              ) : hasServices ? (
                // The shared card carries the verification status (accepted,
                // pending, rejected) and the rejection reason, so Home keeps
                // surfacing a service that still needs the pro's attention.
                <ServicesVerificationCard />
              ) : (
                <View>
                  <SectionHeader
                    title={t('dashboard.sheet.yourServices')}
                    action={t('dashboard.sheet.manageServices')}
                    accessibilityLabel={t('dashboard.sheet.manageServices')}
                    onPress={() => router.push('/manage-services')}
                  />
                  <View className="mt-2 flex-row items-center justify-between rounded-xl border border-dashed border-border px-3 py-3">
                    <Text variant="footnote" className="flex-1 pr-3">
                      {t('dashboard.sheet.noServices')}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push('/manage-services')}
                      className="min-h-[40px] justify-center"
                    >
                      <Text variant="caption" className="font-semibold text-brand">
                        {t('dashboard.sheet.addServices')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Closing brand artwork, in place of the old made-in text. */}
              <BrandBanner className="mt-6" />
              <InstagramLink className="mt-1" />
            </ScrollView>
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
});
