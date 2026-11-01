/**
 * Customer-visible work groupings for both the checked-in catalogue and the
 * current production catalogue. Skill ids are deliberately not part of this
 * map: bookings continue to reference the existing skill rows.
 */
export interface CatalogueSkill {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export interface CatalogueService {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  skills: CatalogueSkill[];
}

export interface ServiceWorkGroupDefinition {
  serviceSlugs: readonly string[];
  slug: string;
  name: string;
  imageKey: string;
  sortOrder: number;
  workSlugs: readonly string[];
}

export interface PlannedServiceWorkGroup extends Omit<ServiceWorkGroupDefinition, 'serviceSlugs'> {
  serviceId: string;
  serviceSlug: string;
  imageUrl: string;
}

export interface PlannedWorkAssignment {
  serviceId: string;
  serviceSlug: string;
  skillId: string;
  skillSlug: string;
  groupSlug: string;
}

export interface UnclassifiedWork {
  serviceSlug: string;
  skillSlug: string;
  skillName: string;
}

/**
 * Slug-based catalogue map. A group is only created when it has at least one
 * active work, which keeps empty services and retired categories out of the UI.
 */
export const SERVICE_WORK_GROUP_DEFINITIONS: readonly ServiceWorkGroupDefinition[] = [
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'fans',
    name: 'Fans',
    imageKey: 'fan',
    sortOrder: 1,
    workSlugs: ['fan-installation', 'fan-repair'],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'lights',
    name: 'Lights',
    imageKey: 'light',
    sortOrder: 2,
    workSlugs: [
      'light-fixture-installation',
      'light-fixture-repair',
      'outdoor-lighting-installation',
    ],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'switches-and-sockets',
    name: 'Switches & Sockets',
    imageKey: 'switch',
    sortOrder: 3,
    workSlugs: [
      'electrical-socket-switch-installation',
      'electrical-socket-switch-relocation',
      'electrical-socket-switch-repair',
    ],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'wiring-and-upgrades',
    name: 'Wiring & Grounding',
    imageKey: 'wiring',
    sortOrder: 4,
    workSlugs: ['ground-wire-installation'],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'panels-and-power',
    name: 'Panels & Power',
    imageKey: 'panel',
    sortOrder: 5,
    workSlugs: [
      'electrical-panel-repair',
      'electrical-panel-replacement',
      'electrical-power-restoration',
    ],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'ev-charging',
    name: 'EV Charging',
    imageKey: 'ev-charger',
    sortOrder: 6,
    workSlugs: ['ev-charger-installation'],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'security-systems',
    name: 'Security Systems',
    imageKey: 'security',
    sortOrder: 7,
    workSlugs: ['security-system-installation'],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'remodelling',
    name: 'Electrical Remodelling',
    imageKey: 'toolbox',
    sortOrder: 8,
    workSlugs: ['remodelling'],
  },
  {
    serviceSlugs: ['electrician', 'electrical'],
    slug: 'other-work',
    name: 'Other Electrical Work',
    imageKey: 'toolbox',
    sortOrder: 9,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['plumbing'],
    slug: 'taps-and-faucets',
    name: 'Taps & Faucets',
    imageKey: 'tap',
    sortOrder: 1,
    workSlugs: ['tap-repair', 'tap-installation'],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'pipes-and-leaks',
    name: 'Pipes & Leaks',
    imageKey: 'pipes',
    sortOrder: 2,
    workSlugs: [
      'leak-detection',
      'leak-repair',
      'pipe-repair',
      'outdoor-plumbing-repair',
      'wash-area-line',
    ],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'toilets-and-flush-systems',
    name: 'Toilets & Flush Systems',
    imageKey: 'toilet',
    sortOrder: 3,
    workSlugs: ['toilet-installation', 'toilet-repair'],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'drains-and-waste',
    name: 'Drains & Waste',
    imageKey: 'drain',
    sortOrder: 4,
    workSlugs: [
      'waste-disposal-installation',
      'drain-cleaning',
      'draining-line',
      'kitchen-waste-line',
    ],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'showers-and-bathroom-fittings',
    name: 'Showers & Bathroom Fittings',
    imageKey: 'shower',
    sortOrder: 5,
    workSlugs: ['shower-repair', 'shower-installation', 'bathroom-gap-refill'],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'water-tanks-and-heaters',
    name: 'Water Tanks & Heaters',
    imageKey: 'water-heater',
    sortOrder: 6,
    workSlugs: ['water-heater-installation', 'water-tank-repair', 'water-tank-installation'],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'gas-lines',
    name: 'Gas Lines',
    imageKey: 'gas-line',
    sortOrder: 7,
    workSlugs: ['gas-lines'],
  },
  {
    serviceSlugs: ['plumbing'],
    slug: 'other-work',
    name: 'Other Plumbing Work',
    imageKey: 'toolbox',
    sortOrder: 8,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['carpeting', 'carpentry'],
    slug: 'furniture-repairs',
    name: 'Furniture Repairs',
    imageKey: 'furniture',
    sortOrder: 1,
    workSlugs: ['furniture-repair'],
  },
  {
    serviceSlugs: ['carpeting', 'carpentry'],
    slug: 'doors-and-windows',
    name: 'Doors & Windows',
    imageKey: 'door',
    sortOrder: 2,
    workSlugs: ['door-window', 'doors-instalation'],
  },
  {
    serviceSlugs: ['carpeting', 'carpentry'],
    slug: 'modular-fittings',
    name: 'Modular Fittings',
    imageKey: 'modular',
    sortOrder: 3,
    workSlugs: ['modular-fitting'],
  },
  {
    serviceSlugs: ['carpeting', 'carpentry'],
    slug: 'other-carpentry',
    name: 'Other Carpentry',
    imageKey: 'toolbox',
    sortOrder: 4,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['ac-appliances'],
    slug: 'air-conditioner-services',
    name: 'Air Conditioner Services',
    imageKey: 'air-conditioner',
    sortOrder: 1,
    workSlugs: [
      'ac-repair',
      'ac-installation',
      'ac-gas-charging',
      'ac-pcb-repair',
      'ac-maintenance',
    ],
  },
  {
    serviceSlugs: ['ac-appliances'],
    slug: 'home-appliances',
    name: 'Home Appliances',
    imageKey: 'appliances',
    sortOrder: 2,
    workSlugs: ['washing-machine', 'refrigerator'],
  },
  {
    serviceSlugs: ['ac-appliances'],
    slug: 'other-appliance-work',
    name: 'Other Appliance Work',
    imageKey: 'toolbox',
    sortOrder: 3,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['cleaning'],
    slug: 'home-cleaning',
    name: 'Home Cleaning',
    imageKey: 'cleaning',
    sortOrder: 1,
    workSlugs: ['deep-cleaning', 'bathroom-cleaning'],
  },
  {
    serviceSlugs: ['cleaning'],
    slug: 'sofa-and-carpet-cleaning',
    name: 'Sofa & Carpet Cleaning',
    imageKey: 'carpet',
    sortOrder: 2,
    workSlugs: ['sofa-carpet'],
  },
  {
    serviceSlugs: ['cleaning'],
    slug: 'pest-control',
    name: 'Pest Control',
    imageKey: 'pest',
    sortOrder: 3,
    workSlugs: ['pest-control'],
  },
  {
    serviceSlugs: ['cleaning'],
    slug: 'other-cleaning',
    name: 'Other Cleaning',
    imageKey: 'toolbox',
    sortOrder: 4,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['car-care'],
    slug: 'car-wash-and-detailing',
    name: 'Car Wash & Detailing',
    imageKey: 'car-wash',
    sortOrder: 1,
    workSlugs: ['car-wash', 'car-detailing'],
  },
  {
    serviceSlugs: ['car-care'],
    slug: 'battery-and-tyres',
    name: 'Battery & Tyres',
    imageKey: 'battery',
    sortOrder: 2,
    workSlugs: ['battery-service', 'tyre-service'],
  },
  {
    serviceSlugs: ['car-care'],
    slug: 'other-car-care',
    name: 'Other Car Care',
    imageKey: 'toolbox',
    sortOrder: 3,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['laptop-electronics'],
    slug: 'computer-repairs',
    name: 'Computer Repairs',
    imageKey: 'laptop',
    sortOrder: 1,
    workSlugs: ['laptop-repair', 'desktop-repair', 'screen-replacement'],
  },
  {
    serviceSlugs: ['laptop-electronics'],
    slug: 'data-recovery',
    name: 'Data Recovery',
    imageKey: 'data-recovery',
    sortOrder: 2,
    workSlugs: ['data-recovery'],
  },
  {
    serviceSlugs: ['laptop-electronics'],
    slug: 'other-device-work',
    name: 'Other Device Work',
    imageKey: 'toolbox',
    sortOrder: 3,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['painting'],
    slug: 'interior-painting',
    name: 'Interior Painting',
    imageKey: 'painting',
    sortOrder: 1,
    workSlugs: ['interior-painting'],
  },
  {
    serviceSlugs: ['painting'],
    slug: 'exterior-and-waterproofing',
    name: 'Exterior & Waterproofing',
    imageKey: 'waterproofing',
    sortOrder: 2,
    workSlugs: ['exterior-painting', 'waterproofing'],
  },
  {
    serviceSlugs: ['painting'],
    slug: 'other-painting',
    name: 'Other Painting',
    imageKey: 'toolbox',
    sortOrder: 3,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['moving-labour'],
    slug: 'house-shifting',
    name: 'House Shifting',
    imageKey: 'moving',
    sortOrder: 1,
    workSlugs: ['house-shifting'],
  },
  {
    serviceSlugs: ['moving-labour'],
    slug: 'loading-and-unloading',
    name: 'Loading & Unloading',
    imageKey: 'boxes',
    sortOrder: 2,
    workSlugs: ['loading-unloading'],
  },
  {
    serviceSlugs: ['moving-labour'],
    slug: 'other-moving-help',
    name: 'Other Moving Help',
    imageKey: 'toolbox',
    sortOrder: 3,
    workSlugs: ['other'],
  },

  {
    serviceSlugs: ['other'],
    slug: 'general-work',
    name: 'General Work',
    imageKey: 'toolbox',
    sortOrder: 1,
    workSlugs: ['other-general', 'other'],
  },
];

export function planServiceWorkGroups(services: readonly CatalogueService[]) {
  const groups: PlannedServiceWorkGroup[] = [];
  const assignments: PlannedWorkAssignment[] = [];
  const unclassified: UnclassifiedWork[] = [];

  for (const service of services) {
    if (!service.isActive) continue;
    const serviceGroups = SERVICE_WORK_GROUP_DEFINITIONS.filter((group) =>
      group.serviceSlugs.includes(service.slug),
    );
    const activeSkills = service.skills.filter((skill) => skill.isActive);

    for (const skill of activeSkills) {
      const group = serviceGroups.find((candidate) => candidate.workSlugs.includes(skill.slug));
      if (!group) {
        unclassified.push({
          serviceSlug: service.slug,
          skillSlug: skill.slug,
          skillName: skill.name,
        });
        continue;
      }

      assignments.push({
        serviceId: service.id,
        serviceSlug: service.slug,
        skillId: skill.id,
        skillSlug: skill.slug,
        groupSlug: group.slug,
      });
    }

    for (const definition of serviceGroups) {
      const skillSlugs = activeSkills
        .filter((skill) => definition.workSlugs.includes(skill.slug))
        .map((skill) => skill.slug);
      if (skillSlugs.length === 0) continue;

      groups.push({
        serviceId: service.id,
        serviceSlug: service.slug,
        slug: definition.slug,
        name: definition.name,
        imageKey: definition.imageKey,
        imageUrl: `asset://service-work-groups/${definition.imageKey}`,
        sortOrder: definition.sortOrder,
        workSlugs: skillSlugs,
      });
    }
  }

  return { groups, assignments, unclassified };
}
