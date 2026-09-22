import type { TranslationKey } from '@/i18n';

/**
 * Quick replies a pro can drop into the job chat without typing.
 *
 * Short, practical phrases used on a visit (traffic, wait time, location). The
 * presets are i18n keys resolved against the pro's language; the resolved text
 * is what gets sent to the customer. The customer app keeps its own set of
 * phrases on the customer's side of the conversation.
 */
export const QUICK_CHAT_PRESETS: TranslationKey[] = [
  'quickChat.presets.locationConfirm',
  'quickChat.presets.soon',
  'quickChat.presets.pleaseWait',
  'quickChat.presets.traffic',
  'quickChat.presets.runningLate',
];