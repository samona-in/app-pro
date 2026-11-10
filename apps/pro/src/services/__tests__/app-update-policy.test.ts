import {
  IMMEDIATE_UPDATE_PRIORITY,
  isDownloadInProgress,
  resolveUpdatePolicy,
} from '@samona/app-updates/policy';
import type { AppUpdateInfo } from '@samona/app-updates';

function info(overrides: Partial<AppUpdateInfo> = {}): AppUpdateInfo {
  return {
    status: 'available',
    availableVersionCode: 42,
    updatePriority: 0,
    stalenessDays: null,
    flexibleAllowed: true,
    immediateAllowed: true,
    installStatus: 'unknown',
    ...overrides,
  };
}

describe('resolveUpdatePolicy', () => {
  it('does nothing without an update', () => {
    expect(resolveUpdatePolicy(null)).toBeNull();
    expect(resolveUpdatePolicy(info({ status: 'notAvailable' }))).toBeNull();
    expect(resolveUpdatePolicy(info({ status: 'unsupported' }))).toBeNull();
    expect(resolveUpdatePolicy(info({ status: 'error' }))).toBeNull();
  });

  it('does nothing when Play allows neither flow', () => {
    expect(
      resolveUpdatePolicy(info({ flexibleAllowed: false, immediateAllowed: false })),
    ).toBeNull();
  });

  it('uses the flexible flow for normal releases', () => {
    expect(resolveUpdatePolicy(info({ updatePriority: 0 }))).toBe('flexible');
    expect(resolveUpdatePolicy(info({ updatePriority: 3 }))).toBe('flexible');
  });

  it('uses the immediate flow from the high-priority band upward', () => {
    expect(resolveUpdatePolicy(info({ updatePriority: IMMEDIATE_UPDATE_PRIORITY }))).toBe(
      'immediate',
    );
    expect(resolveUpdatePolicy(info({ updatePriority: 5 }))).toBe('immediate');
  });

  it('falls back to flexible when a critical release cannot use immediate', () => {
    expect(
      resolveUpdatePolicy(
        info({ updatePriority: 5, immediateAllowed: false, flexibleAllowed: true }),
      ),
    ).toBe('flexible');
  });

  it('falls back to immediate when flexible is unavailable', () => {
    expect(
      resolveUpdatePolicy(
        info({ updatePriority: 0, flexibleAllowed: false, immediateAllowed: true }),
      ),
    ).toBe('immediate');
  });

  it('resumes an interrupted immediate update', () => {
    expect(resolveUpdatePolicy(info({ status: 'inProgress' }))).toBe('immediate');
    expect(resolveUpdatePolicy(info({ status: 'inProgress', immediateAllowed: false }))).toBeNull();
  });
});

describe('isDownloadInProgress', () => {
  it.each(['pending', 'downloading', 'installing'] as const)('is true for %s', (status) => {
    expect(isDownloadInProgress(info({ installStatus: status }))).toBe(true);
  });

  it.each(['unknown', 'downloaded', 'failed', 'canceled'] as const)('is false for %s', (status) => {
    expect(isDownloadInProgress(info({ installStatus: status }))).toBe(false);
  });

  it('is false without info', () => {
    expect(isDownloadInProgress(null)).toBe(false);
  });
});
