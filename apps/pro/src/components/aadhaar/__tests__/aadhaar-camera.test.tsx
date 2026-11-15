import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { AadhaarCamera } from '../AadhaarCamera';

const mockTakePicture = jest.fn();
const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();
let mockCameraProps: Record<string, unknown> = {};

jest.mock('expo-camera', () => {
  // Only React is required here: react-native inside a hoisted factory trips
  // NativeWind's transform. A forwardRef component exposes the imperative
  // shutter handle the screen's ref expects without declaring a class.
  const React = jest.requireActual('react');
  const MockCameraView = React.forwardRef(function MockCameraView(
    props: Record<string, unknown>,
    ref: unknown,
  ) {
    React.useImperativeHandle(
      ref,
      () => ({ takePictureAsync: (...args: unknown[]) => mockTakePicture(...args) }),
      [],
    );
    mockCameraProps = props as Record<string, unknown>;
    return null;
  });
  return {
    CameraView: MockCameraView,
    useCameraPermissions: () => mockUseCameraPermissions(),
  };
});

jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function grantPermission() {
  mockUseCameraPermissions.mockReturnValue([
    { granted: true, canAskAgain: true },
    mockRequestPermission,
  ]);
}

function renderCamera(overrides: Partial<React.ComponentProps<typeof AadhaarCamera>> = {}) {
  const props: React.ComponentProps<typeof AadhaarCamera> = {
    side: 'front',
    active: true,
    busy: false,
    onCaptured: jest.fn(),
    onCaptureError: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, view: render(<AadhaarCamera {...props} />) };
}

function makeReady() {
  act(() => {
    (mockCameraProps.onCameraReady as (() => void) | undefined)?.();
  });
}

describe('AadhaarCamera', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCameraProps = {};
    mockTakePicture.mockResolvedValue({
      uri: 'file:///camera/photo.jpg',
      width: 1600,
      height: 1000,
    });
    grantPermission();
  });

  describe('permission states', () => {
    it('shows a loading state until the permission answer arrives', () => {
      mockUseCameraPermissions.mockReturnValue([undefined, mockRequestPermission]);

      const { view } = renderCamera();

      expect(view.getByText('Starting camera…')).toBeTruthy();
      expect(view.queryByLabelText('Capture Aadhaar photo')).toBeNull();
    });

    it('explains why the camera is needed and asks for permission', async () => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: false, canAskAgain: true },
        mockRequestPermission,
      ]);

      const { view } = renderCamera();

      expect(view.getByText('Camera access needed')).toBeTruthy();

      fireEvent.press(view.getByRole('button', { name: 'Allow camera' }));

      await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
      expect(Linking.openSettings).not.toHaveBeenCalled();
    });

    it('sends a permanently denied Pro to Settings instead of re-prompting', () => {
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      mockUseCameraPermissions.mockReturnValue([
        { granted: false, canAskAgain: false },
        mockRequestPermission,
      ]);

      const { view } = renderCamera();

      expect(view.getByText('Camera access is off')).toBeTruthy();
      expect(view.queryByText('Allow camera')).toBeNull();

      fireEvent.press(view.getByRole('button', { name: 'Open Settings' }));

      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    it('offers a way out without granting the camera', () => {
      mockUseCameraPermissions.mockReturnValue([
        { granted: false, canAskAgain: true },
        mockRequestPermission,
      ]);

      const { props, view } = renderCamera();

      fireEvent.press(view.getByRole('button', { name: 'Not now' }));

      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('capture', () => {
    it('captures with the rear camera once the preview is ready', async () => {
      const { props, view } = renderCamera();
      makeReady();

      expect(mockCameraProps.facing).toBe('back');

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      await waitFor(() =>
        expect(props.onCaptured).toHaveBeenCalledWith({
          uri: 'file:///camera/photo.jpg',
          width: 1600,
          height: 1000,
        }),
      );
      expect(mockTakePicture).toHaveBeenCalledTimes(1);
    });

    it('does not capture before the camera reports ready', () => {
      const { view } = renderCamera();

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      expect(mockTakePicture).not.toHaveBeenCalled();
      expect(view.getByLabelText('Capture Aadhaar photo').props.accessibilityState).toMatchObject({
        disabled: true,
      });
    });

    it('drops a second tap that lands while the first capture is in flight', async () => {
      let resolveCapture: (photo: unknown) => void = () => {};
      mockTakePicture.mockReturnValue(
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
      );
      const { props, view } = renderCamera();
      makeReady();

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));
      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      expect(mockTakePicture).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveCapture({ uri: 'file:///camera/photo.jpg', width: 1600, height: 1000 });
      });

      expect(props.onCaptured).toHaveBeenCalledTimes(1);
    });

    it('ignores the shutter while the screen is already processing', () => {
      const { view } = renderCamera({ busy: true });
      makeReady();

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      expect(mockTakePicture).not.toHaveBeenCalled();
      expect(view.getByText('Preparing your photo…')).toBeTruthy();
    });

    it('reports a camera failure so the screen can explain it', async () => {
      mockTakePicture.mockRejectedValue(new Error('shutter failed'));
      const { props, view } = renderCamera();
      makeReady();

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      await waitFor(() => expect(props.onCaptureError).toHaveBeenCalledTimes(1));
      expect(props.onCaptured).not.toHaveBeenCalled();
    });

    it('treats a capture with no dimensions as a camera failure', async () => {
      mockTakePicture.mockResolvedValue({ uri: '', width: 0, height: 0 });
      const { props, view } = renderCamera();
      makeReady();

      fireEvent.press(view.getByLabelText('Capture Aadhaar photo'));

      await waitFor(() => expect(props.onCaptureError).toHaveBeenCalledTimes(1));
    });

    it('toggles the torch for a dark photo', () => {
      const { view } = renderCamera();
      makeReady();

      fireEvent.press(view.getByLabelText('Toggle light'));

      expect(mockCameraProps.enableTorch).toBe(true);
    });

    it('reports a camera that could not mount', () => {
      const { view } = renderCamera();

      act(() => {
        (mockCameraProps.onMountError as (() => void) | undefined)?.();
      });

      expect(view.getByText('Camera unavailable')).toBeTruthy();
      expect(view.queryByLabelText('Capture Aadhaar photo')).toBeNull();
    });

    it('closes without capturing', () => {
      const { props, view } = renderCamera();
      makeReady();

      fireEvent.press(view.getByLabelText('Close Aadhaar capture'));

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(mockTakePicture).not.toHaveBeenCalled();
    });
  });
});
