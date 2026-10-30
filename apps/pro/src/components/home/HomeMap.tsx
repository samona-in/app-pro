import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  View,
  type ViewStyle,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useProLocationStore } from '@/stores/pro-location';
import { useProLocationSync } from '@/hooks/use-pro-location-sync';
import { regionFor } from '@/utils/map';
import { color } from '@/theme';

/** India-first fallback while the first fix is still on its way. */
const DEFAULT_CENTER: [number, number] = [77.209, 28.6139];
const DEFAULT_ZOOM = 12.5;
const FOLLOW_ZOOM = 16;
const DEFAULT_REGION = regionFor(DEFAULT_CENTER, DEFAULT_ZOOM);
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

const floating: ViewStyle = {
  shadowColor: color['text-primary'],
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
};

/**
 * The live Home map.
 *
 * It subscribes to the shared location store itself — Home, the header and the
 * sheet never re-render on a GPS tick. The camera follows the pro until they
 * pan, at which point following stops and the recenter button lights up. The
 * marker is animated between fixes rather than remounted.
 */
export const HomeMap = memo(function HomeMap() {
  const { t } = useTranslation();
  const coordinates = useProLocationStore((state) => state.coordinates);
  const status = useProLocationStore((state) => state.status);
  const failure = useProLocationStore((state) => state.failure);
  const retry = useProLocationSync(true);

  const mapRef = useRef<MapView | null>(null);
  const followUser = useRef(true);
  const hasCentered = useRef(false);
  const [showRecenter, setShowRecenter] = useState(false);
  const [initialRegion] = useState<Region>(() =>
    coordinates
      ? regionFor([coordinates.longitude, coordinates.latitude], FOLLOW_ZOOM)
      : DEFAULT_REGION,
  );

  // HomeMap only mounts in the online state and `useProLocationSync` is
  // ref-counted, so offline never starts a GPS subscription and the offers sync
  // shares this watcher while it is on screen.

  // Drive the marker through its `coordinate` prop. The imperative
  // `animateMarkerToCoordinate` path runs a native ObjectAnimator that crashes
  // on Android ("LatLng.latitude on a null object reference") when a fix lands
  // while the marker is still attaching or being torn down.
  useEffect(() => {
    if (!coordinates) return;
    if (followUser.current) {
      mapRef.current?.animateToRegion(
        regionFor([coordinates.longitude, coordinates.latitude], FOLLOW_ZOOM),
        hasCentered.current ? 500 : 700,
      );
      hasCentered.current = true;
    }
  }, [coordinates]);

  const recenter = useCallback(() => {
    followUser.current = true;
    setShowRecenter(false);
    const current = useProLocationStore.getState().coordinates;
    if (current) {
      mapRef.current?.animateToRegion(
        regionFor([current.longitude, current.latitude], FOLLOW_ZOOM),
        500,
      );
    } else {
      retry();
    }
  }, [retry]);

  const requestPermission = useCallback(async () => {
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission === 'granted') {
        retry();
        return;
      }
    } catch {
      // Fall through to Settings below.
    }
    void Linking.openSettings();
  }, [retry]);

  const handlePan = useCallback(() => {
    if (!followUser.current) return;
    followUser.current = false;
    setShowRecenter(true);
  }, []);

  const unavailable = status === 'unavailable' && !coordinates;
  const permissionDenied = failure === 'permission';

  return (
    <View className="flex-1 overflow-hidden bg-surface-muted">
      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        userInterfaceStyle="light"
        onPanDrag={handlePan}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={false}
        loadingEnabled
        loadingBackgroundColor={color['surface-muted']}
        loadingIndicatorColor={color.brand}
      >
        {coordinates ? (
          <Marker
            coordinate={coordinates}
            accessibilityLabel={t('dashboard.map.markerLabel')}
          />
        ) : null}
      </MapView>

      {!coordinates && !unavailable ? (
        <View pointerEvents="none" className="absolute inset-x-0 top-1/2 items-center">
          <View
            className="flex-row items-center rounded-full border border-border bg-surface px-4 py-2"
            style={floating}
          >
            <ActivityIndicator size="small" color={color.brand} />
            <Text variant="footnote" className="ml-2">
              {t('dashboard.map.locating')}
            </Text>
          </View>
        </View>
      ) : null}

      {unavailable ? (
        <View className="absolute inset-0 items-center justify-center px-6">
          <View className="w-full rounded-2xl border border-border bg-surface p-5" style={floating}>
            <Text variant="title">
              {permissionDenied
                ? t('dashboard.map.permissionTitle')
                : t('dashboard.map.unavailableTitle')}
            </Text>
            <Text variant="body" className="mt-2 text-text-secondary">
              {permissionDenied
                ? t('dashboard.map.permissionMessage')
                : t('dashboard.map.unavailableMessage')}
            </Text>
            <View className="mt-4 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => void (permissionDenied ? requestPermission() : Promise.resolve(retry()))}
                className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-brand px-4 active:opacity-80"
              >
                <Text variant="bodyStrong" className="text-brand-contrast">
                  {permissionDenied
                    ? t('dashboard.map.allowLocation')
                    : t('dashboard.map.retry')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void Linking.openSettings()}
                className="min-h-[44px] items-center justify-center rounded-xl border border-border-strong bg-surface px-4 active:opacity-80"
              >
                <Text variant="bodyStrong">{t('common.openSettings')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.map.recenter')}
        onPress={recenter}
        className="absolute right-4 h-11 w-11 items-center justify-center rounded-full border border-border bg-surface active:opacity-80"
        style={[floating, { bottom: 188 }]}
      >
        <Ionicons
          name="locate"
          size={22}
          color={showRecenter ? color.brand : color['text-secondary']}
        />
      </Pressable>
    </View>
  );
});
