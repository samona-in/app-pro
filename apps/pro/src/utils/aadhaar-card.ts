/**
 * Aadhaar cards are ISO/IEC 7810 ID-1 shaped: 85.6 × 54 mm.
 *
 * One source for the ratio used by the camera frame, the reference example,
 * the capture crop and both preview surfaces, so every card the Pro sees has
 * exactly the proportions of the real document.
 */
export const AADHAAR_CARD_ASPECT_RATIO = 85.6 / 54;
