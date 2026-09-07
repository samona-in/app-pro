/**
 * Quick replies a pro can drop into the job chat without typing.
 *
 * Short, practical phrases used on a visit (traffic, wait time, location). These
 * are Pro-only — the customer messaging surface has no such composer shortcuts
 * (CLAUDE.md keeps the two jobs' UIs distinct).
 */
export const QUICK_CHAT_PRESETS = [
  'Is your working location as per maps?',
  "I'll be there soon",
  'Pls wait',
  'Heavy traffic on my way',
  'Running a bit late, please wait',
] as const;