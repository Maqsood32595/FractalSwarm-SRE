import { Agent } from '@mastra/core/agent';
import { getFeatureFlags } from './feature_flags';

export interface GrandchildConfig {
  id: string;
  name: string;
  instructions: string;
  tools?: any;
}

// Grandchild agent factory function
export function createGrandchildAgent(config: GrandchildConfig): Agent {
  const flags = getFeatureFlags();
  // Map models based on feature flag tiers
  const model = flags.AGENT_MODEL_TIER === 'PRO' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
  
  return new Agent({
    id: `grandchild-${config.id}`,
    name: config.name,
    instructions: `
      You are a specialized grandchild agent working recursively under a parent SRE coordinator.
      Your specific mission is: ${config.instructions}
      
      Follow these constraints:
      1. Execute only the micro-tools provided to solve your task.
      2. Report back a highly detailed, plain text diagnostic log.
      3. Avoid general conversational summaries; be direct and precise.
    `,
    model,
    tools: config.tools || {}
  });
}
