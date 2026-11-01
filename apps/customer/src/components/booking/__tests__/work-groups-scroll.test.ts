import { activeWorkGroupAtOffset, workGroupScrollOffset } from '../work-groups-scroll';

describe('work group scroll helpers', () => {
  it('positions a tapped section just below the sticky category bar', () => {
    expect(workGroupScrollOffset({ contentTop: 64, sectionTop: 450, stickyHeight: 96 })).toBe(406);
    expect(workGroupScrollOffset({ contentTop: 24, sectionTop: 20, stickyHeight: 96 })).toBe(0);
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
