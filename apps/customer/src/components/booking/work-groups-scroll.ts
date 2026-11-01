export interface WorkGroupPosition {
  id: string;
  top: number;
}

const SECTION_GAP = 12;
const ACTIVE_SECTION_GAP = 16;

/** Scroll target that places a section heading below the pinned group bar. */
export function workGroupScrollOffset({
  contentTop,
  sectionTop,
  stickyHeight,
}: {
  contentTop: number;
  sectionTop: number;
  stickyHeight: number;
}): number {
  return Math.max(0, contentTop + sectionTop - stickyHeight - SECTION_GAP);
}

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
