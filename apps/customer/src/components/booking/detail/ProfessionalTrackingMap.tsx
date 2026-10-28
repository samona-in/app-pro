import { View, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { useEffect, useRef, useState } from 'react';
import type { JobDetail } from '@samona/types';
import { customerTrackingService } from '@/services/tracking';
import { subscribe } from '@/services/realtime';

export type ProLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  updatedAt?: string;
  recordedAt?: string;
  sequence?: number;
  accuracy?: number | null;
};

type Props = {
  job: JobDetail;
  proLocation?: ProLocation | null;
};

export function ProfessionalTrackingMap({ job, proLocation: initialProLocation = null }: Props) {
  const mapRef = useRef<MapView>(null);
  const [proLocation, setProLocation] = useState<ProLocation | null>(initialProLocation);
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);
  const [userInteracting, setUserInteracting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastFitRef = useRef<number>(0);

  const customerLat = job.latitude;
  const customerLng = job.longitude;

  const proLat = proLocation?.latitude ?? null;
  const proLng = proLocation?.longitude ?? null;

  const hasCustomerLocation = typeof customerLat === 'number' && typeof customerLng === 'number';
  const hasProLocation = typeof proLat === 'number' && typeof proLng === 'number';

  useEffect(() => {
    if (!job.id) return;
    try {
      const { getRealtimeSocket } = require('@/services/realtime');
      const sock = getRealtimeSocket?.();
      if (sock) {
        sock.emit('booking:tracking:subscribe', { bookingId: job.id });
      }
    } catch {}
    // fetch latest on mount
    void (async () => {
      try {
        const res: any = await customerTrackingService.getLatest(job.id);
        if (res?.data?.latitude && res?.data?.longitude) {
          setProLocation({
            latitude: res.data.latitude,
            longitude: res.data.longitude,
            heading: res.data.heading,
            recordedAt: res.data.recordedAt,
            sequence: res.data.sequence,
            accuracy: res.data.accuracy,
          });
          setTrackingUnavailable(!!res.data.stale || res.data.isAvailable === false);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      try {
        const { getRealtimeSocket } = require('@/services/realtime');
        const sock = getRealtimeSocket?.();
        if (sock) {
          sock.emit('booking:tracking:unsubscribe', { bookingId: job.id });
        }
      } catch {}
    };
  }, [job.id]);

  useEffect(() => {
    if (!job.id) return;
    const unsub1 = subscribe('booking:location:updated' as any, (payload: any) => {
      if (payload?.bookingId === job.id) {
        setProLocation({
          latitude: payload.latitude,
          longitude: payload.longitude,
          heading: payload.heading,
          recordedAt: payload.recordedAt,
          sequence: payload.sequence,
          accuracy: payload.accuracy,
        });
        setTrackingUnavailable(false);
      }
    });
    const unsub2 = subscribe('booking:tracking:unavailable' as any, (payload: any) => {
      if (payload?.bookingId === job.id) {
        setTrackingUnavailable(true);
      }
    });
    const unsub3 = subscribe('booking:tracking:restored' as any, (payload: any) => {
      if (payload?.bookingId === job.id) {
        setTrackingUnavailable(false);
        // refetch
        void (async () => {
          try {
            const res: any = await customerTrackingService.getLatest(job.id);
            if (res?.data?.latitude && res?.data?.longitude) {
              setProLocation({
                latitude: res.data.latitude,
                longitude: res.data.longitude,
                heading: res.data.heading,
                recordedAt: res.data.recordedAt,
                sequence: res.data.sequence,
                accuracy: res.data.accuracy,
              });
            }
          } catch {}
        })();
      }
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [job.id]);

  useEffect(() => {
    if (!userInteracting && hasProLocation && hasCustomerLocation && mapRef.current) {
      const now = Date.now();
      if (now - lastFitRef.current > 2000) {
        lastFitRef.current = now;
        mapRef.current.fitToCoordinates(
          [
            { latitude: customerLat!, longitude: customerLng! },
            { latitude: proLat!, longitude: proLng! },
          ],
          {
            edgePadding: { top: 60, right: 40, bottom: 80, left: 40 },
            animated: true,
          },
        );
      }
    }
  }, [proLat, proLng, userInteracting]);

  if (!hasCustomerLocation) {
    return null;
  }

  const region = {
    latitude: customerLat!,
    longitude: customerLng!,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const recenter = () => {
    setUserInteracting(false);
    if (mapRef.current) {
      const coords = [];
      coords.push({ latitude: customerLat!, longitude: customerLng! });
      if (hasProLocation) {
        coords.push({ latitude: proLat!, longitude: proLng! });
      }
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 80, left: 40 },
        animated: true,
      });
      lastFitRef.current = Date.now();
    }
  };

  const refreshLocation = async () => {
    if (!job.id || refreshing) return;
    setRefreshing(true);
    try {
      const res: any = await customerTrackingService.getLatest(job.id);
      if (res?.data?.latitude && res?.data?.longitude) {
        setProLocation({
          latitude: res.data.latitude,
          longitude: res.data.longitude,
          heading: res.data.heading,
          recordedAt: res.data.recordedAt,
          sequence: res.data.sequence,
          accuracy: res.data.accuracy,
        });
        setTrackingUnavailable(!!res.data.stale || res.data.isAvailable === false);
        setUserInteracting(false);
        recenter();
      } else {
        setTrackingUnavailable(true);
      }
    } catch {
      setTrackingUnavailable(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View className="mb-4 overflow-hidden" style={{ height: 300 }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        onPanDrag={() => setUserInteracting(true)}
        onRegionChangeComplete={() => {}}
        onMapReady={() => {
          if (hasProLocation) {
            recenter();
          }
        }}
      >
        <Marker coordinate={{ latitude: customerLat!, longitude: customerLng! }} title="Service location" anchor={{ x: 0.5, y: 0.5 }}>
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
            <Ionicons name="construct" size={18} color={color.surface} />
          </View>
        </Marker>
        {hasProLocation ? (
          <Marker
            coordinate={{ latitude: proLat!, longitude: proLng! }}
            title="Professional"
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={typeof proLocation?.heading === 'number' ? proLocation.heading : 0}
            flat
          >
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
              <Ionicons name="person" size={18} color={color['brand-contrast']} />
            </View>
          </Marker>
        ) : null}
        {hasProLocation && hasCustomerLocation ? (
          <Polyline
            coordinates={[
              { latitude: proLat!, longitude: proLng! },
              { latitude: customerLat!, longitude: customerLng! },
            ]}
            strokeColor="#054DFF"
            strokeWidth={3}
          />
        ) : null}
      </MapView>
      <Pressable
        onPress={recenter}
        className="absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-full bg-surface"
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
      >
        <Ionicons name="locate" size={20} color={color['text-primary']} />
      </Pressable>
      {!hasProLocation || trackingUnavailable ? (
        <View className="absolute bottom-3 left-4 right-4 flex-row items-center justify-between rounded-lg bg-surface/95 px-3 py-2">
          <Text variant="footnote" className="flex-1 text-text-secondary">
            {trackingUnavailable ? 'Tracking unavailable' : 'Professional location unavailable'}
          </Text>
          <Pressable
            onPress={() => void refreshLocation()}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh location"
            className="ml-2 h-8 w-8 items-center justify-center rounded-full active:opacity-70"
          >
            <Ionicons name={refreshing ? 'sync' : 'refresh'} size={18} color={color.brand} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
