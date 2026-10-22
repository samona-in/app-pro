import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PopularSkill } from '@samona/types';
import { PopularSkills } from '../PopularSkills';

/** Lets the icon font settle so the component stops updating. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * The pixel value of a `mt-*` or `h-*` class, or null when it is not set.
 * Both scales are 4px per unit; `mt-[2px]` and `h-[40px]` are read as written.
 */
function pixels(className: string, prefix: 'mt' | 'h'): number | null {
  const arbitrary = className.match(new RegExp(`${prefix}-\\[(\\d+(?:\\.\\d+)?)px\\]`));
  if (arbitrary) return Number(arbitrary[1]);
  const token = className.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`));
  return token ? Number(token[1]) * 4 : null;
}

function skill(overrides: Partial<PopularSkill> = {}): PopularSkill {
  return {
    id: 'sk1',
    serviceId: 's1',
    slug: 'leak-repair',
    name: 'Plumbing leak repair',
    icon: 'https://example.test/leak.png',
    service: { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: null },
    ...overrides,
  };
}

const skills: PopularSkill[] = [
  skill(),
  skill({
    id: 'sk2',
    slug: 'fan-installation',
    name: 'Fan installation',
    icon: null,
    service: {
      id: 's2',
      slug: 'electrician',
      name: 'Electrician',
      icon: 'https://example.test/e.png',
    },
  }),
];

describe('PopularSkills', () => {
  it('renders the section heading and every skill', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    expect(screen.getByText('Popular right now')).toBeTruthy();
    expect(screen.getByText('Plumbing leak repair')).toBeTruthy();
    expect(screen.getByText('Fan installation')).toBeTruthy();
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Electrician')).toBeTruthy();
  });

  it('flags the first skill as the top pick', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    expect(screen.getByLabelText('Top pick')).toBeTruthy();

    // The badge is the trending-up glyph on its own — no flame, no word.
    const icons = screen.UNSAFE_getAllByType(Ionicons);
    expect(icons.some((icon) => icon.props.name === 'trending-up')).toBe(true);
    expect(icons.some((icon) => icon.props.name === 'flame')).toBe(false);
  });

  it('reports the tapped skill', async () => {
    const onSelect = jest.fn();
    render(<PopularSkills skills={skills} onSelect={onSelect} />);
    await settle();

    fireEvent.press(screen.getByLabelText('Fan installation'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(skills[1]);
  });

  it('opens the full list when "See all" is tapped', async () => {
    const onSeeAll = jest.fn();
    render(<PopularSkills skills={skills} onSelect={jest.fn()} onSeeAll={onSeeAll} />);
    await settle();

    fireEvent.press(screen.getByLabelText('See all popular skills'));

    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without skills', () => {
    render(<PopularSkills skills={[]} onSelect={jest.fn()} />);

    expect(screen.queryByText('Popular right now')).toBeNull();
  });

  it('sets the skill name in plain black, tight to the artwork', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    const name = screen.getByText('Plumbing leak repair');

    // The name leans on colour, not weight: regular weight, absolute black
    // rather than one of the greys the footnote variant would give it.
    expect(name.props.className).not.toMatch(/font-(bold|semibold|medium|extrabold)/);
    expect(name.props.className).toMatch(/(^|\s)text-black(\s|$)/);

    // Tight to the artwork...
    expect(pixels(name.props.className, 'mt')).toBeLessThanOrEqual(4);

    // ...and the fixed box is taller than the two lines of type it holds,
    // which is what opens the gap down to the service name and keeps every
    // service label in the rail on the same line.
    expect(pixels(name.props.className, 'h')).toBeGreaterThan(36);
  });

  it('keeps the first skill clear of the screen edge', () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);

    const rail = screen.UNSAFE_getByType(ScrollView);

    // A negative margin on the rail would pull the first skill past the left
    // edge of the screen; the content padding is what insets it instead.
    expect(rail.props.className ?? '').not.toMatch(/-m[lr]-/);
    expect(rail.props.contentContainerStyle.paddingHorizontal).toBe(16);

    // The top-pick badge sits over the artwork's corner and reaches above it.
    // The rail clips its content, so it needs that room or the badge loses its
    // top.
    expect(rail.props.contentContainerStyle.paddingTop).toBeGreaterThanOrEqual(8);
  });
});
