import { describe, expect, it } from 'vitest';
import { assignVariant, featureFlagKey, stableBucket } from './feature-flags';

describe('feature flag assignment', () => {
  it('is deterministic and workspace isolated', () => {
    const first = stableBucket('workspace-a', 'flag', 'user-1', 'salt');
    expect(stableBucket('workspace-a', 'flag', 'user-1', 'salt')).toBe(first);
    expect(stableBucket('workspace-b', 'flag', 'user-1', 'salt')).not.toBe(first);
  });

  it('returns control when paused or allocation is zero', () => {
    expect(assignVariant({ workspaceId: 'w', flagKey: 'f', subjectId: 'u', salt: 's', allocationPct: 100, status: 'paused' }).variant).toBe('control');
    expect(assignVariant({ workspaceId: 'w', flagKey: 'f', subjectId: 'u', salt: 's', allocationPct: 0, status: 'running' }).variant).toBe('control');
  });

  it('returns treatment for every subject at 100 percent', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(assignVariant({ workspaceId: 'w', flagKey: 'f', subjectId: `u-${index}`, salt: 's', allocationPct: 100, status: 'running' }).variant).toBe('treatment');
    }
  });

  it('creates a stable SDK-safe flag key', () => {
    expect(featureFlagKey('Measured Activation → Collaboration')).toBe('axiom.measured.activation.collaboration');
  });
});
