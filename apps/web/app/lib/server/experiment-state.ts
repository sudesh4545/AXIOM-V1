export type DeliveryStatus = 'running' | 'paused' | 'rolled_back';
export type DeliveryAction = 'pause' | 'resume' | 'rollback';

const transitions: Record<DeliveryStatus, Partial<Record<DeliveryAction, DeliveryStatus>>> = {
  running: { pause: 'paused', rollback: 'rolled_back' },
  paused: { resume: 'running', rollback: 'rolled_back' },
  rolled_back: {},
};

export function transitionExperiment(status: string, action: string): DeliveryStatus | null {
  if (!(status in transitions) || !['pause', 'resume', 'rollback'].includes(action)) return null;
  return transitions[status as DeliveryStatus][action as DeliveryAction] ?? null;
}
