import {
  AADHAAR_FLOW_STEPS,
  isCaptureStep,
  sideForStep,
  stepAfterCapture,
  stepAfterConfirm,
  stepBack,
} from '../aadhaar-flow';

describe('Aadhaar flow transitions', () => {
  it('previews the side that was just captured', () => {
    expect(stepAfterCapture('front')).toBe('front-preview');
    expect(stepAfterCapture('back')).toBe('back-preview');
  });

  it('asks for the back only once before review', () => {
    expect(stepAfterConfirm('front')).toBe('back');
    expect(stepAfterConfirm('back')).toBe('review');
  });

  it('does not ask for a second back when the front is retaken from review', () => {
    // The back already exists, so confirming a retaken front goes straight back
    // to review rather than restarting the sequential capture.
    expect(stepAfterConfirm('front', true)).toBe('review');
  });

  it('keeps review in the back side context', () => {
    expect(sideForStep('front')).toBe('front');
    expect(sideForStep('front-preview')).toBe('front');
    expect(sideForStep('back')).toBe('back');
    expect(sideForStep('back-preview')).toBe('back');
    expect(sideForStep('review')).toBe('back');
  });

  it('runs the camera only on capture steps', () => {
    expect(isCaptureStep('front')).toBe(true);
    expect(isCaptureStep('back')).toBe(true);
    expect(isCaptureStep('front-preview')).toBe(false);
    expect(isCaptureStep('back-preview')).toBe(false);
    expect(isCaptureStep('review')).toBe(false);
  });

  it('steps back one screen at a time', () => {
    expect(stepBack('front')).toBe('exit');
    expect(stepBack('front-preview')).toBe('front');
    expect(stepBack('back')).toBe('front-preview');
    expect(stepBack('back-preview')).toBe('back');
    expect(stepBack('review')).toBe('back-preview');
  });

  it('only exits the flow before the first capture exists', () => {
    // Every other step has a capture worth preserving.
    expect(stepBack('front')).toBe('exit');
    expect(AADHAAR_FLOW_STEPS.filter((step) => stepBack(step) === 'exit')).toEqual(['front']);
  });

  it('walks forward through the expected order and back to the start', () => {
    let step: ReturnType<typeof stepBack> | 'front' = 'front';
    step = stepAfterCapture('front');
    expect(step).toBe('front-preview');
    step = stepAfterConfirm('front');
    expect(step).toBe('back');
    step = stepAfterCapture('back');
    expect(step).toBe('back-preview');
    step = stepAfterConfirm('back');
    expect(step).toBe('review');

    expect(stepBack('review')).toBe('back-preview');
  });
});
