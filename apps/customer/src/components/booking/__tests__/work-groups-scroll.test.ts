import type { ScrollView } from 'react-native';
import {
  activeWorkGroupAtOffset,
  scrollToWorkGroup,
  workGroupSectionOffset,
} from '../work-groups-scroll';

describe('work group scroll helpers', () => {
  it('targets the start of a tapped group, keeping its name visible', () => {
    expect(workGroupSectionOffset({ sectionsTop: 304, sectionTop: 800 })).toBe(1104);
    expect(workGroupSectionOffset({ sectionsTop: 0, sectionTop: 48 })).toBe(48);
  });

  it('works for groups with different sizes and positions', () => {
    // A single-work group sitting far down the list.
    expect(workGroupSectionOffset({ sectionsTop: 304, sectionTop: 1600 })).toBe(1904);
    // A many-work group starting right below the navigation grid.
    expect(workGroupSectionOffset({ sectionsTop: 12, sectionTop: 0 })).toBe(12);
  });

  it('never scrolls above the top of the list', () => {
    expect(workGroupSectionOffset({ sectionsTop: 0, sectionTop: 0 })).toBe(0);
    expect(workGroupSectionOffset({ sectionsTop: 0, sectionTop: -20 })).toBe(0);
  });

  it('smoothly scrolls the catalogue to the computed offset', () => {
    const scrollTo = jest.fn();
    const scroller = { scrollTo } as unknown as ScrollView;

    scrollToWorkGroup(scroller, { sectionsTop: 304, sectionTop: 800 });

    expect(scrollTo).toHaveBeenCalledWith({ y: 1104, animated: true });
  });

  it('does nothing without a scroller or measurements', () => {
    const scrollTo = jest.fn();

    scrollToWorkGroup(null, { sectionsTop: 304, sectionTop: 800 });
    scrollToWorkGroup({ scrollTo } as unknown as ScrollView, null);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('selects the section crossing the visible area below the sticky category bar', () => {
    const groups = [
      { id: 'fans', top: 0 },
      { id: 'lights', top: 400 },
      { id: 'switches', top: 800 },
    ];

    expect(activeWorkGroupAtOffset(groups, { scrollY: 430, stickyHeight: 90 })).toBe('lights');
    expect(activeWorkGroupAtOffset(groups, { scrollY: 0, stickyHeight: 90 })).toBe('fans');
  });
});
