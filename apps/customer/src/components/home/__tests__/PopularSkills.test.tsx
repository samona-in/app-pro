import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import type { PopularSkill } from '@samona/types';
import { PopularSkills } from '../PopularSkills';
import { SectionHeader } from '../SectionHeader';

/** Lets the icon font settle so the component stops updating. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
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
  skill({ isTopPick: true }),
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

  it('flags the first skill with a black top-pick badge', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    const badge = screen.getByLabelText('Top pick');
    expect(badge.props.className).toMatch(/(^|\s)bg-black(\s|$)/);

    const label = screen.getByText('Top pick');
    expect(label.props.className).toMatch(/(^|\s)text-white(\s|$)/);
    expect(label.props.className).toMatch(/font-semibold/);
  });

  it('wraps every skill in a bordered card with a fixed-name box', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    const card = screen.getByLabelText('Plumbing leak repair');
    expect(card.props.className).toMatch(/rounded-sm/);
    expect(card.props.className).toMatch(/border-border/);

    // The two-line box keeps every card's label on the same baseline.
    const name = screen.getByText('Plumbing leak repair');
    expect(name.props.className).toMatch(/(^|\s)h-9(\s|$)/);
    expect(name.props.className).toMatch(/text-text-primary/);
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

  it('lays the heading and the rail on the same 16px gutter', async () => {
    render(<PopularSkills skills={skills} onSelect={jest.fn()} />);
    await settle();

    const section = screen.getByTestId('popular-right-now');
    expect(section.props.className ?? '').not.toMatch(/-m[lr]-/);

    const rail = screen.UNSAFE_getByType(ScrollView);
    expect(rail.props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingHorizontal: 16, gap: 12 }),
    );

    // The heading carries the page gutter; the section itself does not add one
    // on top of the rail's content padding.
    const heading = screen.UNSAFE_getByType(SectionHeader);
    expect(heading.props.className).toMatch(/(^|\s)px-4(\s|$)/);
  });
});
