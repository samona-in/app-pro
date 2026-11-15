import { useAadhaarStore } from '../aadhaar';
import type { AadhaarImage } from '@/utils/aadhaar-image';

function image(uri: string): AadhaarImage {
  return {
    uri,
    originalUri: `${uri}-original`,
    width: 2000,
    height: 1260,
    sizeBytes: 1024,
  };
}

describe('Aadhaar store', () => {
  beforeEach(() => {
    useAadhaarStore.getState().reset();
  });

  it('starts with no images and no uploaded ids', () => {
    expect(useAadhaarStore.getState()).toMatchObject({ front: null, back: null, uploaded: {} });
  });

  it('keeps each side independent', () => {
    const front = image('file:///front.jpg');
    const back = image('file:///back.jpg');

    useAadhaarStore.getState().setImage('front', front);
    useAadhaarStore.getState().setImage('back', back);

    expect(useAadhaarStore.getState().front).toBe(front);
    expect(useAadhaarStore.getState().back).toBe(back);
  });

  it('clears one side without disturbing the other', () => {
    const front = image('file:///front.jpg');
    useAadhaarStore.getState().setImage('front', front);
    useAadhaarStore.getState().setImage('back', image('file:///back.jpg'));

    useAadhaarStore.getState().clearImage('front');

    expect(useAadhaarStore.getState().front).toBeNull();
    expect(useAadhaarStore.getState().back).not.toBeNull();
  });

  it('records uploaded ids per side', () => {
    useAadhaarStore.getState().markUploaded('front', 'doc-front');
    useAadhaarStore.getState().markUploaded('back', 'doc-back');

    expect(useAadhaarStore.getState().uploaded).toEqual({
      front: 'doc-front',
      back: 'doc-back',
    });
  });

  it('reset drops the images and every upload id', () => {
    useAadhaarStore.getState().setImage('front', image('file:///front.jpg'));
    useAadhaarStore.getState().setImage('back', image('file:///back.jpg'));
    useAadhaarStore.getState().markUploaded('front', 'doc-front');

    useAadhaarStore.getState().reset();

    expect(useAadhaarStore.getState()).toMatchObject({
      front: null,
      back: null,
      uploaded: {},
    });
  });
});
