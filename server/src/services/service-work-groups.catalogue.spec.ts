import { planServiceWorkGroups } from './service-work-groups.catalogue';

function service(slug: string, skillSlugs: string[], inactiveSkillSlugs: string[] = []) {
  return {
    id: `service-${slug}`,
    slug,
    name: slug,
    isActive: true,
    skills: [
      ...skillSlugs.map((skillSlug) => ({
        id: `${slug}-${skillSlug}`,
        slug: skillSlug,
        name: skillSlug,
        isActive: true,
      })),
      ...inactiveSkillSlugs.map((skillSlug) => ({
        id: `${slug}-${skillSlug}`,
        slug: skillSlug,
        name: skillSlug,
        isActive: false,
      })),
    ],
  };
}

const liveCatalogue = [
  service(
    'electrician',
    [
      'electrical-socket-switch-installation',
      'electrical-socket-switch-relocation',
      'electrical-socket-switch-repair',
      'light-fixture-installation',
      'outdoor-lighting-installation',
      'electrical-panel-repair',
      'electrical-panel-replacement',
      'electrical-power-restoration',
      'ev-charger-installation',
      'fan-installation',
      'fan-repair',
      'ground-wire-installation',
      'light-fixture-repair',
      'remodelling',
      'security-system-installation',
      'other',
    ],
    ['residential'],
  ),
  service(
    'plumbing',
    [
      'gas-lines',
      'toilet-installation',
      'waste-disposal-installation',
      'tap-repair',
      'tap-installation',
      'drain-cleaning',
      'water-heater-installation',
      'water-tank-repair',
      'water-tank-installation',
      'leak-detection',
      'leak-repair',
      'pipe-repair',
      'outdoor-plumbing-repair',
      'shower-repair',
      'shower-installation',
      'toilet-repair',
      'bathroom-gap-refill',
      'draining-line',
      'kitchen-waste-line',
      'wash-area-line',
      'other',
    ],
    ['high-pressure-industrial-pipefitting'],
  ),
  service('carpeting', ['doors-instalation']),
  service('prints', []),
  service('cabdriver', []),
  service('priest', []),
  service('colorprint', []),
  service('garden', []),
  service('install', []),
  service('waste', []),
];

const baselineCatalogue = [
  service('ac-appliances', [
    'ac-repair',
    'ac-installation',
    'ac-gas-charging',
    'ac-pcb-repair',
    'ac-maintenance',
    'washing-machine',
    'refrigerator',
    'other',
  ]),
  service(
    'electrical',
    [
      'electrical-socket-switch-installation',
      'electrical-socket-switch-relocation',
      'electrical-socket-switch-repair',
      'light-fixture-installation',
      'outdoor-lighting-installation',
      'electrical-panel-repair',
      'electrical-panel-replacement',
      'electrical-power-restoration',
      'ev-charger-installation',
      'fan-installation',
      'fan-repair',
      'ground-wire-installation',
      'light-fixture-repair',
      'remodelling',
      'security-system-installation',
      'other',
    ],
    ['wiring', 'switch-socket', 'lighting', 'inverter-stabiliser'],
  ),
  service(
    'plumbing',
    [
      'toilet-installation',
      'waste-disposal-installation',
      'tap-repair',
      'tap-installation',
      'drain-cleaning',
      'water-heater-installation',
      'water-tank-repair',
      'water-tank-installation',
      'leak-detection',
      'leak-repair',
      'pipe-repair',
      'outdoor-plumbing-repair',
      'shower-repair',
      'shower-installation',
      'toilet-repair',
      'bathroom-gap-refill',
      'draining-line',
      'kitchen-waste-line',
      'wash-area-line',
      'other',
    ],
    ['drainage', 'water-tank', 'bathroom-fitting'],
  ),
  service('cleaning', [
    'deep-cleaning',
    'bathroom-cleaning',
    'sofa-carpet',
    'pest-control',
    'other',
  ]),
  service('car-care', ['car-wash', 'car-detailing', 'battery-service', 'tyre-service', 'other']),
  service('laptop-electronics', [
    'laptop-repair',
    'desktop-repair',
    'screen-replacement',
    'data-recovery',
    'other',
  ]),
  service('carpentry', ['furniture-repair', 'door-window', 'modular-fitting', 'other']),
  service('painting', ['interior-painting', 'exterior-painting', 'waterproofing', 'other']),
  service('moving-labour', ['house-shifting', 'loading-unloading', 'other']),
  service('other', ['other-general', 'other']),
];

describe('planServiceWorkGroups', () => {
  it('classifies every active work in the live and checked-in catalogues', () => {
    const plan = planServiceWorkGroups([...liveCatalogue, ...baselineCatalogue]);
    const activeWorkCount = [...liveCatalogue, ...baselineCatalogue].reduce(
      (count, item) => count + item.skills.filter((skill) => skill.isActive).length,
      0,
    );

    expect(plan.unclassified).toEqual([]);
    expect(plan.assignments).toHaveLength(activeWorkCount);
    expect(
      plan.groups.filter((group) => group.serviceSlug === 'electrician').map((group) => group.slug),
    ).toEqual([
      'fans',
      'lights',
      'switches-and-sockets',
      'wiring-and-upgrades',
      'panels-and-power',
      'ev-charging',
      'security-systems',
      'remodelling',
      'other-work',
    ]);
    expect(
      plan.assignments.find((assignment) => assignment.skillSlug === 'doors-instalation'),
    ).toMatchObject({ serviceSlug: 'carpeting', groupSlug: 'doors-and-windows' });
    expect(plan.assignments.some((assignment) => assignment.skillSlug === 'residential')).toBe(
      false,
    );
  });

  it('reports unknown active works without assigning them arbitrarily', () => {
    const plan = planServiceWorkGroups([service('electrician', ['mystery-electrical-job'])]);

    expect(plan.assignments).toEqual([]);
    expect(plan.unclassified).toEqual([
      {
        serviceSlug: 'electrician',
        skillSlug: 'mystery-electrical-job',
        skillName: 'mystery-electrical-job',
      },
    ]);
  });
});
