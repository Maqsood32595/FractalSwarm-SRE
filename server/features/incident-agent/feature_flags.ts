export type ModelTier = 'FLASH' | 'PRO';

export interface FeatureFlags {
  EXECUTE_MITIGATIONS: boolean;
  AGENT_MODEL_TIER: ModelTier;
  MAX_DELEGATION_DEPTH: number;
  CONTEXT_COMPRESSION: boolean;
}

// Default in-memory feature flags state
const flags: FeatureFlags = {
  EXECUTE_MITIGATIONS: true,
  AGENT_MODEL_TIER: 'FLASH',
  MAX_DELEGATION_DEPTH: 2,
  CONTEXT_COMPRESSION: true
};

export function getFeatureFlags(): FeatureFlags {
  return { ...flags };
}

export function setFeatureFlags(newFlags: Partial<FeatureFlags>): FeatureFlags {
  if (newFlags.EXECUTE_MITIGATIONS !== undefined) {
    flags.EXECUTE_MITIGATIONS = newFlags.EXECUTE_MITIGATIONS;
  }
  if (newFlags.AGENT_MODEL_TIER !== undefined) {
    flags.AGENT_MODEL_TIER = newFlags.AGENT_MODEL_TIER;
  }
  if (newFlags.MAX_DELEGATION_DEPTH !== undefined) {
    flags.MAX_DELEGATION_DEPTH = newFlags.MAX_DELEGATION_DEPTH;
  }
  if (newFlags.CONTEXT_COMPRESSION !== undefined) {
    flags.CONTEXT_COMPRESSION = newFlags.CONTEXT_COMPRESSION;
  }
  return getFeatureFlags();
}
