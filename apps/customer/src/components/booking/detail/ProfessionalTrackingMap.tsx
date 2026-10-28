import { View, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { useRef, useState } from 'react';
import type { JobDetail } from '@samona/types';

export type ProLocation = {
  latitude: number;
  longitude: number;
  heading?: number;
  updatedAt?: string;
};

type Props = {
  job: JobDetail;
  proLocation?: ProLocation | null;
};

export function ProfessionalTrackingMap({ job, proLocation = null }: Props) {
  const mapRef = useRef<MapView>(null);
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  const customerLat = job.latitude;
  const customerLng = job.longitude;

  const proLat = proLocation?.latitude ?? null;
  const proLng = proLocation?.longitude ?? null;

  const hasCustomerLocation = typeof customerLat === 'number' && typeof customerLng === 'number';
  const hasProLocation = typeof proLat === 'number' && typeof proLng === 'number';

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
    if (mapRef.current) {
      const coords = [];
      coords.push({ latitude: customerLat!, longitude: customerLng! });
      if (hasProLocation) {
        coords.push({ latitude: proLat!, longitude: proLng! });
      }
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
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
        onMapReady={() => {
          if (hasProLocation) {
            recenter();
          }
        }}
      >
        <Marker coordinate={{ latitude: customerLat!, longitude: customerLng! }} title="Service location">
          <Ionicons name="location" size={32} color="#054DFF" />
        </Marker>
        {hasProLocation ? (
          <Marker
            coordinate={{ latitude: proLat!, longitude: proLng! }}
            title="Professional"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-brand">
              <Ionicons name="car" size={18} color={color['brand-contrast']} />
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
            strokeWidth={2}
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
      {!hasProLocation ? (
        <View className="absolute bottom-3 left-4 right-4 bg-surface/90 px-3 py-2">
          <Text variant="footnote" className="text-center text-text-secondary">
            Professional location unavailable
          </Text>
        </View>
      ) : null}
    </View>
  );
}
