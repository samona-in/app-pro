import { act, renderHook, waitFor } from '@testing-library/react-native';
import { DocumentType } from '@samona/types';
import { useAadhaarStore } from '@/stores';
import type { AadhaarImage } from '@/utils/aadhaar-image';
import { useSubmitAadhaar } from '../use-submit-aadhaar';

const mockMutateAsync = jest.fn();

jest.mock('@/hooks/use-documents', () => ({
  useUploadDocument: () => ({ mutateAsync: mockMutateAsync }),
}));

function image(side: 'front' | 'back'): AadhaarImage {
  return {
    uri: `file:///processed-${side}.jpg`,
    originalUri: `file:///original-${side}.jpg`,
    width: 2000,
    height: 1260,
    sizeBytes: 1024,
  };
}

const FRONT = image('front');
const BACK = image('back');

describe('useSubmitAadhaar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAadhaarStore.getState().reset();
  });

  it('submits both sides as ordinary ID-proof documents', async () => {
    mockMutateAsync.mockImplementation(async ({ fileName }: { fileName: string }) => ({
      id: fileName.includes('front') ? 'doc-front' : 'doc-back',
    }));

    const { result } = renderHook(() => useSubmitAadhaar());

    let success = false;
    await act(async () => {
      success = await result.current.submit(FRONT, BACK);
    });

    expect(success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    expect(mockMutateAsync).toHaveBeenNthCalledWith(1, {
      type: DocumentType.ID_PROOF,
      localUri: FRONT.uri,
      fileName: 'Aadhaar front.jpg',
      contentType: 'image/jpeg',
    });
    expect(mockMutateAsync).toHaveBeenNthCalledWith(2, {
      type: DocumentType.ID_PROOF,
      localUri: BACK.uri,
      fileName: 'Aadhaar back.jpg',
      contentType: 'image/jpeg',
    });
    expect(useAadhaarStore.getState().uploaded).toEqual({
      front: 'doc-front',
      back: 'doc-back',
    });
  });

  it('keeps the saved front and resumes with only the back after a partial failure', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ id: 'doc-front' })
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useSubmitAadhaar());

    let success = true;
    await act(async () => {
      success = await result.current.submit(FRONT, BACK);
    });

    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
    expect(success).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(useAadhaarStore.getState().uploaded).toEqual({ front: 'doc-front' });

    // The retry passes the saved front back in, so it is never uploaded twice.
    mockMutateAsync.mockResolvedValueOnce({ id: 'doc-back' });
    await act(async () => {
      success = await result.current.submit(FRONT, BACK);
    });

    expect(success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    expect(mockMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ localUri: BACK.uri, fileName: 'Aadhaar back.jpg' }),
    );
    expect(useAadhaarStore.getState().uploaded).toEqual({
      front: 'doc-front',
      back: 'doc-back',
    });
  });

  it('drops a duplicate submit that lands while the first is in flight', async () => {
    let resolveFirst: (document: { id: string }) => void = () => {};
    const pending = new Promise<{ id: string }>((resolve) => {
      resolveFirst = resolve;
    });
    mockMutateAsync.mockReturnValue(pending);

    const { result } = renderHook(() => useSubmitAadhaar());

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.submit(FRONT, BACK);
    });

    let duplicate = true;
    await act(async () => {
      duplicate = await result.current.submit(FRONT, BACK);
    });

    expect(duplicate).toBe(false);
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ id: 'doc-front' });
      await first;
    });

    expect(useAadhaarStore.getState().uploaded.front).toBe('doc-front');
  });

  it('does not re-upload sides the store already marks as saved', async () => {
    useAadhaarStore.getState().markUploaded('front', 'doc-front');
    useAadhaarStore.getState().markUploaded('back', 'doc-back');

    const { result } = renderHook(() => useSubmitAadhaar());

    let success = false;
    await act(async () => {
      success = await result.current.submit(FRONT, BACK);
    });

    expect(success).toBe(true);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
