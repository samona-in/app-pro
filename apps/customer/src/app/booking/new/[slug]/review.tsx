import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { SavedAddress } from '@samona/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import BottomSheet, {
  BottomSheetFooter,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  type BottomSheetBackgroundProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { AddressPickerSheet } from '@/components/address/AddressPickerSheet';
import { ServiceImage } from '@/components/home/ServiceImage';
import { Button, Text } from '@/components/ui';
import {
  useActiveSavedAddress,
  useCreateBooking,
  useResolvedLocationLabel,
  useResolvedPlace,
  useSession,
} from '@/hooks';
import { useBookingDraft } from '@/stores/booking';
import { color, elevation } from '@/theme';
import { savedAddressSecondary } from '@/utils/address';
import { formatRupees } from '@/utils/format';
import {
  formatDuration,
  maxQuantity,
  minQuantity,
  pluralizeUnit,
  pricingModelOf,
  unitPricePaise,
} from '@/utils/pricing';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The sheet rests at exactly the height its content needs, so nothing hides
 * behind the pinned action and the map keeps as much room as possible.
 * The resting height is measured; the fallback only covers the first frame.
 */
const SHEET_FALLBACK_RATIO = 0.46;
/** Pulled-up height, as a share of the window, for the longer detail view. */
const SHEET_EXPANDED_RATIO = 0.82;
/** The sheet never gets shorter than this, so it still reads as a sheet. */
const SHEET_MIN_HEIGHT = 300;
/** Space kept above the sheet for the floating map chrome. */
const SHEET_TOP_RESERVE = 180;
/** Height of the grab handle; snap points are measured below it. */
const SHEET_HANDLE_HEIGHT = 18;
/** Breathing room below the last detail row, inside the scroll area. */
const SHEET_CONTENT_PADDING_BOTTOM = 12;

/**
 * Rough half-span (in degrees) of the box used to frame the service location.
 * Kept tight on purpose (~90 m each way): the customer should see the actual
 * doorway the professional will arrive at, not just the surrounding area.
 */
const FIT_HALF_SPAN = 0.0008;

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;

const styles = StyleSheet.create({
  background: {
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    boxShadow: '0px -16px 24px rgba(15, 23, 42, 0.14)',
  },
  mapMarker: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
});

/**
 * The sheet surface. `@gorhom/bottom-sheet` hands the background an
 * `absoluteFill` style; it must be forwarded or the view collapses to zero
 * height and the map shows straight through the sheet.
 */
function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={[style, styles.background]} />;
}

/** The grabber at the top of the sheet. */
function SheetHandle() {
  return (
    <View className="items-center justify-center" style={{ height: SHEET_HANDLE_HEIGHT }}>
      <View className="h-1.5 w-10 rounded-full bg-border-strong" />
    </View>
  );
}

/** The service location: the address label above a branded pin. */
function ServiceMarker({ label, icon }: { label: string; icon: IoniconName }) {
  return (
    <View className="items-center">
      <View className="rounded-full bg-surface px-3 py-1" style={[elevation.md, { maxWidth: 190 }]}>
        <Text variant="caption" className="font-semibold text-text-primary" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View
        className="mt-1 h-11 w-11 items-center justify-center rounded-full border-[3px] border-surface bg-brand"
        style={styles.mapMarker}
      >
        <Ionicons name={icon} size={20} color={color['brand-contrast']} />
      </View>
    </View>
  );
}

/** A single compact row in the sheet: an icon tile, a title and a caption. */
function DetailRow({
  icon,
  iconClassName,
  iconColor,
  title,
  caption,
  onPress,
  actionLabel,
}: {
  icon: IoniconName;
  iconClassName: string;
  iconColor: string;
  title: string;
  caption: string | null;
  /** When provided, the row becomes tappable and shows an edit affordance. */
  onPress?: () => void;
  actionLabel?: string;
}) {
  const content = (
    <>
      <View className={`h-9 w-9 items-center justify-center rounded-full ${iconClassName}`}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View className="ml-3 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5">
            {caption}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <View className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name="create-outline" size={17} color={color['text-secondary']} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View className="flex-row items-center">{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={actionLabel ?? title}
      onPress={onPress}
      className="flex-row items-center active:opacity-70"
    >
      {content}
    </Pressable>
  );
}

export default function BookingReview() {
  const draft = useBookingDraft();
  const create = useCreateBooking();
  const { customerProfile } = useSession();
  const locationLabel = useResolvedLocationLabel(customerProfile);
  const activeSavedAddress = useActiveSavedAddress(customerProfile);

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  /** A saved address chosen for this booking, overriding the profile default. */
  const [pickedAddress, setPickedAddress] = useState<SavedAddress | null>(null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);

  /** Natural heights, measured so the resting sheet fits its content exactly. */
  const [detailsHeight, setDetailsHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  /**
   * The address the request will be placed at. A pick from the sheet wins;
   * otherwise this follows the profile's active location, which is what the
   * rest of the app treats as "where I book".
   */
  const activeAddress = pickedAddress ?? activeSavedAddress;
  const { data: activePlace } = useResolvedPlace(activeAddress?.placeId);
  const addressLine =
    activePlace?.formattedAddress ??
    (activeAddress
      ? [activeAddress.addressLine1, savedAddressSecondary(activeAddress)]
          .filter((part): part is string => Boolean(part))
          .join(', ')
      : locationLabel);

  const serviceLat =
    activeAddress?.latitude ?? customerProfile?.latitude ?? activeSavedAddress?.latitude ?? null;
  const serviceLng =
    activeAddress?.longitude ?? customerProfile?.longitude ?? activeSavedAddress?.longitude ?? null;
  const hasServiceLocation = serviceLat !== null && serviceLng !== null;

  /**
   * Resting height: the handle, the detail block and the pinned action, so the
   * action sits right below the content instead of off the bottom of the sheet.
   */
  const collapsedHeight = useMemo(() => {
    const maxHeight = windowHeight - insets.top - SHEET_TOP_RESERVE;
    const measured =
      detailsHeight > 0 && footerHeight > 0
        ? SHEET_HANDLE_HEIGHT + detailsHeight + footerHeight + SHEET_CONTENT_PADDING_BOTTOM
        : Math.round(windowHeight * SHEET_FALLBACK_RATIO);

    return Math.min(Math.max(measured, SHEET_MIN_HEIGHT), maxHeight);
  }, [detailsHeight, footerHeight, windowHeight, insets.top]);

  /** Pulled-up height for reference photos and a longer description. */
  const expandedHeight = useMemo(
    () =>
      Math.max(
        collapsedHeight + 96,
        Math.min(windowHeight * SHEET_EXPANDED_RATIO, windowHeight - insets.top - 72),
      ),
    [collapsedHeight, windowHeight, insets.top],
  );

  const snapPoints = useMemo(
    () => [collapsedHeight, expandedHeight] as number[],
    [collapsedHeight, expandedHeight],
  );

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  /**
   * Frames the service location in the map area that stays visible above the
   * sheet. A symmetric box around the pin plus asymmetric edge padding puts
   * the pin at the centre of the unobstructed map — on both map providers —
   * so the customer always sees where the work will happen.
   */
  const focusServiceLocation = useCallback(
    (animated: boolean) => {
      if (!mapReady || !mapRef.current || serviceLat === null || serviceLng === null) return;

      mapRef.current.fitToCoordinates(
        [
          { latitude: serviceLat - FIT_HALF_SPAN, longitude: serviceLng - FIT_HALF_SPAN },
          { latitude: serviceLat + FIT_HALF_SPAN, longitude: serviceLng + FIT_HALF_SPAN },
        ],
        {
          edgePadding: {
            top: insets.top + 72,
            right: 48,
            bottom: collapsedHeight + 40,
            left: 48,
          },
          animated,
        },
      );
    },
    [mapReady, serviceLat, serviceLng, insets.top, collapsedHeight],
  );

  useEffect(() => {
    if (!mapReady) return;
    // Glide the pin up into the unobstructed map on first paint and whenever
    // the service location changes. The fit is deferred a frame so the new
    // marker coordinate has reached the native map first.
    const frame = requestAnimationFrame(() => focusServiceLocation(true));
    return () => cancelAnimationFrame(frame);
  }, [mapReady, focusServiceLocation]);

  const handleSheetChange = useCallback(
    (index: number) => {
      void Haptics.impactAsync(
        index > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
      // Returning to the resting height always brings the pin back into the
      // unobstructed part of the map.
      if (index === 0) focusServiceLocation(true);
    },
    [focusServiceLocation],
  );

  /** Keeps the resting snap point in step with the real content height. */
  const handleDetailsLayout = useCallback((event: LayoutChangeEvent) => {
    setDetailsHeight(event.nativeEvent.layout.height);
  }, []);

  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height);
  }, []);

  const skillLabel = draft.customSkill || draft.skill?.name || '—';
  const locationTitle = activeAddress?.name.trim() || 'Service location';
  const locationCaption = addressLine && addressLine !== locationTitle ? addressLine : null;
  const amountLabel = draft.basePayPaise > 0 ? formatRupees(draft.basePayPaise) : '—';
  const pricingModel = pricingModelOf(draft.skill);
  const unitPrice = unitPricePaise(draft.skill);
  const quantityLabel =
    pricingModel === 'PER_UNIT'
      ? `${draft.quantity} ${pluralizeUnit(draft.skill?.unitLabel ?? 'unit', draft.quantity)}${
          unitPrice !== null ? ` × ${formatRupees(unitPrice)}` : ''
        }`
      : pricingModel === 'PER_HOUR'
        ? `${formatDuration(draft.durationMinutes ?? 60)}${
            unitPrice !== null ? ` × ${formatRupees(unitPrice)} / hr` : ''
          }`
        : 'Base fare for this work';
  const referencePhotos = draft.images.filter((image) => Boolean(image.uri));
  const hasDescription = draft.description.trim().length > 0;

  const onSubmit = useCallback(async () => {
    if (create.isPending) return;
    if (!draft.service || !draft.skill) return;

    // Snapshot the chosen location onto the job. Sending it explicitly means a
    // booking-specific address does not depend on (or overwrite) the profile's
    // active location. The label is capped at the validator's 160 characters.
    const trimmedAddress = addressLine?.trim();
    const locationInput =
      trimmedAddress && trimmedAddress.length >= 2
        ? { locationLabel: trimmedAddress.slice(0, 160) }
        : {};

    let job;
    try {
      job = await create.mutateAsync({
        serviceSlug: draft.service.slug,
        skillSlug: draft.skill.slug,
        customSkill: draft.customSkill.trim() || undefined,
        description: draft.description.trim(),
        imagePaths: draft.images
          .map((image) => image.path)
          .filter((path): path is string => Boolean(path)),
        quantity: Math.min(
          maxQuantity(draft.skill),
          Math.max(minQuantity(draft.skill), draft.quantity),
        ),
        ...(pricingModelOf(draft.skill) === 'PER_HOUR' && draft.durationMinutes !== null
          ? { durationMinutes: draft.durationMinutes }
          : {}),
        ...locationInput,
        ...(serviceLat !== null && serviceLng !== null
          ? { latitude: serviceLat, longitude: serviceLng }
          : {}),
      });
    } catch {
      // The sheet surfaces `create.isError`; a failed request must not be
      // reported as a successful booking.
      return;
    }

    if (job) {
      const bookingId = job.id;
      // Land straight on the live booking, with no confirmation detour. The
      // finished three-step flow is dismissed first so back from the booking
      // lands on the tabs, not on a step the customer already completed.
      router.dismissAll();
      router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
      // Clear the draft after the transition: resetting it here would re-render
      // this screen with empty content while the navigator is tearing it down.
      setTimeout(() => draft.reset(), 0);
    }
  }, [create, draft, addressLine, serviceLat, serviceLng]);

  const handleSelectAddress = useCallback((address: SavedAddress) => {
    setPickedAddress(address);
    setAddressPickerOpen(false);
  }, []);

  /**
   * Opens the existing add-address flow. It makes the new place the profile's
   * active location, so clearing the local pick lets the preview follow it when
   * the customer comes back.
   */
  const handleAddAddress = useCallback(() => {
    setAddressPickerOpen(false);
    setPickedAddress(null);
    router.push({ pathname: '/address-search', params: { mode: 'booking' } });
  }, []);

  /**
   * The action is rendered through `footerComponent`, not as the last child of
   * the sheet. `@gorhom/bottom-sheet` sizes the children to the tallest snap
   * point, so a footer in the normal flow lands far below the resting sheet and
   * is only reachable by dragging it up. The footer component is anchored to
   * the sheet's bottom edge at every snap point, so "Place request" is always
   * on screen.
   */
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View
          onLayout={handleFooterLayout}
          className="border-t border-border bg-surface px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {create.isError ? (
            <Text variant="footnote" className="mb-2 text-center text-danger">
              Could not place your request. Please try again.
            </Text>
          ) : null}
          <Button
            label="Place request"
            size="lg"
            loading={create.isPending}
            onPress={() => void onSubmit()}
          />
        </View>
      </BottomSheetFooter>
    ),
    [insets.bottom, create.isError, create.isPending, handleFooterLayout, onSubmit],
  );

  return (
    <View className="flex-1 bg-surface-muted">
      {hasServiceLocation ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          userInterfaceStyle="light"
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: serviceLat,
            longitude: serviceLng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onMapReady={() => setMapReady(true)}
          toolbarEnabled={false}
          showsCompass={false}
          showsMyLocationButton={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Marker
            // `react-native-maps` snapshots a marker's custom view on Android.
            // Updating the coordinate or label in place can leave a stale,
            // blank snapshot — the pin vanishes after switching addresses — so
            // the marker is remounted whenever the service location changes.
            key={`service-${serviceLat}-${serviceLng}-${locationTitle}`}
            coordinate={{ latitude: serviceLat, longitude: serviceLng }}
            anchor={{ x: 0.5, y: 0.92 }}
          >
            <ServiceMarker label={locationTitle} icon="location" />
          </Marker>
        </MapView>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="location-outline" size={40} color={color['text-muted']} />
          <Text variant="body" className="mt-2 text-text-secondary">
            Service location unavailable
          </Text>
        </View>
      )}

      {/* Floating chrome: back and the recenter control. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 flex-row items-center justify-between px-4"
        style={{ top: insets.top + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-80"
          style={elevation.md}
        >
          <Ionicons name="arrow-back" size={22} color={color['text-primary']} />
        </Pressable>
      </View>

      {hasServiceLocation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter on the service location"
          onPress={() => focusServiceLocation(true)}
          className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-80"
          style={[elevation.md, { bottom: collapsedHeight + 16 }]}
        >
          <Ionicons name="locate" size={21} color={color.brand} />
        </Pressable>
      ) : null}

      <BottomSheet
        index={0}
        snapPoints={snapPoints}
        enableOverDrag={false}
        enablePanDownToClose={false}
        enableDynamicSizing={false}
        animationConfigs={springConfig}
        backgroundComponent={SheetBackground}
        handleComponent={SheetHandle}
        footerComponent={renderFooter}
        onChange={handleSheetChange}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: SHEET_CONTENT_PADDING_BOTTOM,
          }}
        >
          <View onLayout={handleDetailsLayout}>
            {/* Service + amount: the two things the customer checks first. */}
            <View className="flex-row items-center">
              <ServiceImage
                uri={draft.service?.icon}
                accessibilityLabel={draft.service?.name}
                className="h-12 w-12"
              />
              <View className="ml-3 flex-1 pr-3">
                <Text variant="title" numberOfLines={1}>
                  {draft.service?.name ?? '—'}
                </Text>
                <Text variant="caption" numberOfLines={1} className="mt-0.5">
                  {skillLabel}
                </Text>
                <Text variant="caption" numberOfLines={1} className="mt-0.5">
                  {quantityLabel}
                </Text>
              </View>
              <View className="items-end">
                <Text variant="caption">
                  {pricingModel === 'PER_BOOKING' ? 'Base pay' : 'Estimated total'}
                </Text>
                <Text variant="titleLg" className="mt-0.5">
                  {amountLabel}
                </Text>
              </View>
            </View>

            <View className="my-4 h-px bg-border" />

            <DetailRow
              icon="location"
              iconClassName="bg-brand-soft"
              iconColor={color.brand}
              title={locationTitle}
              caption={locationCaption}
              onPress={() => setAddressPickerOpen(true)}
              actionLabel="Change service address"
            />

            {hasDescription ? (
              <View className="mt-3 flex-row items-start">
                <Ionicons
                  name="reader-outline"
                  size={16}
                  color={color['text-muted']}
                  style={{ marginTop: 2 }}
                />
                <Text
                  variant="footnote"
                  numberOfLines={2}
                  className="ml-2 flex-1 text-text-secondary"
                >
                  {draft.description}
                </Text>
              </View>
            ) : null}

            {/* Trust line stays above the photos so it is visible at rest. */}
            <View className="mt-3 flex-row items-center">
              <Ionicons name="shield-checkmark" size={14} color={color.success} />
              <Text variant="caption" className="ml-1.5">
                Pay after the work is done
              </Text>
            </View>

            {referencePhotos.length > 0 ? (
              <View className="mt-3 flex-row items-center gap-2">
                <Ionicons name="images-outline" size={16} color={color['text-muted']} />
                {referencePhotos.slice(0, 4).map((image) => (
                  <Image
                    key={image.uri}
                    source={{ uri: image.uri }}
                    className="h-11 w-11 rounded-lg"
                  />
                ))}
                {referencePhotos.length > 4 ? (
                  <View className="h-11 w-11 items-center justify-center rounded-lg bg-surface-muted">
                    <Text variant="caption" className="font-semibold">
                      +{referencePhotos.length - 4}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      <AddressPickerSheet
        visible={addressPickerOpen}
        selectedId={activeAddress?.id ?? null}
        onClose={() => setAddressPickerOpen(false)}
        onSelect={handleSelectAddress}
        onAddNew={handleAddAddress}
      />
    </View>
  );
}
