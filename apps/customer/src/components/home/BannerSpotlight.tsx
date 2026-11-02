import { useEffect, useState } from 'react';
import {
  Image as RNImage,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageURISource,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** How long the highlight takes to cross the illustration. */
const SWEEP_MS = 1600;
/** The gap between sweeps, so the effect reads as an occasional glint. */
const PAUSE_MS = 2600;
/** Width of the highlight band, as a share of the illustration's width. */
const BEAM_RATIO = 0.4;
/** Tilt of the band; the sweep itself still runs top-left to bottom-right. */
const TILT_DEG = 18;
/** How far the light drifts down while it travels right, as a share of height. */
const DRIFT_RATIO = 0.5;
/**
 * The band is taller than the illustration so its tilted ends never show as
 * square edges, and so the drift keeps it covering the artwork.
 */
const BAND_HEIGHT_RATIO = 2;

/**
 * Stacked bands that fade the highlight's edges.
 *
 * Each band reveals the subject's own silhouette, so the glow can only ever
 * appear on the illustration and never on the brand-blue card behind it.
 */
const BANDS = [
  { width: 1, opacity: 0.08 },
  { width: 0.7, opacity: 0.1 },
  { width: 0.4, opacity: 0.13 },
] as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BannerSpotlightProps {
  /** Illustration the glint may appear on, used as the light's shape. */
  image: ImageSourcePropType;
  /** When false the sweep stops and resets — reduced motion or an unfocused screen. */
  active: boolean;
}

/**
 * A diagonal glint that sweeps across the banner illustration.
 *
 * The banners are cut-out subjects on a transparent background. Instead of
 * painting a light band over the artwork, the glint is a white-tinted copy of
 * the subject itself, revealed through a narrow window that slides from the
 * top-left corner toward the bottom-right. Because the tinted copy keeps the
 * artwork's alpha channel, transparent pixels stay transparent: the light can
 * never fall outside the subject.
 */
export function BannerSpotlight({ image, active }: BannerSpotlightProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active || size.width <= 0) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
        withDelay(PAUSE_MS, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [active, progress, size.width]);

  // The artwork is letterboxed inside the art box by `contentFit="contain"`,
  // so the light has to travel across the drawn rect, not the box, to line up
  // with every banner regardless of its aspect ratio.
  const area = fittedRect(size, image);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="banner-spotlight"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
    >
      {active && size.width > 0 && size.height > 0
        ? BANDS.map((band) => (
            <BeamBand
              key={band.width}
              image={image}
              area={area}
              boxWidth={size.width}
              boxHeight={size.height}
              slice={band.width}
              opacity={band.opacity}
              progress={progress}
            />
          ))
        : null}
    </View>
  );
}

interface BeamBandProps {
  image: ImageSourcePropType;
  /** The rect the base artwork is actually drawn into, inside the art box. */
  area: Rect;
  /** Size of the art box the highlight is laid over. */
  boxWidth: number;
  boxHeight: number;
  /** This band's width, relative to the widest band. */
  slice: number;
  opacity: number;
  progress: SharedValue<number>;
}

/**
 * One band of the glint: a tilted window with the subject's white silhouette
 * inside it.
 *
 * The window slides and tilts; the silhouette is counter-transformed by the
 * exact inverse, so it stays pixel-aligned with the artwork while only the
 * part inside the window is visible.
 *
 * Both views rotate around their own centre, so the compensation is a single
 * pure translation — no `transformOrigin` needed, which keeps the alignment
 * stable across platforms.
 */
function BeamBand({ image, area, boxWidth, boxHeight, slice, opacity, progress }: BeamBandProps) {
  const bandWidth = Math.max(area.width * BEAM_RATIO * slice, 8);
  const bandHeight = area.height * BAND_HEIGHT_RATIO;
  const drift = area.height * DRIFT_RATIO;

  const bandLeft = area.x;
  const bandTop = area.y - area.height / 2;

  // The silhouette view spans the whole art box, so `contentFit="contain"`
  // lays the artwork out exactly where the base image sits.
  const subjectLeft = bandWidth / 2 - boxWidth / 2;
  const subjectTop = bandHeight / 2 - boxHeight / 2;

  // Window offsets at p = 0, plus how far each grows over one sweep.
  const travelX = area.width + bandWidth;
  const travelY = drift * 2;
  const startX = -bandWidth;
  const startY = -drift;

  // The silhouette's (still untransformed) offset inside the window at p = 0,
  // and its velocity, used to cancel the window's motion and rotation.
  const inverseX = bandLeft + subjectLeft + startX;
  const inverseY = bandTop + subjectTop + startY;

  const tilt = (TILT_DEG * Math.PI) / 180;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  const windowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX + progress.value * travelX },
      { translateY: startY + progress.value * travelY },
      { rotate: `${TILT_DEG}deg` },
    ],
  }));

  const subjectStyle = useAnimatedStyle(() => {
    // Rotate the window's offset into the silhouette's frame, then negate it,
    // so the artwork stays put while the window slides over it.
    const x = inverseX + progress.value * travelX;
    const y = inverseY + progress.value * travelY;

    return {
      transform: [
        { translateX: -(x * cos + y * sin) },
        { translateY: -(-x * sin + y * cos) },
        { rotate: `${-TILT_DEG}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.window,
        { left: bandLeft, top: bandTop, width: bandWidth, height: bandHeight },
        windowStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.subject,
          {
            left: subjectLeft,
            top: subjectTop,
            width: boxWidth,
            height: boxHeight,
            opacity,
          },
          subjectStyle,
        ]}
      >
        <Image
          source={image}
          style={styles.subjectImage}
          contentFit="contain"
          tintColor="#ffffff"
          transition={0}
        />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The box the base image is drawn into under `contentFit="contain"`.
 *
 * Exported so the per-image fitting can be tested directly; the glint's travel
 * and window are derived from this rect.
 */
export function fittedRect(
  box: { width: number; height: number },
  image: ImageSourcePropType,
): Rect {
  const intrinsic = intrinsicSize(image);

  if (!intrinsic) {
    return { x: 0, y: 0, width: box.width, height: box.height };
  }

  const scale = Math.min(box.width / intrinsic.width, box.height / intrinsic.height);
  const width = intrinsic.width * scale;
  const height = intrinsic.height * scale;

  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}

/** The source's own pixel size, when it can be resolved. */
function intrinsicSize(image: ImageSourcePropType): { width: number; height: number } | null {
  if (Array.isArray(image)) {
    const first = image[0];
    return first ? intrinsicSize(first) : null;
  }

  if (typeof image === 'number') {
    // Bundled assets (the usual case for the home banners) only expose their
    // dimensions through the asset registry.
    const resolved = RNImage.resolveAssetSource(image);
    if (resolved && resolved.width > 0 && resolved.height > 0) {
      return { width: resolved.width, height: resolved.height };
    }
    return null;
  }

  const source = image as ImageURISource | null | undefined;
  if (
    source &&
    typeof source.width === 'number' &&
    typeof source.height === 'number' &&
    source.width > 0 &&
    source.height > 0
  ) {
    return { width: source.width, height: source.height };
  }

  return null;
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    overflow: 'hidden',
  },
  subject: {
    position: 'absolute',
  },
  subjectImage: {
    width: '100%',
    height: '100%',
  },
});
