/**
 * The Aadhaar capture flow, expressed as pure transitions.
 *
 * Keeping the steps out of the screen makes the awkward paths — retaking the
 * front after the back was captured, or stepping back through a preview — both
 * testable and impossible to implement differently in two places.
 */

export const AADHAAR_SIDES = ['front', 'back'] as const;
export type AadhaarSide = (typeof AADHAAR_SIDES)[number];

export type AadhaarFlowStep = 'front' | 'front-preview' | 'back' | 'back-preview' | 'review';

export const AADHAAR_FLOW_STEPS: readonly AadhaarFlowStep[] = [
  'front',
  'front-preview',
  'back',
  'back-preview',
  'review',
];

/** Where the flow goes after a new capture of `side`. */
export function stepAfterCapture(side: AadhaarSide): AadhaarFlowStep {
  return side === 'front' ? 'front-preview' : 'back-preview';
}

/**
 * Where the flow goes when the Pro accepts the previewed side.
 *
 * `backCaptured` matters when the Pro retakes the front from the review
 * screen: the back already exists, so there is nothing left to capture — going
 * to `back` would ask for a second back photo. The sequential first pass has
 * no back yet, so it still advances to the back capture.
 */
export function stepAfterConfirm(
  side: AadhaarSide,
  backCaptured = false,
): AadhaarFlowStep {
  if (side === 'front') return backCaptured ? 'review' : 'back';
  return 'review';
}

/** The side a step is capturing or previewing. Review is still the back's context. */
export function sideForStep(step: AadhaarFlowStep): AadhaarSide {
  return step === 'front' || step === 'front-preview' ? 'front' : 'back';
}

/** Whether the camera should be live and accepting taps at this step. */
export function isCaptureStep(step: AadhaarFlowStep): boolean {
  return step === 'front' || step === 'back';
}

/**
 * One step backwards. `exit` means the whole flow should close instead: that
 * only happens before the first photo exists, so a Pro can never lose a
 * capture merely by pressing back.
 */
export function stepBack(step: AadhaarFlowStep): AadhaarFlowStep | 'exit' {
  switch (step) {
    case 'front':
      return 'exit';
    case 'front-preview':
      return 'front';
    case 'back':
      return 'front-preview';
    case 'back-preview':
      return 'back';
    case 'review':
      return 'back-preview';
  }
}
