/** How a banner is rendered on the customer home screen. */
export type BannerType = 'PROMO' | 'IMAGE';

export interface HomeBanner {
  id: string;
  key?: string;
  type: BannerType;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  serviceSlug: string | null;
  image: string;
  imageDescription: string;
  /**
   * Optional http(s) destination for an IMAGE banner. Promo banners keep their
   * existing service-slug/search behaviour and ignore this field.
   */
  linkUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}
