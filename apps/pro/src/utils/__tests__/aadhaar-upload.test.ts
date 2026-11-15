import type { AadhaarSide } from '../aadhaar-flow';
import type { AadhaarImage } from '../aadhaar-image';
import { uploadAadhaarSides } from '../aadhaar-upload';

function image(side: AadhaarSide): AadhaarImage {
  return {
    uri: `file:///processed-${side}.jpg`,
    originalUri: `file:///original-${side}.jpg`,
    width: 2000,
    height: 1260,
    sizeBytes: 1024,
  };
}

const IMAGES = { front: image('front'), back: image('back') };

describe('uploadAadhaarSides', () => {
  it('uploads the front then the back and reports each id', async () => {
    const order: AadhaarSide[] = [];
    const onUploaded = jest.fn();
    const uploadSide = jest.fn(async (side: AadhaarSide) => {
      order.push(side);
      return { id: `doc-${side}` };
    });

    const result = await uploadAadhaarSides({
      images: IMAGES,
      uploaded: {},
      uploadSide,
      onUploaded,
    });

    expect(order).toEqual(['front', 'back']);
    expect(result).toEqual({ front: 'doc-front', back: 'doc-back' });
    expect(onUploaded).toHaveBeenNthCalledWith(1, 'front', 'doc-front');
    expect(onUploaded).toHaveBeenNthCalledWith(2, 'back', 'doc-back');
  });

  it('skips a side that already reached the server', async () => {
    const uploadSide = jest.fn(async (side: AadhaarSide) => ({ id: `doc-${side}` }));

    const result = await uploadAadhaarSides({
      images: IMAGES,
      uploaded: { front: 'saved-front' },
      uploadSide,
    });

    expect(uploadSide).toHaveBeenCalledTimes(1);
    expect(uploadSide).toHaveBeenCalledWith('back', IMAGES.back);
    expect(result).toEqual({ front: 'saved-front', back: 'doc-back' });
  });

  it('keeps the front id when the back fails, so a retry resumes', async () => {
    const onUploaded = jest.fn();
    const uploadSide = jest.fn(async (side: AadhaarSide) => {
      if (side === 'back') throw new Error('network down');
      return { id: 'doc-front' };
    });

    await expect(
      uploadAadhaarSides({ images: IMAGES, uploaded: {}, uploadSide, onUploaded }),
    ).rejects.toThrow('network down');

    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith('front', 'doc-front');

    // A retry passes the recorded front back in and sends only the back.
    const retry = jest.fn(async (side: AadhaarSide) => ({ id: `retry-${side}` }));
    const result = await uploadAadhaarSides({
      images: IMAGES,
      uploaded: { front: 'doc-front' },
      uploadSide: retry,
    });

    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('back', IMAGES.back);
    expect(result).toEqual({ front: 'doc-front', back: 'retry-back' });
  });

  it('refuses to treat a response without an id as a completed upload', async () => {
    const uploadSide = jest.fn(async () => ({ id: '' }));

    await expect(
      uploadAadhaarSides({ images: IMAGES, uploaded: {}, uploadSide }),
    ).rejects.toThrow(/document id/);
  });

  it('does not upload anything when both sides are already saved', async () => {
    const uploadSide = jest.fn();

    const result = await uploadAadhaarSides({
      images: IMAGES,
      uploaded: { front: 'doc-front', back: 'doc-back' },
      uploadSide,
    });

    expect(uploadSide).not.toHaveBeenCalled();
    expect(result).toEqual({ front: 'doc-front', back: 'doc-back' });
  });
});
