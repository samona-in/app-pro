import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { openURL } from 'expo-linking';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { JobStatus, type JobStatus as Status } from '@samona/types';
import { EmptyState, LoadingState } from '@/components/feedback';
import { Button, Divider, Screen, SwipeToConfirm, Text } from '@/components/ui';
import { isTripStatus } from '@/constants';
import { useProJobs, useSubmitGuard, useTransitionJob } from '@/hooks';
import type { ProJobTransitionAction } from '@/services/jobs';
import { color } from '@/theme';
import { formatDistance, formatEta, formatInr } from '@/utils/format';

interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Free OpenFreeMap tiles rendered by the keyless MapLibre engine. */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Default view before the camera fits both markers. */
const DEFAULT_CENTER: [number, number] = [77.209, 28.6139];
const DEFAULT_ZOOM = 12.5;

/** What the swipe should request from the server, per current status. */
const SWIPE_ACTION: Partial<Record<Status, ProJobTransitionAction>> = {
  ACCEPTED: 'travel',
  TRAVELLING: 'arrived',
};

/**
 * Google Maps universal link (`/maps/dir/?api=1`). Opens the installed Google
 * Maps app on both platforms with a driving route from the pro's live location
 * to the work spot; when the origin is unknown yet, it is omitted and Maps
 * prompts for a starting point instead of the button failing.
 */
function buildDirectionsUrl(from: Coordinates | null, to: Coordinates): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.latitude},${to.longitude}`,
    travelmode: 'driving',
  });
  if (from) params.set('origin', `${from.latitude},${from.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** The Pro's blue dot pin. */
function ProPin() {
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-full bg-brand"
      style={{
        borderWidth: 3,
        borderColor: color.surface,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 6,
      }}
    >
      <Ionicons name="location-sharp" size={18} color={color.surface} />
    </View>
  );
}

/** The customer's work-location pin. */
function CustomerPin() {
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-full bg-success"
      style={{
        borderWidth: 3,
        borderColor: color.surface,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 6,
      }}
    >
      <Ionicons name="location-sharp" size={18} color={color.surface} />
    </View>
  );
}

/** Small stat pill shown while on the way, e.g. "12 min away". */
function Chip({
  label,
  icon,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View className="flex-row items-center rounded-full bg-surface-muted px-3 py-1.5">
      <Ionicons name={icon} size={14} color={color['text-secondary']} />
      <Text variant="footnote" className="ml-1.5 text-text-secondary">
        {label}
      </Text>
    </View>
  );
}

/**
 * Compound "call + message" contact button shown opposite the header title.
 * A chat-bubble glyph with a small call badge reads as both ways to reach the
 * customer; the 44pt surface circle keeps it consistent with IconButton.
 * Pressing opens the job actions screen (contact / cancel).
 */
function CallMessageButton({ jobId }: { jobId: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Job actions"
      onPress={() => router.push({ pathname: '/job/[id]/contact', params: { id: jobId } })}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
    >
      <View>
        <Ionicons name="chatbubble-ellipses" size={22} color={color.brand} />
        <View className="absolute -bottom-1 -right-2 h-5 w-5 items-center justify-center rounded-full bg-brand">
          <Ionicons name="call" size={11} color={color['brand-contrast']} />
        </View>
      </View>
    </Pressable>
  );
}

export default function ActiveJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: jobs, isPending, isFetching, refetch } = useProJobs();
  const transition = useTransitionJob();
  const { run, isSubmitting } = useSubmitGuard(async (action: ProJobTransitionAction) => {
    try {
      await transition.mutateAsync({ jobId: id, action });
    } catch (error) {
      Alert.alert(
        'Could not update this job',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  });

  const job = useMemo(() => (jobs ?? []).find((item) => item.id === id), [id, jobs]);
  const hasCustomerCoords = job?.latitude != null && job.longitude != null;

  // The accept happens outside the query cache (the native job-alert layer
  // calls the API directly), so the list this screen reads may be stale and
  // not include the just-accepted job yet. Refetch once before ever claiming
  // "Job not found", instead of flashing the empty state for a moment.
  const refetchedForJob = useRef(false);
  useEffect(() => {
    if (job || refetchedForJob.current) return;
    refetchedForJob.current = true;
    void refetch();
  }, [job, refetch]);

  // ── Live pro location ────────────────────────────────────────────────────
  // Reads position once on mount, then follows the pro while this screen lives.
  const [proCoords, setProCoords] = useState<Coordinates | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const cameraRef = useRef<CameraRef | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function startTracking() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const granted =
          status === 'granted' ||
          (await Location.requestForegroundPermissionsAsync()).status === 'granted';
        if (!granted || cancelled) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setProCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
          (loc) => {
            if (!cancelled) {
              setProCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }
          },
        );
      } catch {
        // Location is unavailable — the customer pin alone is still useful, and
        // the swipe action remains available.
      }
    }

    void startTracking();
    return () => {
      cancelled = true;
      if (subscription) void subscription.remove();
    };
  }, []);

  // ── Camera: fit both markers once the map and both points are ready ──────
  useEffect(() => {
    if (!mapReady || !proCoords || job?.latitude == null || job.longitude == null) return;
    cameraRef.current?.fitBounds(
      [
        Math.min(proCoords.longitude, job.longitude),
        Math.min(proCoords.latitude, job.latitude),
        Math.max(proCoords.longitude, job.longitude),
        Math.max(proCoords.latitude, job.latitude),
      ],
      { padding: { top: 70, right: 48, bottom: 48, left: 48 }, duration: 800 },
    );
  }, [mapReady, proCoords, job?.latitude, job?.longitude]);

  // ── Loading / empty states ───────────────────────────────────────────────
  // Keep showing a loading screen while the list fetch is in flight — the
  // freshly accepted job may not have surfaced in the cache yet. Only once a
  // settled fetch genuinely lacks the job is it "not found".
  if (isPending || (!job && isFetching)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Loading your job" />
      </Screen>
    );
  }

  if (!job) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="briefcase-outline"
          title="Job not found"
          message="This job is no longer assigned to you, or it has finished."
        />
      </Screen>
    );
  }

  // Once the pro arrives (or the job otherwise leaves the trip phase), the
  // availability home takes over; the in-person flow is a later milestone.
  if (!isTripStatus(job.status)) {
    return <Redirect href="/home" />;
  }

  const action = SWIPE_ACTION[job.status];
  const customerName = job.customer?.displayName ?? 'Customer';
  const address =
    job.locationLabel ?? job.customer?.locationLabel ?? 'Location shared after you arrive';
  const price = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const isAccepted = job.status === JobStatus.ACCEPTED;
  const swipeLabel = isAccepted ? 'On My Way' : "I've Arrived";

  const routeGeometry: GeoJSON.Feature<GeoJSON.LineString> | null =
    proCoords && hasCustomerCoords
      ? {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [proCoords.longitude, proCoords.latitude],
              [job.longitude as number, job.latitude as number],
            ],
          },
        }
      : null;

  async function openDirections() {
    if (!hasCustomerCoords) return;
    const url = buildDirectionsUrl(proCoords, {
      latitude: job.latitude as number,
      longitude: job.longitude as number,
    });
    try {
      await openURL(url);
    } catch {
      Alert.alert(
        'Could not open Google Maps',
        'Make sure you have an app that can open maps links.',
      );
    }
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false} className="bg-surface">
      {/* Custom header — no native navigation chrome on the trip screen. */}
      <View className="flex-row items-center justify-between bg-surface px-5 pb-3 pt-2">
        <Text variant="title" className="flex-1 pr-3" style={{ fontSize: 17 }}>
          Go To the Working Spot
        </Text>
        <CallMessageButton jobId={id} />
      </View>

      {/* Map body */}
      <View className="flex-1 overflow-hidden">
        <MapLibreMap
          mapStyle={MAP_STYLE_URL}
          style={{ flex: 1 }}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: hasCustomerCoords
                ? [job.longitude as number, job.latitude as number]
                : DEFAULT_CENTER,
              zoom: DEFAULT_ZOOM,
            }}
          />

          {routeGeometry ? (
            <GeoJSONSource id="trip-route" data={routeGeometry}>
              <Layer
                id="trip-route-line"
                type="line"
                paint={{
                  'line-color': color['text-secondary'],
                  'line-width': 3,
                  'line-dasharray': [3, 2],
                  'line-opacity': 0.9,
                }}
              />
            </GeoJSONSource>
          ) : null}

          {hasCustomerCoords ? (
            <Marker
              id="customer"
              anchor="center"
              lngLat={[job.longitude as number, job.latitude as number]}
            >
              <CustomerPin />
            </Marker>
          ) : null}

          {proCoords ? (
            <Marker id="pro" anchor="center" lngLat={[proCoords.longitude, proCoords.latitude]}>
              <ProPin />
            </Marker>
          ) : null}
        </MapLibreMap>

        {/* Floating CTA — launches Google Maps navigation to the work spot.
            Floats above the map, just above the job-details card. `box-none`
            keeps the rest of the map pannable. */}
        {hasCustomerCoords ? (
          <View pointerEvents="box-none" className="absolute inset-x-5 bottom-4 items-center">
            <View
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Button
                label="Navigate"
                shape="pill"
                fullWidth={false}
                leading={<Ionicons name="navigate" size={18} color={color['brand-contrast']} />}
                onPress={() => void openDirections()}
              />
            </View>
          </View>
        ) : null}
      </View>

      {/* Job details + actions */}
      <View className="border-t border-border bg-surface px-5 pb-4 pt-4">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
            <Ionicons name="construct-outline" size={22} color={color.brand} />
          </View>
          <View className="flex-1">
            <Text variant="bodyLg" className="font-semibold">
              {job.service.name}
            </Text>
            <Text variant="footnote" className="text-text-secondary">
              {job.customSkill ?? job.skill.name}
            </Text>
          </View>
          <Text variant="title" className="text-brand">
            {formatInr(price)}
          </Text>
        </View>

        <Divider spaced />

        <View className="flex-row items-start gap-3">
          <Ionicons name="person-circle-outline" size={22} color={color['text-secondary']} />
          <View className="flex-1">
            <Text variant="bodyStrong">{customerName}</Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={2}>
              {address}
            </Text>
          </View>
        </View>

        {proCoords && (job.distanceKm != null || job.estimatedEtaMinutes != null) ? (
          <View className="mt-3 flex-row gap-2">
            {job.estimatedEtaMinutes != null ? (
              <Chip label={formatEta(job.estimatedEtaMinutes)} icon="time-outline" />
            ) : null}
            {job.distanceKm != null ? (
              <Chip label={formatDistance(job.distanceKm)} icon="navigate-outline" />
            ) : null}
          </View>
        ) : null}

        <Button
          label="Message customer"
          variant="secondary"
          className="mt-4"
          leading={<Ionicons name="chatbubble-outline" size={18} color={color['text-primary']} />}
          onPress={() => router.push({ pathname: '/job/[id]/chat', params: { id } })}
        />

        <View className="mt-3" testID="swipe-to-confirm">
          <SwipeToConfirm
            label={swipeLabel}
            loading={isSubmitting}
            onConfirm={() => void run(action!)}
          />
        </View>
      </View>
    </Screen>
  );
}
