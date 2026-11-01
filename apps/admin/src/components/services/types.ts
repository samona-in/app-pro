export type Work = {
  id: string;
  serviceId: string;
  groupId: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  basePricePaise: number | null;
};

export type WorkGroup = {
  id: string;
  serviceId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  skills: Work[];
};

export type Service = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  skills: Work[];
  workGroups: WorkGroup[];
};

export type ServiceForm = Pick<Service, 'name' | 'slug' | 'sortOrder' | 'isActive'> & {
  icon: string;
};

export type GroupForm = Pick<WorkGroup, 'name' | 'slug' | 'sortOrder' | 'isActive'> & {
  imageUrl: string;
};

export type WorkForm = Pick<Work, 'name' | 'slug' | 'sortOrder' | 'isActive'> & {
  icon: string;
  groupId: string;
  basePriceRupees: string;
};

export const emptyServiceForm: ServiceForm = {
  name: '',
  slug: '',
  icon: '',
  sortOrder: 0,
  isActive: true,
};

export const emptyGroupForm: GroupForm = {
  name: '',
  slug: '',
  imageUrl: '',
  sortOrder: 0,
  isActive: true,
};

export const emptyWorkForm: WorkForm = {
  name: '',
  slug: '',
  icon: '',
  groupId: '',
  basePriceRupees: '',
  sortOrder: 0,
  isActive: true,
};

export function nextSortOrder(items: Array<{ sortOrder: number }>): number {
  return items.reduce((next, item) => Math.max(next, item.sortOrder + 1), 0);
}
