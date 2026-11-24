import { fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { HomeBannerCard } from '../HomeBannerCard';
import type { HomeBanner } from '../home-banners';

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

const IMAGE_BANNER: HomeBanner = {
  id: 'brand-card',
  type: 'IMAGE',
  heading: '',
  subtitle: '',
  ctaLabel: '',
  serviceSlug: null,
  image: { uri: 'https://example.com/brand-card.png' },
  imageDescription: 'Brand visiting card',
  linkUrl: 'https://brand.example.com',
};

describe('HomeBannerCard image banners', () => {
  it('fills the whole card with the image and drops promo copy', () => {
    render(<HomeBannerCard banner={IMAGE_BANNER} onPress={jest.fn()} />);

    expect(screen.getByTestId('image-banner-card')).toBeTruthy();
    const image = screen.UNSAFE_getByType(Image);
    expect(image.props.source).toBe(IMAGE_BANNER.image);
    expect(image.props.contentFit).toBe('cover');
    expect(image.props.accessibilityLabel).toBe(IMAGE_BANNER.imageDescription);
  });

  it('reports a tap when admin supplied a link', () => {
    const onPress = jest.fn();
    render(<HomeBannerCard banner={IMAGE_BANNER} onPress={onPress} />);

    const card = screen.getByTestId('image-banner-card');
    expect(card.props.accessibilityRole).toBe('button');
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith(IMAGE_BANNER);
  });

  it('is display-only without a link', () => {
    const onPress = jest.fn();
    render(<HomeBannerCard banner={{ ...IMAGE_BANNER, linkUrl: null }} onPress={onPress} />);

    const card = screen.getByTestId('image-banner-card');
    expect(card.props.accessibilityRole).toBeUndefined();
    fireEvent.press(card);
    expect(onPress).not.toHaveBeenCalled();
  });
});
