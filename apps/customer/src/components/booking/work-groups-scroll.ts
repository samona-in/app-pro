import type { ScrollView } from 'react-native';

export interface WorkGroupPosition {
  id: string;
  top: number;
}

/**
 * The position of a tapped group's first work row, each value measured
 * within its direct parent while the catalogue lays out:
 *
 * - `sectionsTop` — the sections list inside the grouped catalogue wrapper
 *   (it sits below the service hero and the group navigation grid),
 * - `sectionTop` — the group's section inside the sections list,
 * - `firstWorkTop` — the group's first work row inside its section.
 */
export interface WorkGroupFirstWorkLayout {
  sectionsTop: number;
  sectionTop: number;
  firstWorkTop: number;
}

/**
 * Scroll offset that parks a tapped group's first work row at the top of
 * the catalogue list.
 *
 * The offset is the distance from the top of the grouped catalogue down to
 * the group's first row. Scrolling by it places that row exactly where the
 * grouped catalogue sits at rest — just below the pinned header, with the
 * same spacing the screen keeps between the two. The pinned header height
 * and everything rendered above the sections (hero, group grid) cancel out
 * of the sum, so the target stays correct for any group, regardless of how
 * many works it holds or what precedes it.
 */
export function workGroupFirstWorkOffset({
  sectionsTop,
  sectionTop,
  firstWorkTop,
}: WorkGroupFirstWorkLayout): number {
  return Math.max(0, sectionsTop + sectionTop + firstWorkTop);
}

/** Smoothly scrolls the catalogue to a tapped group's first work row. */
export function scrollToWorkGroup(
  scroller: ScrollView | null,
  layout: WorkGroupFirstWorkLayout | null,
): void {
  if (!scroller || !layout) return;
  scroller.scrollTo({ y: workGroupFirstWorkOffset(layout), animated: true });
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
