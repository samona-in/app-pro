/**
 * Floating bottom tab bar used by the customer app.
 *
 * The bar is a detached, rounded pill that hovers above the home indicator
 * instead of spanning the full width of the screen.
 */
export const FLOATING_TAB_BAR_HEIGHT = 62;

/** Horizontal inset of the floating pill from the screen edges. */
export const FLOATING_TAB_BAR_MARGIN = 18;

/** Gap between the pill and the home indicator / Android navigation bar. */
export const FLOATING_TAB_BAR_BOTTOM_GAP = 10;

/**
 * Total bottom padding for scrollable tab content, measured from the
 * safe-area edge: pill height + gap + breathing room. Screens add
 * `insets.bottom` on top of this so the last row can scroll clear of the bar.
 */
export const FLOATING_TAB_BAR_CLEARANCE =
  FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_GAP + 24;

/**
 * Small breathing room between the top of the floating tab bar and the
 * collapsed active-job sheet docked above it.
 */
export const ACTIVE_SHEET_GAP = 6;
