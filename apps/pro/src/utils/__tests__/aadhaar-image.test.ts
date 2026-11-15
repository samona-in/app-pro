import { SaveFormat } from 'expo-image-manipulator';
import { AADHAAR_CARD_ASPECT_RATIO } from '../aadhaar-card';
import {
  AADHAAR_LONG_EDGE,
  AADHAAR_MAX_UPLOAD_BYTES,
  AADHAAR_MIN_SHORT_EDGE,
  aadhaarImageErrorKey,
  createAadhaarImageError,
  cleanupAadhaarImage,
  isAadhaarImageError,
  processAadhaarCapture,
} from '../aadhaar-image';

/** Sizes the fake filesystem reports for processed URIs. */
const mockSavedSizes = new Map<string, number>();
/** URIs the fake filesystem has deleted. */
const mockDeletedUris: string[] = [];
/** Sizes of originals that still exist. */
const mockExistingUris = new Set<string>();

/** Every resize the manipulator was asked for. */
const mockResize = jest.fn();
/** Every crop rectangle the manipulator was asked for. */
const mockCrop = jest.fn();

/** The dimensions the fake save reports back. */
let mockSavedDimensions = { width: 1600, height: 1000 };
/** Optional per-call override, keyed by compress value. */
let mockSizeForQuality: (compress: number) => number | null = () => 1024;

const mockSaveAsync = jest.fn(
  async (_sourceUri: string, options: { compress: number; format: string }) => {
    const uri = `file:///processed-${options.compress}.jpg`;
    const size = mockSizeForQuality(options.compress);
    if (size !== null) mockSavedSizes.set(uri, size);
    mockExistingUris.add(uri);
    return { uri, ...mockSavedDimensions };
  },
);

jest.mock('expo-file-system', () => {
  // A plain constructor function returning its own object: `new File(uri)` in
  // the module under test gets the fake, and no class declaration is needed.
  function MockFile(uri: string) {
    return {
      uri,
      get exists() {
        return mockSavedSizes.has(uri) || mockExistingUris.has(uri);
      },
      get size() {
        return mockSavedSizes.get(uri) ?? 0;
      },
      delete() {
        mockDeletedUris.push(uri);
        mockSavedSizes.delete(uri);
        mockExistingUris.delete(uri);
      },
    };
  }
  return { File: MockFile };
});

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      const context: {
        crop: (rect: {
          originX: number;
          originY: number;
          width: number;
          height: number;
        }) => unknown;
        resize: (size: { width?: number; height?: number }) => unknown;
        renderAsync: () => Promise<{ saveAsync: (options: never) => unknown }>;
      } = {
        crop: (rect) => {
          mockCrop(rect);
          return context;
        },
        resize: (size) => {
          mockResize(size);
          return context;
        },
        renderAsync: async () => ({
          saveAsync: (options: never) => mockSaveAsync(uri, options),
        }),
      };
      return context;
    },
  },
}));

const CAPTURE = {
  uri: 'file:///camera/front.jpg',
  width: 1600,
  height: 1000,
};

describe('processAadhaarCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedSizes.clear();
    mockDeletedUris.length = 0;
    mockExistingUris.clear();
    mockSavedDimensions = { width: 1600, height: 1000 };
    mockSizeForQuality = () => 1024;
  });

  it('keeps a photo already within the long-edge limit without resizing', async () => {
    const image = await processAadhaarCapture(CAPTURE);

    expect(mockResize).not.toHaveBeenCalled();
    expect(image).toMatchObject({
      width: 1600,
      height: 1000,
      originalUri: CAPTURE.uri,
      uri: 'file:///processed-0.9.jpg',
      sizeBytes: 1024,
    });
  });

  it('resizes a landscape photo by its long edge', async () => {
    mockSavedDimensions = { width: AADHAAR_LONG_EDGE, height: 1500 };

    await processAadhaarCapture({ ...CAPTURE, width: 4000, height: 3000 });

    expect(mockResize).toHaveBeenCalledWith({ width: AADHAAR_LONG_EDGE });
  });

  it('resizes the cropped portrait photo by its long edge', async () => {
    mockSavedDimensions = { width: AADHAAR_LONG_EDGE, height: 1261 };

    await processAadhaarCapture({ ...CAPTURE, width: 3000, height: 4000 });

    // The card crop turns a portrait capture landscape, so the width is the
    // long edge that gets bounded.
    expect(mockResize).toHaveBeenCalledWith({ width: AADHAAR_LONG_EDGE });
  });

  it('centre-crops a 4:3 capture to the card frame before resizing', async () => {
    mockSavedDimensions = { width: AADHAAR_LONG_EDGE, height: 1261 };

    await processAadhaarCapture({ ...CAPTURE, width: 4000, height: 3000 });

    const crop = mockCrop.mock.calls[0][0] as {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
    expect(crop.width).toBe(4000);
    expect(crop.width / crop.height).toBeCloseTo(AADHAAR_CARD_ASPECT_RATIO, 2);
    expect(crop.originY).toBeGreaterThan(0);
    expect(Math.abs(crop.originY * 2 + crop.height - 3000)).toBeLessThanOrEqual(1);
  });

  it('centre-crops a portrait capture to the card frame', async () => {
    mockSavedDimensions = { width: 1500, height: AADHAAR_LONG_EDGE };

    await processAadhaarCapture({ ...CAPTURE, width: 3000, height: 4000 });

    const crop = mockCrop.mock.calls[0][0] as {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
    expect(crop.width).toBe(3000);
    expect(crop.width / crop.height).toBeCloseTo(AADHAAR_CARD_ASPECT_RATIO, 2);
    expect(crop.originY).toBeGreaterThan(0);
    expect(Math.abs(crop.originY * 2 + crop.height - 4000)).toBeLessThanOrEqual(1);
  });

  it('trims the sides when the capture is wider than the card', async () => {
    mockSavedDimensions = { width: AADHAAR_LONG_EDGE, height: 1125 };

    await processAadhaarCapture({ ...CAPTURE, width: 3840, height: 2160 });

    const crop = mockCrop.mock.calls[0][0] as {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
    expect(crop.originX).toBeGreaterThan(0);
    expect(crop.originY).toBe(0);
    expect(crop.height).toBe(2160);
    expect(crop.width).toBe(Math.round(2160 * AADHAAR_CARD_ASPECT_RATIO));
  });

  it('re-encodes as JPEG, which is what strips the camera metadata', async () => {
    await processAadhaarCapture(CAPTURE);

    expect(mockSaveAsync).toHaveBeenCalledWith(CAPTURE.uri, {
      compress: 0.9,
      format: SaveFormat.JPEG,
    });
    // The processed copy is a new file; the original is kept separately so a
    // failed upload can be retried without asking for another photo.
    expect(await processAadhaarCapture(CAPTURE)).toMatchObject({
      uri: 'file:///processed-0.9.jpg',
      originalUri: CAPTURE.uri,
    });
  });

  it('retries once at lower quality when the first encode is too large', async () => {
    mockSizeForQuality = (compress) =>
      compress === 0.9 ? AADHAAR_MAX_UPLOAD_BYTES + 1 : AADHAAR_MAX_UPLOAD_BYTES - 1;

    const image = await processAadhaarCapture(CAPTURE);

    expect(mockSaveAsync).toHaveBeenCalledTimes(2);
    expect(mockSaveAsync.mock.calls.map(([, options]) => options.compress)).toEqual([0.9, 0.7]);
    expect(image.sizeBytes).toBe(AADHAAR_MAX_UPLOAD_BYTES - 1);
    expect(image.uri).toBe('file:///processed-0.7.jpg');
  });

  it('rejects a photo that is still too large at the fallback quality', async () => {
    mockSizeForQuality = () => AADHAAR_MAX_UPLOAD_BYTES + 1;

    await expect(processAadhaarCapture(CAPTURE)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('rejects a capture with an unusable short edge before touching it', async () => {
    await expect(
      processAadhaarCapture({ ...CAPTURE, height: AADHAAR_MIN_SHORT_EDGE - 1 }),
    ).rejects.toMatchObject({ code: 'dimensions' });
    expect(mockSaveAsync).not.toHaveBeenCalled();
  });

  it('rejects a capture the camera returned without its dimensions', async () => {
    await expect(processAadhaarCapture({ uri: '', width: 0, height: 0 })).rejects.toMatchObject({
      code: 'unreadable',
    });
  });

  it('rejects a processed image whose dimensions fell below the floor', async () => {
    mockSavedDimensions = { width: 400, height: 300 };

    await expect(processAadhaarCapture(CAPTURE)).rejects.toMatchObject({
      code: 'dimensions',
    });
  });

  it('rejects a processed file whose size cannot be read', async () => {
    mockSizeForQuality = () => null;

    await expect(processAadhaarCapture(CAPTURE)).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('turns an unexpected manipulator failure into a processing error', async () => {
    mockSaveAsync.mockRejectedValueOnce(new Error('native crash'));

    const processing = processAadhaarCapture(CAPTURE);

    await expect(processing).rejects.toMatchObject({
      name: 'AadhaarImageError',
      code: 'processing',
    });
    await expect(processing).rejects.toMatchObject({ code: 'processing' });
  });
});

describe('aadhaarImageErrorKey', () => {
  it.each(['dimensions', 'unreadable', 'too-large', 'processing'] as const)(
    'maps %s to its translation key',
    (code) => {
      expect(aadhaarImageErrorKey(createAadhaarImageError(code))).toBe(`aadhaar.errors.${code}`);
      expect(isAadhaarImageError(createAadhaarImageError(code))).toBe(true);
    },
  );

  it('falls back to the generic processing message for an unknown error', () => {
    expect(aadhaarImageErrorKey(new Error('something else'))).toBe('aadhaar.errors.processing');
    expect(aadhaarImageErrorKey('not an error')).toBe('aadhaar.errors.processing');
  });
});

describe('cleanupAadhaarImage', () => {
  beforeEach(() => {
    mockDeletedUris.length = 0;
    mockSavedSizes.clear();
    mockExistingUris.clear();
  });

  it('deletes both the processed and original local files', () => {
    mockSavedSizes.set('file:///processed.jpg', 10);
    mockExistingUris.add('file:///original.jpg');

    cleanupAadhaarImage({
      uri: 'file:///processed.jpg',
      originalUri: 'file:///original.jpg',
    });

    expect(mockDeletedUris.sort()).toEqual(['file:///original.jpg', 'file:///processed.jpg']);
  });

  it('deletes a shared URI only once', () => {
    mockSavedSizes.set('file:///same.jpg', 10);

    cleanupAadhaarImage({ uri: 'file:///same.jpg', originalUri: 'file:///same.jpg' });

    expect(mockDeletedUris).toEqual(['file:///same.jpg']);
  });

  it('ignores non-file URIs and missing images', () => {
    cleanupAadhaarImage({ uri: 'https://example.test/a.jpg', originalUri: '' });
    cleanupAadhaarImage(null);

    expect(mockDeletedUris).toEqual([]);
  });

  it('never throws when a local file is already gone', () => {
    expect(() =>
      cleanupAadhaarImage({ uri: 'file:///gone.jpg', originalUri: 'file:///also-gone.jpg' }),
    ).not.toThrow();
  });
});
