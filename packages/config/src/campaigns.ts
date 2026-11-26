import { CAMPAIGN_DEEP_LINKS, type CampaignSurface } from './constants';

/**
 * Resolves a stored campaign `deepLink` to a route the target app may actually
 * open. Unknown or legacy values stay in the push payload (so old campaigns are
 * not rewritten) but never become navigation targets.
 */
export function resolveCampaignRoute(
  deepLink: unknown,
  surface: CampaignSurface | 'pro' | 'customer',
): string | null {
  if (typeof deepLink !== 'string') return null;
  const key: CampaignSurface = surface === 'PRO' || surface === 'pro' ? 'PRO' : 'CUSTOMER';
  const allowed = CAMPAIGN_DEEP_LINKS[key].some((option) => option.route === deepLink);
  return allowed ? deepLink : null;
}
