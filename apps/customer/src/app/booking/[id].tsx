import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { JobStatus } from '@samona/types';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BookingStatusHero, ProfessionalCard, ProfessionalTrackingMap } from '@/components/booking/detail';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Button, Screen, Text } from '@/components/ui';
import { useBooking, useCancelBooking, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { formatBookingDate, formatRupees } from '@/utils/format';

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

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isPending, isError, refetch } = useBooking(id);

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

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.warn('[booking-detail] pull-to-refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }

  if (isPending) {
    return (
      <Screen edges={['bottom']} padded={false}>
        <View className="flex-1 justify-center px-3">
          <LoadingState message="Loading booking" size="inline" />
        </View>
      </Screen>
    );
  }

  if (isError || !job) {
    return (
      <Screen edges={['bottom']} padded={false}>
        <View className="flex-1 justify-center px-3">
          <ErrorState
            title="Couldn't load this booking"
            message="Check your connection and try again."
            onRetry={() => void refetch()}
          />
        </View>
      </Screen>
    );
  }

  const isTerminal = ([JobStatus.CANCELLED, JobStatus.EXPIRED] as JobStatus[]).includes(job.status);
  const showMap =
    job.status === JobStatus.ACCEPTED || job.status === JobStatus.TRAVELLING;
  const showProCard = job.pro !== null || job.status !== JobStatus.REQUESTED;
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;

  const serviceTitle = job.skill?.name && job.skill.name !== job.service.name ? job.skill.name : job.service.name;
  const hasLocation = typeof job.latitude === 'number' && typeof job.longitude === 'number';

  return (
    <Screen scrollable edges={['top', 'bottom']} onRefresh={handleRefresh} refreshing={refreshing} padded={false}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {serviceTitle}
              </Text>
              <Text variant="caption" className="text-text-secondary">
                {formatHeaderDateTime(job.createdAt)}
              </Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Help"
              onPress={() => router.push('/help-support')}
              className="mr-2 h-10 w-10 items-center justify-center rounded-full"
            >
              <Ionicons name="help-circle-outline" size={24} color={color['text-primary']} />
            </Pressable>
          ),
        }}
      />

      <View className="pt-2 px-3">
        <BookingStatusHero job={job} />
      </View>

      {job.status === JobStatus.ARRIVED && job.verificationOtp ? (
        <View className="mt-2">
          <View className="h-px bg-border w-full" />
          <View className="px-3 flex-row items-center justify-between py-3">
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

      {showProCard && job.status !== JobStatus.REQUESTED && job.status !== JobStatus.OFFERED && job.status !== JobStatus.CANCELLED && job.status !== JobStatus.EXPIRED ? (
        <ProfessionalCard job={job} />
      ) : null}

      <View className="mt-2">
        <View className="px-3 flex-row items-center gap-3 py-3">
          <Ionicons name="cash-outline" size={20} color={color['text-primary']} />
          <View className="flex-1 flex-row items-center justify-between">
            <View>
              <Text variant="bodyStrong" className="text-text-primary">
                Total amount
              </Text>
              <Text variant="footnote" className="mt-0.5 text-text-muted">
                The amount agreed with professional.
              </Text>
            </View>
            <Text variant="title" className="text-text-primary">
              {formatRupees(amount)}
            </Text>
          </View>
        </View>
        <View className="h-px bg-border w-full" />

        <View className="px-3 flex-row items-start gap-3 py-4">
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
        <View className="h-px bg-border w-full" />

        <View className="px-3 py-4">
          <Text variant="bodyStrong" className="text-text-primary">
            What's needed
          </Text>
          <Text variant="body" className="mt-1 text-text-muted">
            {job.description}
          </Text>
        </View>

        {job.imageUrls.length > 0 ? (
          <>
            <View className="h-px bg-border w-full" />
            <View className="px-3 py-4">
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
          <View className="px-3 py-4">
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
        <View className="mt-4 px-3">
          <Text variant="bodyStrong" style={{ color: '#054DFF' }}>
            Payment pending
          </Text>
          <Text variant="footnote" className="mt-0.5 text-text-muted">
            Your professional has finished the work. Please complete the payment.
          </Text>
        </View>
      ) : null}

      {canCancel(job.status) ? (
        <View className="mt-6 mb-4 px-3">
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
        <View className="mb-4 px-3">
          <Button
            label="Book again"
            variant="primary"
            size="md"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      ) : null}
    </Screen>
  );
}
