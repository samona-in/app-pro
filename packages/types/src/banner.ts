export interface HomeBanner {
  id: string;
  key?: string;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  serviceSlug: string | null;
  image: string;
  imageDescription: string;
  sortOrder?: number;
  isActive?: boolean;
}
