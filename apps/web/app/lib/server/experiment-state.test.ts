import { describe, expect, it } from 'vitest';
import { transitionExperiment } from './experiment-state';

describe('experiment state machine', () => {
  it('supports safe pause, resume and rollback paths', () => {
    expect(transitionExperiment('running', 'pause')).toBe('paused');
    expect(transitionExperiment('paused', 'resume')).toBe('running');
    expect(transitionExperiment('running', 'rollback')).toBe('rolled_back');
    expect(transitionExperiment('paused', 'rollback')).toBe('rolled_back');
  });

  it('makes rollback terminal and blocks no-op transitions', () => {
    expect(transitionExperiment('rolled_back', 'resume')).toBeNull();
    expect(transitionExperiment('running', 'resume')).toBeNull();
    expect(transitionExperiment('paused', 'pause')).toBeNull();
  });
});
