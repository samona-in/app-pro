import { useCallback, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JobStatus } from '@samona/types';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import {
  BookingStatusHero,
  ProfessionalCard,
  ProfessionalTrackingMap,
} from '@/components/booking/detail';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Button, Text } from '@/components/ui';
import { useBooking, useCancelBooking, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { formatBookingDate, formatRupees } from '@/utils/format';
import { describeJobQuantity } from '@/utils/pricing';

const CANCELLABLE: JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.OFFERED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
];

function canCancel(status: JobStatus): boolean {
  return CANCELLABLE.includes(status);
}

function formatHeaderDateTime(iso: string): string {
  return `${formatBookingDate(iso)} · ${new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;
/** Height of the grab handle; the sheet content starts below it. */
const HANDLE_HEIGHT = 20;
/**
 * The sheet opens near full height, leaving a hint of the bookings list behind
 * it. A percentage keeps the sheet sized to its container rather than the
 * window, which avoids rounding drift on devices with unusual safe areas.
 */
const SNAP_POINTS = ['92%'];

const styles = StyleSheet.create({
  background: {
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
});

function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={[style, styles.background]} />;
}

function SheetHandle() {
  return (
    <View className="items-center justify-center" style={{ height: HANDLE_HEIGHT }}>
      <View className="h-1.5 w-10 rounded-full bg-border-strong" />
    </View>
  );
}

/**
 * The sheet chrome shared by the loading, error and loaded states, so a booking
 * always opens in the same surface instead of swapping between a page and a
 * sheet. Swiping down or tapping the backdrop returns to the list.
 */
function BookingSheet({ children }: { children: ReactNode }) {
  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  return (
    <View className="flex-1">
      <BottomSheet
        index={0}
        snapPoints={SNAP_POINTS}
        enableOverDrag={false}
        enablePanDownToClose
        enableDynamicSizing={false}
        animationConfigs={springConfig}
        backgroundComponent={SheetBackground}
        handleComponent={SheetHandle}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
            opacity={0.4}
          />
        )}
        onClose={() => router.back()}
      >
        {children}
      </BottomSheet>
    </View>
  );
}

interface SheetHeaderProps {
  title?: string;
  subtitle?: string;
}

/**
 * The old native header, now drawn inside the sheet: the booking's identity on
 * the left, with the help control on the right. It stays pinned while the
 * details scroll beneath it. The sheet itself is dismissed by dragging it down
 * or tapping the backdrop.
 */
function SheetHeader({ title, subtitle }: SheetHeaderProps) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border px-5 pb-3 pt-1">
      <View className="flex-1">
        <Text variant="title" numberOfLines={1}>
          {title ?? 'Booking'}
        </Text>
        {subtitle ? (
          <Text variant="caption" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Help"
        onPress={() => router.push('/help-support')}
        className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
      >
        <Ionicons name="help-circle-outline" size={22} color={color['text-primary']} />
      </Pressable>
    </View>
  );
}

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isPending, isError, refetch } = useBooking(id);
  const insets = useSafeAreaInsets();

  const cancel = useCancelBooking(id);
  const { run: requestCancel, isSubmitting: cancelling } = useSubmitGuard(() => {
    Alert.alert('Cancel this booking?', 'The job will be cancelled for everyone.', [
      { text: 'Keep the booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancel.mutateAsync();
            } catch (error) {
              Alert.alert(
                'Could not cancel this booking',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          })();
        },
      },
    ]);
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (isPending) {
    return (
      <BookingSheet>
        <View className="flex-1">
          <SheetHeader />
          <View className="flex-1 items-center justify-center px-5">
            <LoadingState message="Loading booking" size="inline" />
          </View>
        </View>
      </BookingSheet>
    );
  }

  if (isError || !job) {
    return (
      <BookingSheet>
        <View className="flex-1">
          <SheetHeader />
          <View className="flex-1 items-center justify-center px-5">
            <ErrorState
              title="Couldn't load this booking"
              message="Check your connection and try again."
              onRetry={() => void refetch()}
            />
          </View>
        </View>
      </BookingSheet>
    );
  }

  const isTerminal = ([JobStatus.CANCELLED, JobStatus.EXPIRED] as JobStatus[]).includes(job.status);
  const showMap = job.status === JobStatus.ACCEPTED || job.status === JobStatus.TRAVELLING;
  const showProCard = job.pro !== null || job.status !== JobStatus.REQUESTED;
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const quantityLabel = describeJobQuantity(job);

  const serviceTitle =
    job.skill?.name && job.skill.name !== job.service.name ? job.skill.name : job.service.name;
  const hasLocation = typeof job.latitude === 'number' && typeof job.longitude === 'number';

  return (
    <BookingSheet>
      <View className="flex-1">
        <SheetHeader title={serviceTitle} subtitle={formatHeaderDateTime(job.createdAt)} />

        <BottomSheetScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="pt-2">
            <BookingStatusHero job={job} />
          </View>

          {job.status === JobStatus.ARRIVED && job.verificationOtp ? (
            <View className="mt-2">
              <View className="h-px bg-border w-full" />
              <View className="flex-row items-center justify-between px-5 py-3">
                <View>
                  <Text variant="bodyStrong" className="text-text-primary">
                    Verification code
                  </Text>
                  <Text variant="footnote" className="mt-0.5 text-text-muted">
                    Share with your professional to start work
                  </Text>
                </View>
                <Text
                  variant="title"
                  className="font-semibold"
                  style={{ color: '#054DFF', letterSpacing: 8 }}
                >
                  {job.verificationOtp}
                </Text>
              </View>
              <View className="h-px bg-border w-full" />
            </View>
          ) : null}

          {showMap ? <ProfessionalTrackingMap job={job} /> : null}

          {showProCard &&
          job.status !== JobStatus.REQUESTED &&
          job.status !== JobStatus.OFFERED &&
          job.status !== JobStatus.CANCELLED &&
          job.status !== JobStatus.EXPIRED ? (
            <ProfessionalCard job={job} />
          ) : null}

          <View className="mt-2">
            <View className="flex-row items-center gap-3 px-5 py-3">
              <Ionicons name="cash-outline" size={20} color={color['text-primary']} />
              <View className="min-w-0 flex-1 flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text variant="bodyStrong" className="text-text-primary">
                    Total amount
                  </Text>
                  <Text variant="footnote" className="mt-0.5 text-text-muted">
                    The amount agreed with professional.
                    {quantityLabel ? ` · ${quantityLabel}` : ''}
                  </Text>
                </View>
                <Text variant="title" numberOfLines={1} className="shrink-0 text-text-primary">
                  {formatRupees(amount)}
                </Text>
              </View>
            </View>
            <View className="h-px bg-border w-full" />

            <View className="flex-row items-start gap-3 px-5 py-4">
              <Ionicons name="location-outline" size={20} color={color['text-primary']} />
              <View className="flex-1">
                <Text variant="bodyStrong" className="text-text-primary">
                  Service address
                </Text>
                <Text variant="footnote" className="mt-0.5 text-text-muted">
                  {job.locationLabel ?? 'Service location'}
                </Text>
              </View>
              {hasLocation ? (
                <View className="h-16 w-16 overflow-hidden rounded-lg">
                  <MapView
                    provider={PROVIDER_DEFAULT}
                    userInterfaceStyle="light"
                    style={{ flex: 1 }}
                    initialRegion={{
                      latitude: job.latitude!,
                      longitude: job.longitude!,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    <Marker coordinate={{ latitude: job.latitude!, longitude: job.longitude! }}>
                      <Ionicons name="location" size={24} color="#054DFF" />
                    </Marker>
                  </MapView>
                </View>
              ) : null}
            </View>
            {job.description ? (
              <>
                <View className="h-px bg-border w-full" />
                <View className="px-5 py-4">
                  <Text variant="bodyStrong" className="text-text-primary">
                    What's needed
                  </Text>
                  <Text variant="body" className="mt-1 text-text-muted">
                    {job.description}
                  </Text>
                </View>
              </>
            ) : null}

            {job.imageUrls.length > 0 ? (
              <>
                <View className="h-px bg-border w-full" />
                <View className="px-5 py-4">
                  <Text variant="bodyStrong" className="text-text-primary">
                    Reference photos
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="mt-2 flex-row gap-2"
                  >
                    {job.imageUrls.map((url) => (
                      <Image key={url} source={{ uri: url }} className="h-24 w-24 rounded-lg" />
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : null}
          </View>

          {isTerminal ? (
            <View className="mt-2">
              <View className="h-px bg-border w-full" />
              <View className="px-5 py-4">
                <Text variant="bodyStrong" className="text-text-primary">
                  {job.status === JobStatus.CANCELLED ? 'Booking cancelled' : 'Request expired'}
                </Text>
                <Text variant="body" className="mt-1 text-text-muted">
                  {job.status === JobStatus.CANCELLED
                    ? 'This booking was cancelled.'
                    : 'No professional accepted your request within the available time.'}
                </Text>
              </View>
            </View>
          ) : null}

          {job.status === JobStatus.PAYMENT_PENDING ? (
            <View className="mt-4 px-5">
              <Text variant="bodyStrong" style={{ color: '#054DFF' }}>
                Payment pending
              </Text>
              <Text variant="footnote" className="mt-0.5 text-text-muted">
                Your professional has finished the work. Please complete the payment.
              </Text>
            </View>
          ) : null}

          {canCancel(job.status) ? (
            <View className="mt-6 mb-4 px-5">
              <Button
                label="Cancel booking"
                variant="ghost"
                size="md"
                loading={cancelling}
                onPress={() => void requestCancel()}
              />
            </View>
          ) : null}

          {job.status === JobStatus.CANCELLED || job.status === JobStatus.EXPIRED ? (
            <View className="mb-4 px-5">
              <Button
                label="Book again"
                variant="primary"
                size="md"
                onPress={() => router.dismissTo('/(tabs)')}
              />
            </View>
          ) : null}
        </BottomSheetScrollView>
      </View>
    </BookingSheet>
  );
}
