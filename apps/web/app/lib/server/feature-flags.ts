export type ExperimentVariant = 'control' | 'treatment';

export function stableBucket(workspaceId: string, flagKey: string, subjectId: string, salt: string): number {
  const value = `${workspaceId}:${flagKey}:${subjectId}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10_000;
}

export function assignVariant(input: {
  workspaceId: string; flagKey: string; subjectId: string; salt: string;
  allocationPct: number; status: string;
}): { variant: ExperimentVariant; bucket: number; eligible: boolean } {
  const bucket = stableBucket(input.workspaceId, input.flagKey, input.subjectId, input.salt);
  const allocation = Math.max(0, Math.min(100, input.allocationPct));
  const eligible = input.status === 'running' && bucket < allocation * 100;
  return { variant: eligible ? 'treatment' : 'control', bucket, eligible };
}

export function featureFlagKey(recommendationId: string): string {
  return `axiom.${recommendationId.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '')}`.slice(0, 120);
}
