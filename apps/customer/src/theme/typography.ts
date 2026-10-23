export const textVariants = {
  display: 'text-display font-bold text-text-primary',
  metric: 'text-metric font-bold text-text-primary',
  titleLg: 'text-title-lg font-semibold text-text-primary',
  title: 'text-title font-semibold text-text-primary',
  bodyLg: 'text-body-lg text-text-primary',
  body: 'text-body text-text-primary',
  bodyStrong: 'text-body font-semibold text-text-primary',
  footnote: 'text-footnote text-text-secondary',
  caption: 'text-caption text-text-muted',
  label: 'text-footnote font-semibold text-text-secondary uppercase tracking-wide',
  /** Same size/weight as `label`, but full black for section headings. */
  labelStrong: 'text-footnote font-semibold text-black uppercase tracking-wide',
} as const;

export type TextVariant = keyof typeof textVariants;
