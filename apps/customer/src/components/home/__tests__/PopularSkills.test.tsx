import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PopularSkill } from '@samona/types';
import { PopularSkills } from '../PopularSkills';

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

    expect(screen.getByText('Top')).toBeTruthy();
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
});
