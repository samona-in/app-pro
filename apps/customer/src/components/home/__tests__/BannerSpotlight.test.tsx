import { fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { BannerSpotlight, fittedRect } from '../BannerSpotlight';

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

const IMAGE = { uri: 'https://example.com/banner.png' };

/** Lays the spotlight out, since it only paints once it knows its size. */
function layoutSpotlight() {
  fireEvent(screen.getByTestId('banner-spotlight'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 150 } },
  });
}

describe('BannerSpotlight', () => {
  it('lights the subject through white copies of the artwork', () => {
    render(<BannerSpotlight image={IMAGE} active />);
    layoutSpotlight();

    const copies = screen.UNSAFE_getAllByType(Image);
    expect(copies.length).toBeGreaterThan(1);

    for (const copy of copies) {
      // The artwork's own alpha decides where the light may appear, so the
      // glint can never spill onto the card behind the cut-out subject.
      expect(copy.props.source).toBe(IMAGE);
      expect(copy.props.tintColor).toBe('#ffffff');
      expect(copy.props.contentFit).toBe('contain');
    }
  });

  it('paints nothing while inactive', () => {
    render(<BannerSpotlight image={IMAGE} active={false} />);
    layoutSpotlight();

    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('paints nothing before it has been measured', () => {
    render(<BannerSpotlight image={IMAGE} active />);

    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });
});

describe('fittedRect', () => {
  const box = { width: 140, height: 150 };

  it('travels across the letterboxed artwork, not the whole box', () => {
    // A 600x720 banner in a 140x150 box is centred at 125x150, so the glint
    // has to start at x=7.5 to line up with the drawn subject.
    expect(fittedRect(box, { uri: 'banner.png', width: 600, height: 720 })).toEqual({
      x: 7.5,
      y: 0,
      width: 125,
      height: 150,
    });
  });

  it('handles banners taller or wider than the box', () => {
    // Wider than tall: limited by width, centred vertically.
    const rect = fittedRect(box, { uri: 'wide.png', width: 720, height: 600 });

    expect(rect.x).toBe(0);
    expect(rect.width).toBe(140);
    expect(rect.height).toBeCloseTo(116.67, 1);
    expect(rect.y).toBeCloseTo(16.67, 1);
  });

  it('falls back to the box when the source size is unknown', () => {
    expect(fittedRect(box, { uri: 'remote.png' })).toEqual({
      x: 0,
      y: 0,
      width: 140,
      height: 150,
    });
  });
});
