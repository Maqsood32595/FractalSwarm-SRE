import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Helper to sanitize paths (avoiding directory traversal)
function sanitizePath(filename: string): string {
  const safeName = path.basename(filename);
  // Store mock logs inside the project root for safety
  return path.join(process.cwd(), 'logs', safeName);
}

// Ensure local logs directory exists
try {
  if (!fs.existsSync(path.join(process.cwd(), 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'logs'));
    // Write a mock database and system log file for the tools to read
    fs.writeFileSync(
      path.join(process.cwd(), 'logs', 'db.log'),
      '[2026-06-30 15:45:00] [INFO] Database connection established.\n' +
      '[2026-06-30 15:45:30] [ERROR] connection pool exhausted: fatal: remaining connection slots are reserved.\n' +
      '[2026-06-30 15:46:00] [WARN] client request timeout on port 5432.'
    );
    fs.writeFileSync(
      path.join(process.cwd(), 'logs', 'system.log'),
      '[2026-06-30 15:40:00] [INFO] System boot completed.\n' +
      '[2026-06-30 15:42:00] [WARN] Disk space usage exceeds 92% on volume C:/\n' +
      '[2026-06-30 15:43:10] [ERROR] OOM killer terminated process 4321.'
    );
  }
} catch (e) {
  // Ignore error if logs directory cannot be written
}

// Tool 1: Read a specific file (MCP compliant schema)
export const mcpReadLogFileTool = createTool({
  id: 'mcp-read-log-file',
  description: 'MCP Tool: Reads the last 50 lines from a specific system log file within the authorized directory.',
  inputSchema: z.object({
    filename: z.string().describe('The name of the log file to read (e.g. system.log, db.log)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    content: z.string(),
    error: z.string().optional()
  }),
  execute: async ({ filename }) => {
    try {
      const safePath = sanitizePath(filename);
      if (!fs.existsSync(safePath)) {
        return { success: false, content: '', error: `Log file ${filename} not found in logs registry.` };
      }
      const data = fs.readFileSync(safePath, 'utf8');
      const lines = data.split('\n').slice(-50).join('\n');
      return { success: true, content: lines };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
});

// Tool 2: Fetch System Metrics (MCP compliant schema)
export const mcpGetSysMetricsTool = createTool({
  id: 'mcp-get-system-metrics',
  description: 'MCP Tool: Retrieves real-time local CPU, Memory, and Disk usage metrics of the target server.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    cpuUsagePercent: z.number(),
    memoryFreeGB: z.number(),
    memoryTotalGB: z.number(),
    diskUsagePercent: z.number()
  }),
  execute: async () => {
    // Return mock real-time system metrics for SRE analysis
    return {
      cpuUsagePercent: Math.floor(Math.random() * 40) + 50, // 50% - 90% load
      memoryFreeGB: 1.2,
      memoryTotalGB: 16.0,
      diskUsagePercent: 94.5 // Simulated high disk usage
    };
  }
});
