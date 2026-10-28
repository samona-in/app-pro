import { formatPhoneForCall as formatPhoneForCallShared } from '@samona/validation';

export { formatPhoneForCallShared as formatPhoneForCall };
export { formatIndianPhoneNumber } from '@samona/validation';

export function openTelLink(phone: string | null | undefined): string | null {
  const formatted = formatPhoneForCallShared(phone);
  if (!formatted) return null;
  return `tel:${formatted}`;
}
