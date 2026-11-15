import { fireEvent, render } from '@testing-library/react-native';
import type { AadhaarImage } from '@/utils/aadhaar-image';
import { AadhaarImagePreview } from '../AadhaarImagePreview';
import { AadhaarReview } from '../AadhaarReview';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

function image(side: 'front' | 'back'): AadhaarImage {
  return {
    uri: `file:///processed-${side}.jpg`,
    originalUri: `file:///original-${side}.jpg`,
    width: 2000,
    height: 1260,
    sizeBytes: 1024,
  };
}

const IMAGES = { front: image('front'), back: image('back') };

describe('AadhaarImagePreview', () => {
  it('shows the front photo with its step and labels', () => {
    const { getByText, getByLabelText } = render(
      <AadhaarImagePreview
        side="front"
        image={IMAGES.front}
        onConfirm={jest.fn()}
        onRetake={jest.fn()}
      />,
    );

    expect(getByText('Check the front')).toBeTruthy();
    expect(getByText('Photo 1 of 2')).toBeTruthy();
    expect(getByLabelText('Front of Aadhaar card')).toBeTruthy();
  });

  it('shows the back photo as the second step', () => {
    const { getByText, getByLabelText } = render(
      <AadhaarImagePreview
        side="back"
        image={IMAGES.back}
        onConfirm={jest.fn()}
        onRetake={jest.fn()}
      />,
    );

    expect(getByText('Check the back')).toBeTruthy();
    expect(getByText('Photo 2 of 2')).toBeTruthy();
    expect(getByLabelText('Back of Aadhaar card')).toBeTruthy();
  });

  it('confirms the previewed side', () => {
    const onConfirm = jest.fn();
    const { getByRole } = render(
      <AadhaarImagePreview
        side="front"
        image={IMAGES.front}
        onConfirm={onConfirm}
        onRetake={jest.fn()}
      />,
    );

    fireEvent.press(getByRole('button', { name: 'Use this photo' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('retakes from either the button or the back arrow', () => {
    const onRetake = jest.fn();
    const { getByRole, getByLabelText } = render(
      <AadhaarImagePreview
        side="front"
        image={IMAGES.front}
        onConfirm={jest.fn()}
        onRetake={onRetake}
      />,
    );

    fireEvent.press(getByRole('button', { name: 'Retake photo' }));
    fireEvent.press(getByLabelText('Back'));

    expect(onRetake).toHaveBeenCalledTimes(2);
  });
});

describe('AadhaarReview', () => {
  function renderReview(overrides: Partial<React.ComponentProps<typeof AadhaarReview>> = {}) {
    const props: React.ComponentProps<typeof AadhaarReview> = {
      images: IMAGES,
      uploaded: {},
      isSubmitting: false,
      errorMessage: null,
      onSubmit: jest.fn(),
      onRetake: jest.fn(),
      onBack: jest.fn(),
      ...overrides,
    };
    return { props, view: render(<AadhaarReview {...props} />) };
  }

  it('shows both sides ready to submit', () => {
    const { view } = renderReview();

    expect(view.getByText('Review your Aadhaar')).toBeTruthy();
    expect(view.getByText('Front')).toBeTruthy();
    expect(view.getByText('Back')).toBeTruthy();
    expect(view.getAllByText('Ready to submit')).toHaveLength(2);
    expect(view.getByLabelText('Front of Aadhaar card')).toBeTruthy();
    expect(view.getByLabelText('Back of Aadhaar card')).toBeTruthy();
  });

  it('submits both sides from the single primary action', () => {
    const { props, view } = renderReview();

    fireEvent.press(view.getByRole('button', { name: 'Submit for verification' }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submission while the upload is in flight', () => {
    const { props, view } = renderReview({ isSubmitting: true });

    const submit = view.getByRole('button', { name: 'Submitting…' });
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true, busy: true });

    fireEvent.press(submit);

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('retakes a side by its list position', () => {
    const { props, view } = renderReview();

    const retakes = view.getAllByRole('button', { name: 'Retake' });
    expect(retakes).toHaveLength(2);

    fireEvent.press(retakes[0]!);
    fireEvent.press(retakes[1]!);

    expect(props.onRetake).toHaveBeenNthCalledWith(1, 'front');
    expect(props.onRetake).toHaveBeenNthCalledWith(2, 'back');
  });

  it('marks a side already saved after a partial failure and hides its retake', () => {
    const { props, view } = renderReview({ uploaded: { front: 'doc-front' } });

    expect(view.getByText('Saved')).toBeTruthy();
    expect(view.getByText('Saved on the server')).toBeTruthy();

    // Only the unsaved back side may still be retaken.
    const retakes = view.getAllByRole('button', { name: 'Retake' });
    expect(retakes).toHaveLength(1);

    fireEvent.press(retakes[0]!);

    expect(props.onRetake).toHaveBeenCalledWith('back');
  });

  it('explains a failed submission and says when one side was kept', () => {
    const { view } = renderReview({
      uploaded: { front: 'doc-front' },
      errorMessage: 'We could not reach the server.',
    });

    expect(view.getByText('One side was saved')).toBeTruthy();
    expect(view.getByText('We could not reach the server.')).toBeTruthy();
  });

  it('does not claim a partial save when nothing was uploaded', () => {
    const { view } = renderReview({ errorMessage: 'We could not reach the server.' });

    expect(view.queryByText('One side was saved')).toBeNull();
    expect(view.getByText('We could not reach the server.')).toBeTruthy();
  });

  it('goes back to the preview without losing the captures', () => {
    const { props, view } = renderReview();

    fireEvent.press(view.getByLabelText('Back'));

    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
