import type { CustomerNotification } from '@samona/types';
import {
  formatNotificationTime,
  groupNotificationsByDay,
  notificationDayLabel,
} from '../notifications';

/** A notice fixture; only the fields the grouping reads need to be real. */
function notice(id: string, createdAt: string, readAt: string | null = null): CustomerNotification {
  return {
    id,
    jobId: null,
    kind: 'JOB_STATUS',
    title: `Notice ${id}`,
    body: 'Body',
    route: null,
    readAt,
    createdAt,
  };
}

describe('groupNotificationsByDay', () => {
  // A Friday afternoon, so the fixtures below land on known weekdays.
  const now = new Date('2026-10-23T12:00:00');

  it('groups by local day, newest group first, preserving row order', () => {
    const groups = groupNotificationsByDay(
      [
        notice('a', '2026-10-23T10:00:00'),
        notice('b', '2026-10-23T09:00:00'),
        notice('c', '2026-10-22T20:00:00'),
        notice('d', '2026-10-18T10:00:00'),
      ],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', 'Sun, 18 Oct']);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
    ]);
  });

  it('keeps a day in one group even when rows are interleaved', () => {
    const groups = groupNotificationsByDay(
      [
        notice('a', '2026-10-23T10:00:00'),
        notice('b', '2026-10-22T10:00:00'),
        notice('c', '2026-10-23T08:00:00'),
      ],
      now,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('treats a future timestamp (clock skew) as today', () => {
    const groups = groupNotificationsByDay([notice('a', '2026-10-23T12:05:00')], now);

    expect(groups[0]!.label).toBe('Today');
  });

  it('adds the year only when the day is outside the current year', () => {
    const groups = groupNotificationsByDay([notice('a', '2025-12-31T10:00:00')], now);

    expect(groups[0]!.label).toBe('Wed, 31 Dec 2025');
  });
});

describe('notificationDayLabel', () => {
  it('labels today and yesterday relative to the supplied now', () => {
    expect(
      notificationDayLabel(new Date('2026-10-23T00:01:00'), new Date('2026-10-23T23:59:00')),
    ).toBe('Today');
    expect(
      notificationDayLabel(new Date('2026-10-22T23:59:00'), new Date('2026-10-23T00:01:00')),
    ).toBe('Yesterday');
  });
});

describe('formatNotificationTime', () => {
  const now = new Date('2026-10-23T12:00:00');

  it('stays relative for today', () => {
    expect(formatNotificationTime('2026-10-23T11:59:40', now)).toBe('Now');
    expect(formatNotificationTime('2026-10-23T11:58:00', now)).toBe('2m');
    expect(formatNotificationTime('2026-10-23T09:00:00', now)).toBe('3h');
  });

  it('shows a clock time for older days because the group carries the date', () => {
    expect(formatNotificationTime('2026-10-21T09:41:00', now)).toBe('9:41 am');
  });
});
