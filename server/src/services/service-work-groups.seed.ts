import type { PrismaClient } from '../database/prisma';
import { planServiceWorkGroups } from './service-work-groups.catalogue';

/**
 * Creates or refreshes the catalogue groups and assigns active works in
 * batches. Existing service, skill, and booking ids are never changed.
 */
export async function seedServiceWorkGroups(prisma: PrismaClient) {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    include: {
      skills: {
        where: { isActive: true },
        select: { id: true, slug: true, name: true, isActive: true },
      },
    },
  });
  const plan = planServiceWorkGroups(services);

  if (plan.unclassified.length > 0) {
    const detail = plan.unclassified
      .map((work) => `${work.serviceSlug} / ${work.skillSlug} (${work.skillName})`)
      .join(', ');
    throw new Error(`Unclassified active work items: ${detail}`);
  }

  const groupIds = new Map<string, string>();
  for (const group of plan.groups) {
    const saved = await prisma.serviceWorkGroup.upsert({
      where: { serviceId_slug: { serviceId: group.serviceId, slug: group.slug } },
      create: {
        serviceId: group.serviceId,
        slug: group.slug,
        name: group.name,
        imageUrl: group.imageUrl,
        sortOrder: group.sortOrder,
        isActive: true,
      },
      update: {
        name: group.name,
        imageUrl: group.imageUrl,
        sortOrder: group.sortOrder,
        isActive: true,
      },
      select: { id: true },
    });
    groupIds.set(`${group.serviceId}:${group.slug}`, saved.id);
  }

  const assignmentsByGroup = new Map<string, typeof plan.assignments>();
  for (const assignment of plan.assignments) {
    const key = `${assignment.serviceId}:${assignment.groupSlug}`;
    const groupAssignments = assignmentsByGroup.get(key) ?? [];
    groupAssignments.push(assignment);
    assignmentsByGroup.set(key, groupAssignments);
  }

  for (const [key, assignments] of assignmentsByGroup) {
    const groupId = groupIds.get(key);
    if (!groupId) throw new Error(`Could not resolve the seeded work group: ${key}`);

    await prisma.skill.updateMany({
      where: {
        serviceId: assignments[0]!.serviceId,
        id: { in: assignments.map((assignment) => assignment.skillId) },
        isActive: true,
      },
      data: { groupId },
    });
  }

  return { groups: plan.groups.length, works: plan.assignments.length };
}
