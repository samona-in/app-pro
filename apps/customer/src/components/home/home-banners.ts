import type { ImageSourcePropType } from 'react-native';
import bannerHomeCare from '@/assets/images/banners/banner-1.webp';
import bannerElectrical from '@/assets/images/banners/banner-2.png';
import bannerPlumbing from '@/assets/images/banners/banner-3.png';
import bannerCleaning from '@/assets/images/banners/banner-4.png';

/**
 * One promotional slide on the home banner carousel.
 *
 * Banners are plain data: adding another one is a matter of appending an
 * entry to {@link HOME_BANNERS}. The carousel and the card stay untouched.
 */
export interface HomeBanner {
  /** Stable identity for the list and for the pagination dots. */
  id: string;
  /** Short headline shown at the top of the card. */
  heading: string;
  /** One-line supporting copy under the headline. */
  subtitle: string;
  /** Label of the call-to-action pill. */
  ctaLabel: string;
  /**
   * Catalogue service the banner promotes.
   *
   * `null` marks a general banner that opens the service search instead of a
   * specific booking flow.
   */
  serviceSlug: string | null;
  /** Illustration shown on the right half of the card. */
  image: ImageSourcePropType;
  /** Describes the illustration for screen readers. */
  imageDescription: string;
}

/**
 * The banners shown under the service categories on the home screen.
 *
 * The copy leans on Samona's promise: connect the customer with a local
 * professional who is available now.
 */
export const HOME_BANNERS: HomeBanner[] = [
  {
    id: 'home-care',
    heading: 'Your home needs care.',
    subtitle: "We've got the right people.",
    ctaLabel: 'Explore Services',
    serviceSlug: null,
    image: bannerHomeCare,
    imageDescription: 'A service professional working on a home electrical installation',
  },
  {
    id: 'electrical',
    heading: 'Electrical problems?',
    subtitle: 'Find a professional near you.',
    ctaLabel: 'Find an Electrician',
    serviceSlug: 'electrical',
    image: bannerElectrical,
    imageDescription: 'An electrician testing a switchboard with a screwdriver',
  },
  {
    id: 'plumbing',
    heading: 'Leaky tap? Get it fixed.',
    subtitle: 'Connect with local plumbing professionals.',
    ctaLabel: 'Find a Plumber',
    serviceSlug: 'plumbing',
    image: bannerPlumbing,
    imageDescription: 'A plumber repairing a kitchen sink with a spanner',
  },
  {
    id: 'cleaning',
    heading: 'A cleaner home, made easier.',
    subtitle: 'Find trusted cleaning professionals nearby.',
    ctaLabel: 'Explore Cleaning',
    serviceSlug: 'cleaning',
    image: bannerCleaning,
    imageDescription: 'A cleaning professional spraying a living room sofa',
  },
];
