import type { ScrollView } from 'react-native';

export interface WorkGroupPosition {
  id: string;
  top: number;
}

/**
 * The position of a tapped group's section, each value measured within its
 * direct parent while the catalogue lays out:
 *
 * - `sectionsTop` — the sections list inside the grouped catalogue wrapper
 *   (it sits below the service hero and the group navigation grid),
 * - `sectionTop` — the group's section inside the sections list.
 */
export interface WorkGroupSectionLayout {
  sectionsTop: number;
  sectionTop: number;
}

/**
 * Scroll offset that parks a tapped group at the top of the catalogue list.
 *
 * The offset is the distance from the top of the grouped catalogue down to
 * the group's section start. Scrolling by it places that point exactly
 * where the grouped catalogue sits at rest — just below the pinned header,
 * with the same spacing the screen keeps between the two — so the group
 * name stays visible above its first work row. The pinned header height
 * and everything rendered above the sections (hero, group grid) cancel out
 * of the sum, so the target stays correct for any group, regardless of how
 * many works it holds or what precedes it.
 */
export function workGroupSectionOffset({
  sectionsTop,
  sectionTop,
}: WorkGroupSectionLayout): number {
  return Math.max(0, sectionsTop + sectionTop);
}

/**
 * Smoothly scrolls the catalogue to a tapped group, keeping its name and
 * its first work row visible below the pinned header.
 */
export function scrollToWorkGroup(
  scroller: ScrollView | null,
  layout: WorkGroupSectionLayout | null,
): void {
  if (!scroller || !layout) return;
  scroller.scrollTo({ y: workGroupSectionOffset(layout), animated: true });
}

const ACTIVE_SECTION_GAP = 16;

/** Finds the last section whose heading has crossed the visible category bar. */
export function activeWorkGroupAtOffset(
  groups: readonly WorkGroupPosition[],
  { scrollY, stickyHeight }: { scrollY: number; stickyHeight: number },
): string | null {
  const activationLine = scrollY + stickyHeight + ACTIVE_SECTION_GAP;
  let activeId: string | null = groups[0]?.id ?? null;

  for (const group of groups) {
    if (group.top > activationLine) break;
    activeId = group.id;
  }

  return activeId;
}
