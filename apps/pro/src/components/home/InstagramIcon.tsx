import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Instagram's brand glyph: the gradient rounded square, white camera ring and
 * white dot. Drawn locally so the link has no remote image dependency.
 */
const GRADIENT_ID = 'samonaInstagramGradient';

export interface InstagramIconProps {
  size?: number;
}

export function InstagramIcon({ size = 20 }: InstagramIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID="instagram-icon" accessible={false}>
      <Defs>
        <LinearGradient
          id={GRADIENT_ID}
          x1="2"
          y1="22"
          x2="22"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FEDA75" />
          <Stop offset="0.25" stopColor="#FA7E1E" />
          <Stop offset="0.5" stopColor="#D62976" />
          <Stop offset="0.75" stopColor="#962FBF" />
          <Stop offset="1" stopColor="#4F5BD5" />
        </LinearGradient>
      </Defs>
      <Rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill={`url(#${GRADIENT_ID})`} />
      <Circle cx="12" cy="12" r="4.3" fill="none" stroke="#FFFFFF" strokeWidth="1.9" />
      <Circle cx="18" cy="6" r="1.35" fill="#FFFFFF" />
    </Svg>
  );
}
