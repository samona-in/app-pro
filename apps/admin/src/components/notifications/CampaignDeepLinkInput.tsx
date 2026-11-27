'use client';

import { CAMPAIGN_DEEP_LINKS, resolveCampaignRoute, type CampaignSurface } from '@samona/config';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CampaignDeepLinkInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** A mixed audience keeps only routes valid on every targeted surface. */
  surfaces: CampaignSurface[];
  label?: string;
}

/** Routes an admin may type or select for the given audience surfaces. */
export function allowedDeepLinkOptions(surfaces: CampaignSurface[]) {
  const normalized = [
    ...new Set<CampaignSurface>(surfaces.length ? surfaces : ['PRO', 'CUSTOMER']),
  ];
  const [first, ...rest] = normalized;
  if (!first) return [];

  return CAMPAIGN_DEEP_LINKS[first].filter((option) =>
    rest.every((surface) => resolveCampaignRoute(option.route, surface) === option.route),
  );
}

/** Client-side mirror of the server's allowlist check; the server still decides. */
export function isAllowedCampaignDeepLink(value: string, surfaces: CampaignSurface[]): boolean {
  const route = value.trim();
  if (!route) return true;
  return allowedDeepLinkOptions(surfaces).some((option) => option.route === route);
}

/**
 * Deep links remain allowlisted, but admins can either pick a suggestion or
 * type the exact route. This keeps the server and apps safe without forcing a
 * dropdown click for a known path.
 */
export function CampaignDeepLinkInput({
  id,
  value,
  onChange,
  surfaces,
  label = 'Deep link (optional)',
}: CampaignDeepLinkInputProps) {
  const options = allowedDeepLinkOptions(surfaces);
  const invalid = !isAllowedCampaignDeepLink(value, surfaces);
  const listId = `${id}-options`;
  const helpId = `${id}-help`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={options[0]?.route ?? '/profile'}
        aria-invalid={invalid || undefined}
        aria-describedby={helpId}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.route} value={option.route} label={option.label} />
        ))}
      </datalist>
      <p id={helpId} className={invalid ? 'text-xs text-red-600' : 'text-xs text-gray-500'}>
        {invalid
          ? `Allowed routes: ${options.map((option) => option.route).join(', ')}`
          : 'Type or choose an allowlisted route.'}
      </p>
    </div>
  );
}
