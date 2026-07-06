import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { executeTerminalCommand } from './terminal';

// Standalone function for memory query logic to avoid tool typing issues in TS
export async function queryMemory(errorLog: string) {
  try {
    const port = process.env.PORT || 3002;
    
    // Compute a deterministic category-aware 384d vector
    const lower = errorLog.toLowerCase();
    let categoryKey = 'random_anomaly';
    if (lower.includes('space') || lower.includes('disk') || lower.includes('full')) {
      categoryKey = 'disk_space';
    } else if (lower.includes('postgres') || lower.includes('refused') || lower.includes('5432') || lower.includes('connection')) {
      if (!lower.includes('delete') && !lower.includes('drop')) {
        categoryKey = 'database_restart';
      }
    } else if (lower.includes('nginx') || lower.includes('gateway') || lower.includes('504')) {
      categoryKey = 'nginx_reload';
    } else if (lower.includes('memory') || lower.includes('oom') || lower.includes('free -m')) {
      categoryKey = 'memory_oom';
    }

    const mockVector = new Array(384).fill(0).map((_, i) => {
      let hash = 0;
      const seed = categoryKey + i.toString();
      for (let j = 0; j < seed.length; j++) {
        hash = seed.charCodeAt(j) + ((hash << 5) - hash);
      }
      return hash % 100 > 50 ? 0.1 : -0.1;
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/memory-vault/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floatVector: mockVector,
        topK: 3,
        queryText: errorLog
      })
    });

    if (!response.ok) {
      throw new Error('Memory Vault query failed');
    }

    return await response.json();
  } catch (err: any) {
    console.error('[queryMemory Error]', err.message);
    return {
      source: 'ERROR_FALLBACK',
      results: [
        {
          id: 'fallback-runbook-uuid',
          bit_density: 85,
          text: 'Playbook: Disk space cleanup\nSignature: No space left on device\nCommand: df -h && echo "Disk clean completed."'
        }
      ]
    };
  }
}

// Standalone function for terminal command execution
export async function executeCommand(command: string) {
  return await executeTerminalCommand(command);
}

// Tool 1: Query the Memory Vault for historical context / runbooks
export const queryMemoryTool = createTool({
  id: 'query-memory-tool',
  description: 'Queries the hybrid Memory Vault (local QSAG cache and Qdrant database) to find past incident resolutions and playbooks matching the error logs.',
  inputSchema: z.object({
    errorLog: z.string().describe('The raw error log or alert message to match.'),
  }),
  outputSchema: z.object({
    source: z.string(),
    results: z.array(z.object({
      id: z.string(),
      bit_density: z.number(),
      text: z.string()
    }))
  }),
  execute: async ({ errorLog }) => {
    return await queryMemory(errorLog);
  }
});

// Tool 2: Execute an SRE remediation command
export const executeCommandTool = createTool({
  id: 'execute-command-tool',
  description: 'Executes a validated system shell command or remediation script on the target environment.',
  inputSchema: z.object({
    command: z.string().describe('The bash/shell script to run.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional()
  }),
  execute: async ({ command }) => {
    return await executeCommand(command);
  }
});

// Define the SRE Agent
export const incidentAgent = new Agent({
  id: 'incident-commander-agent',
  name: 'Incident Commander',
  instructions: `
    You are an autonomous SRE agent operating inside the FractalSRE platform.
    Your job is to diagnose incoming server alerts and resolve them safely.
    
    Rules:
    1. ALWAYS query the Memory Vault first to see if this error log has a matching historical playbook.
    2. Suggest a clear remediation script or shell command to resolve the issue based on the historical logs.
    3. You CANNOT execute the command directly. You must output the proposed command so the safety guard and human operator can review it.
  `,
  model: 'google/gemini-2.5-flash',
  tools: {
    queryMemory: queryMemoryTool,
    executeCommand: executeCommandTool
  }
});
