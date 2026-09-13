/*
 * SAMONA Pro — job-alert native design tokens.
 *
 * This file is a native mirror of the single source of truth,
 * `apps/pro/src/theme/tokens.js` (semantic `colors` block). Every value here
 * is the resolved hex of a semantic token; if you change a token, change that
 * file and this one together. A parity test
 * (`server/src/notifications/notifications.service.spec.ts`) asserts the two
 * never drift apart.
 *
 * Token aliases are the canonical names from tokens.js, e.g. `text-primary`,
 * `text-secondary`, `text-muted`, `border`, `brand`, `success`, `warning`,
 * `danger`.
 */
object JobAlertTheme {
  // Surfaces
  const val SURFACE = 0xFFFFFFFFL.toInt() // tokens.surface (white)
  const val SURFACE_MUTED = 0xFFF1F5F9.toInt() // tokens.surface-muted (ink-100)
  const val BACKGROUND = 0xFFF8FAFC.toInt() // tokens.background (ink-50)
  const val SURFACE_INVERSE = 0xFF0F172A.toInt() // tokens.surface-inverse (ink-900)

  // Text
  const val TEXT_PRIMARY = 0xFF0F172A.toInt() // tokens.text-primary (ink-900)
  const val TEXT_SECONDARY = 0xFF64748B.toInt() // tokens.text-secondary (ink-500)
  const val TEXT_MUTED = 0xFF94A3B8.toInt() // tokens.text-muted (ink-400)
  const val TEXT_INVERSE = 0xFFFFFFFF.toInt() // tokens.text-inverse (white)

  // Lines
  const val BORDER = 0xFFE2E8F0.toInt() // tokens.border (ink-200)
  const val BORDER_STRONG = 0xFFCBD5E1.toInt() // tokens.border-strong (ink-300)

  // Brand — SAMONA blue, the primary action colour.
  const val BRAND = 0xFF054DFF.toInt() // tokens.brand (blue-600)
  const val BRAND_MUTED = 0xFF053FCC.toInt() // tokens.brand-muted (blue-700)
  const val BRAND_CONTOUR = 0xFFFFFFFF.toInt() // tokens.brand-contrast (text-inverse)

  // Status
  const val SUCCESS = 0xFF059669.toInt() // tokens.success (green-600)
  const val SUCCESS_SURFACE = 0xFFECFDF5.toInt() // tokens.success-surface (green-50)
  const val WARNING = 0xFFD97706.toInt() // tokens.warning (amber-600)
  const val DANGER = 0xFFDC2626.toInt() // tokens.danger (red-600)
  const val DANGER_SURFACE = 0xFFFEF2F2.toInt() // tokens.danger-surface (red-50)
}
