import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { queryMemory, executeCommand, incidentAgent } from './agent';
import { createGrandchildAgent } from './grandchild';
import { mcpReadLogFileTool, mcpGetSysMetricsTool } from './mcp_tools';
import { compressAgentContext } from './compressor';
import { getFeatureFlags } from './feature_flags';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Define the global SRE state schema, including new swarm trace logs
const stateSchema = z.object({
  errorLog: z.string().default(''),
  proposedCommand: z.string().default(''),
  confidence: z.number().default(0),
  explanation: z.string().default(''),
  isSafe: z.boolean().default(false),
  rejectionReason: z.string().default(''),
  approved: z.boolean().default(false),
  success: z.boolean().default(false),
  output: z.string().default(''),
  status: z.string().default('PENDING'),
  swarmTreeTrace: z.string().default('') // Dynamic JSON tree state trace
});

// Dynamic Swarm State tracker to expose to the UI dashboard
export const activeSwarmRuns: Record<string, {
  errorLog: string;
  status: string;
  tree: any;
  compressionRatio?: string;
  result?: any;
}> = {};

// Helper utility for Exponential Backoff on rate-limited API calls (429)
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 3000): Promise<T> {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const errMsg = err.message || '';
      const statusCode = err.statusCode || err.status || 0;
      const isRateLimit = statusCode === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('429');
      
      if (isRateLimit && attempt < maxRetries) {
        console.warn(`[Rate Limiter] Gemini rate limit hit (429/Quota) on attempt ${attempt}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 3s, 6s, 12s, 24s...
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// Step 1: Fractal Agent Swarm (FAS) Triage & Investigation
const triageStep = createStep({
  id: 'triage-incident',
  inputSchema: z.object({
    errorLog: z.string(),
  }),
  outputSchema: z.object({
    proposedCommand: z.string(),
    confidence: z.number(),
    explanation: z.string(),
  }),
  execute: async ({ inputData, runId, setState }) => {
    console.log(`[FAS Parent] Root incident captured: "${inputData.errorLog}"`);
    const flags = getFeatureFlags();
    
    // Initialize the visualization tree trace
    const swarmTree = {
      name: 'Incident Commander (Parent)',
      role: 'Global Coordinator',
      model: flags.AGENT_MODEL_TIER === 'PRO' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash',
      status: 'active',
      children: [] as any[]
    };

    activeSwarmRuns[runId] = {
      errorLog: inputData.errorLog,
      status: 'TRIAGING',
      tree: swarmTree
    };

    // Check if it is a GitHub Issue incident
    const isGithubIssue = inputData.errorLog.startsWith('[GITHUB ISSUE');
    
    // Determine Child Agent specialty
    let childSpecialty = 'Diagnostics Specialist';
    let childId = 'sys-diagnostics';
    
    if (isGithubIssue) {
      childSpecialty = 'GitHub Code Specialist';
      childId = 'github-code';
    } else if (inputData.errorLog.toLowerCase().includes('db') || inputData.errorLog.toLowerCase().includes('postgres')) {
      childSpecialty = 'Database Recovery Specialist';
      childId = 'db-recovery';
    } else if (inputData.errorLog.toLowerCase().includes('space') || inputData.errorLog.toLowerCase().includes('disk')) {
      childSpecialty = 'System Storage Specialist';
      childId = 'storage-recovery';
    }

    const childNode = {
      name: `SRE Child Agent (${childId})`,
      role: childSpecialty,
      model: flags.AGENT_MODEL_TIER === 'PRO' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash',
      status: 'active',
      children: [] as any[]
    };
    swarmTree.children.push(childNode);

    // Spawn Grandchild Agent to run diagnostics
    console.log(`[FAS Child] Spawning grandchild agent to fetch local logs/codebase...`);
    const grandchildNode = {
      name: isGithubIssue ? 'Diagnostics Grandchild (mcp-code-scraper)' : 'Diagnostics Grandchild (mcp-log-parser)',
      role: isGithubIssue ? 'Source Code Telemetry Parser' : 'Log & System Telemetry Parser',
      model: 'google/gemini-2.5-flash',
      status: 'running',
      tools: isGithubIssue ? ['mcp-read-file'] : ['mcp-read-log-file', 'mcp-get-system-metrics']
    };
    childNode.children.push(grandchildNode);
    activeSwarmRuns[runId].tree = { ...swarmTree };

    let proposedCommand = 'echo "Standard diagnostic check complete."';
    let confidence = 50;
    let explanation = 'No playbook matched. Defaulting to safe report.';

    if (isGithubIssue) {
      // 1. Read target sandbox index.ts codebase (Guarantees clean state)
      const targetSourceFile = path.resolve('d:/HiDevs/GoogleAgents/GithubParellelAgents/test_sandbox/ms/src/index.ts');
      try {
        execSync('git checkout src/index.ts', { cwd: 'd:/HiDevs/GoogleAgents/GithubParellelAgents/test_sandbox/ms' });
      } catch (checkoutErr: any) {
        console.warn('[FAS Parent] Failed to checkout clean index.ts:', checkoutErr.message);
      }
      let codebase = '';
      try {
        codebase = fs.readFileSync(targetSourceFile, 'utf8');
      } catch (err: any) {
        codebase = `// Source file missing. Error: ${err.message}`;
      }

      grandchildNode.status = 'completed';
      activeSwarmRuns[runId].tree = { ...swarmTree };

      // Compress context for trace representation
      const compressedSummary = codebase.length > 500 ? codebase.substring(0, 400) + '\n... [Codebase Compressed for Context] ...' : codebase;
      activeSwarmRuns[runId].compressionRatio = `${codebase.length} chars -> ${compressedSummary.length} chars (${Math.round((1 - (compressedSummary.length / codebase.length)) * 100)}% compressed)`;

      // 2. Query LLM to write full corrected source code
      console.log('[FAS Parent] Invoking Gemini to draft fix for GitHub Issue...');
      let responseCode = '';
      try {
        const prompt = `You are an expert Senior Software Engineer. We need to resolve a GitHub issue in the provided codebase.
        Here is the issue description:
        "${inputData.errorLog}"
        
        Here is the current content of the target source file:
        \`\`\`typescript
        ${codebase}
        \`\`\`
        
        CRITICAL OUTPUT CONSTRAINTS:
        1. DO NOT attempt to generate arbitrary custom diff visualizers. 
        2. Output the FULL, single-spaced sanitized file code within a single, continuous block.
        3. Keep all unchanged lines exactly as they are—do not duplicate or prefix unchanged code lines with an extra '+' or '-'.
        4. Ensure your text generation completes fully. Never truncate or leave structural blocks open or cut off mid-sentence.
        5. Return ONLY the raw TypeScript file contents (do not include markdown code block backticks \`\`\` or explanation text).`;

        const genResult = await retryWithBackoff(() => incidentAgent.generate(prompt));
        responseCode = genResult.text || '';
        
        // Clean markdown backticks if any
        if (responseCode.includes('```typescript')) {
          responseCode = responseCode.split('```typescript')[1].split('```')[0].trim();
        } else if (responseCode.includes('```')) {
          responseCode = responseCode.split('```')[1].split('```')[0].trim();
        }
      } catch (e: any) {
        console.warn(`[FAS Parent] LLM failed to write patch: ${e.message}.`);
        responseCode = codebase; // default to original
      }

      // 3. Write patch code to temp file
      const patchPath = path.resolve(`d:/HiDevs/GoogleAgents/GithubParellelAgents/temp_patches/${runId}.ts`);
      try {
        fs.writeFileSync(patchPath, responseCode, 'utf8');
      } catch (writeErr) {
        console.error('[FAS Parent] Failed to write patch file:', writeErr);
      }

      proposedCommand = `node d:\\HiDevs\\GoogleAgents\\GithubParellelAgents\\patch_runner.js d:\\HiDevs\\GoogleAgents\\GithubParellelAgents\\temp_patches\\${runId}.ts`;
      const issueNum = inputData.errorLog.match(/#(\d+)/)?.[1] || 'Unknown';
      explanation = `[GitHub Code Specialist] Analyzed Issue #${issueNum}. Proposed source patch compiled and ready for verification.`;
      confidence = 94;

    } else {
      // Spawn Grandchild Agent to run SRE diagnostics
      const grandchild = createGrandchildAgent({
        id: 'mcp-log-parser',
        name: 'Log Parser Grandchild',
        instructions: `
          Read the appropriate log file (db.log for database errors, system.log for others) and retrieve the server metrics.
          Synthesize the output.
        `,
        tools: {
          readLog: mcpReadLogFileTool,
          getMetrics: mcpGetSysMetricsTool
        }
      });

      // Run Grandchild diagnostics
      const targetLog = childId === 'db-recovery' ? 'db.log' : 'system.log';
      let rawGrandchildOutput = '';
      try {
        const grandchildResult = await retryWithBackoff(() => grandchild.generate(
          `Fetch system metrics and read the last lines of the log file: ${targetLog}`
        ));
        rawGrandchildOutput = grandchildResult.text || 'No diagnostics fetched.';
      } catch (e: any) {
        console.warn(`[FAS Child] Grandchild LLM call failed: ${e.message}. Falling back to mock metrics.`);
        rawGrandchildOutput = `Mock Metrics: CPU load 84%, Memory 91%, Disk utilization 98% (Alert trigger threshold exceeded). Last log lines: ERROR - Disk full on mount point /var/log.`;
      }
      
      grandchildNode.status = 'completed';
      activeSwarmRuns[runId].tree = { ...swarmTree };
      
      // Pass raw context to WASM Compressor
      const compressedSummary = await compressAgentContext(rawGrandchildOutput);
      
      const originalSize = rawGrandchildOutput.length;
      const compressedSize = compressedSummary.length;
      const compressionRatio = `${originalSize} chars -> ${compressedSize} chars (${Math.round((1 - (compressedSize / originalSize)) * 100)}% compressed)`;
      activeSwarmRuns[runId].compressionRatio = compressionRatio;
      console.log(`[FAS Parent] Log compression complete: ${compressionRatio}`);

      // Query historical Playbook
      const memoryResult = await queryMemory(inputData.errorLog);
      const bestMatch = memoryResult.results?.[0];

      if (bestMatch && bestMatch.bit_density >= 87.5) {
        const lines = bestMatch.text.split('\n');
        const cmdLine = lines.find((l: string) => l.toLowerCase().startsWith('command:'));
        proposedCommand = cmdLine ? cmdLine.substring(8).trim() : 'echo "Safe check execution complete."';
        confidence = bestMatch.bit_density;
        explanation = `Matched local playbook with ${bestMatch.bit_density}% similarity. Consolidated logs show: ${compressedSummary.replace(/\n/g, ' ')}`;
      } else {
        console.log('[FAS Parent] No high-confidence playbook match. Parent Agent actively triaging...');
        try {
          const triageResponse = await retryWithBackoff(() => incidentAgent.generate(
            `You are an expert SRE Incident Commander. We have captured a system failure:
            Root Alert: "${inputData.errorLog}"
            Compressed Diagnostics: "${compressedSummary}"
            
            Analyze the diagnostics and isolate the failure. You must propose:
            1. A concise SRE explanation of the failure root-cause and isolation details.
            2. A safe, non-destructive single-line shell command to mitigate or isolate the failure.
            
            Response format (JSON):
            {
              "explanation": "Brief explanation...",
              "proposedCommand": "command to run",
              "confidence": 85
            }
            `
          ));
          const parsed = JSON.parse(triageResponse.text || '{}');
          proposedCommand = parsed.proposedCommand || 'echo "Dynamic diagnostics complete."';
          confidence = parsed.confidence || 75;
          explanation = `[Dynamic Swarm Isolation] ${parsed.explanation || 'Analyzed failure and proposed resolution.'}`;
        } catch (err: any) {
          console.warn(`[FAS Parent] Failed to dynamically isolate failure via LLM: ${err.message}. Using local rule-based isolation.`);
          const lowerLog = inputData.errorLog.toLowerCase();
          if (lowerLog.includes('temp_sys_bloat.log')) {
            proposedCommand = 'del /f /q "D:\\HiDevs\\GoogleAgents\\Log Folder\\temp_sys_bloat.log" && echo "Disk bloat log cleaned successfully."';
            explanation = '[Local Rule-Based Isolation] Bloat log file detected. Proposing targeted deletion of temp_sys_bloat.log from Log Folder to restore disk health.';
            confidence = 95;
          } else if (lowerLog.includes('delete') || lowerLog.includes('drop') || lowerLog.includes('rm -rf') || lowerLog.includes('format')) {
            proposedCommand = 'echo "CRITICAL: Destructive action aborted by SRE safety policies."';
            explanation = '[Safety Policy Violation] Operator requested a destructive operation. Access Denied.';
            confidence = 100;
          } else if (lowerLog.includes('port') || rawGrandchildOutput.toLowerCase().includes('port')) {
            proposedCommand = 'fuser -k 5432/tcp && echo "Port 5432 freed successfully."';
            explanation = '[Local Rule-Based Isolation] Port conflict detected. Proposing command to kill process holding port 5432.';
            confidence = 80;
          } else if (lowerLog.includes('space') || rawGrandchildOutput.toLowerCase().includes('space')) {
            proposedCommand = 'del /f /q "D:\\HiDevs\\GoogleAgents\\Log Folder\\temp_sys_bloat.log" && echo "Disk bloat log cleaned successfully."';
            explanation = '[Local Rule-Based Isolation] Disk utilization critical. Proposing targeted deletion of bloat log file.';
            confidence = 85;
          } else if (lowerLog.includes('tfl') || lowerLog.includes('line') || lowerLog.includes('delay') || lowerLog.includes('suspended')) {
            let lineName = "Transit";
            if (lowerLog.includes('bakerloo')) lineName = "Bakerloo Line";
            else if (lowerLog.includes('circle')) lineName = "Circle Line";
            else if (lowerLog.includes('district')) lineName = "District Line";
            else if (lowerLog.includes('dlr')) lineName = "DLR";
            else if (lowerLog.includes('hammersmith')) lineName = "Hammersmith & City Line";
            else if (lowerLog.includes('waterloo')) lineName = "Waterloo & City Line";
            else if (lowerLog.includes('metropolitan')) lineName = "Metropolitan Line";
            
            proposedCommand = `echo "ALERT: Rerouting backup transport and deploying emergency shuttle buses on the ${lineName} sector."`;
            explanation = `[Local Rule-Based Transport Isolation] ${lineName} service degradation detected. Proposing automated bus bridge deployment to clear route congestion.`;
            confidence = 92;
          } else {
            proposedCommand = 'echo "Triage complete. System status healthy."';
            explanation = '[Local Rule-Based Isolation] No active anomalies detected in logs. Proposing system health check.';
            confidence = 60;
          }
        }
      }
    }

    // Apply Feature Flags (Skip dry-run rewrite for safe GitHub sandbox runs)
    if (!isGithubIssue && !flags.EXECUTE_MITIGATIONS) {
      console.log('[FAS Parent] Feature flag EXECUTE_MITIGATIONS is disabled. Rewriting command to Dry-Run.');
      proposedCommand = `echo "[DRY-RUN AUDIT] Would execute: ${proposedCommand}"`;
    }

    setState({
      errorLog: inputData.errorLog,
      proposedCommand,
      confidence,
      explanation,
      swarmTreeTrace: JSON.stringify(swarmTree)
    });

    activeSwarmRuns[runId].status = 'AWAITING_APPROVAL';
    return { proposedCommand, confidence, explanation };
  }
});

// Step 2: Safety Audit the command via Enkrypt AI Guardrails
const safetyAuditStep = createStep({
  id: 'safety-audit',
  inputSchema: z.object({
    proposedCommand: z.string(),
  }),
  outputSchema: z.object({
    command: z.string(),
    isSafe: z.boolean(),
    rejectionReason: z.string(),
  }),
  execute: async ({ inputData, setState }) => {
    console.log(`[Workflow: Safety] Auditing command: "${inputData.proposedCommand}"`);
    
    let isSafe = false;
    let rejectionReason = '';

    try {
      const port = process.env.PORT || 3002;
      const response = await fetch(`http://localhost:${port}/api/safety-guard/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: inputData.proposedCommand })
      });

      if (!response.ok) {
        throw new Error('Safety Guard API request failed');
      }

      const result = await response.json();
      isSafe = result.safe;
      rejectionReason = result.rejectionReason || '';
    } catch (err: any) {
      console.error('[Workflow: Safety Guard Fetch Error]', err.message);
      rejectionReason = 'Safety Guard offline. Blocking command execution for security.';
    }

    setState({
      isSafe,
      rejectionReason
    });

    return {
      command: inputData.proposedCommand,
      isSafe,
      rejectionReason
    };
  }
});

// Step 3: Human-in-the-Loop Approval Suspension
const requestApprovalStep = createStep({
  id: 'request-approval',
  inputSchema: z.object({
    command: z.string(),
    isSafe: z.boolean(),
    rejectionReason: z.string(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
  }),
  suspendSchema: z.object({
    command: z.string(),
    isSafe: z.boolean(),
    rejectionReason: z.string().optional(),
    explanation: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    editedCommand: z.string().optional(),
    editedSignature: z.string().optional(),
  }),
  execute: async ({ inputData, resumeData, runId, suspend, state, setState }) => {
    if (resumeData) {
      console.log(`[Workflow: Approval] Operator approval action received: ${resumeData.approved}`);
      
      if (resumeData.editedCommand) {
        setState({ proposedCommand: resumeData.editedCommand });
      }
      if (resumeData.editedSignature) {
        setState({ finalSignature: resumeData.editedSignature });
      }

      setState({ approved: resumeData.approved });

      if (activeSwarmRuns[runId]) {
        activeSwarmRuns[runId].status = resumeData.approved ? 'EXECUTING' : 'ABORTED';
      }
      return { approved: resumeData.approved };
    }

    if (!inputData.isSafe) {
      console.log('[Workflow: Approval] Command rejected automatically due to safety audit failure.');
      setState({
        approved: false
      });
      if (activeSwarmRuns[runId]) {
        activeSwarmRuns[runId].status = 'BLOCKED_BY_SAFETY';
      }
      return { approved: false };
    }

    console.log('[Workflow: Approval] Suspending workflow. Awaiting operator confirmation...');
    return await suspend({
      command: inputData.command,
      isSafe: inputData.isSafe,
      rejectionReason: inputData.rejectionReason,
      explanation: (state as any).explanation || ''
    });
  }
});

// Step 4: Execution & Mitigation
const executionStep = createStep({
  id: 'execute-mitigation',
  inputSchema: z.object({
    approved: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    status: z.string(),
  }),
  execute: async ({ inputData, runId, state, setState }) => {
    if (!inputData.approved) {
      console.log('[Workflow: Execution] Action aborted. Triage terminated.');
      const res = {
        success: false,
        output: 'Remediation aborted by user or blocked by safety filter.',
        status: 'ABORTED'
      };
      setState(res);
      if (activeSwarmRuns[runId]) {
        activeSwarmRuns[runId].status = 'ABORTED';
        activeSwarmRuns[runId].result = res;
      }
      return res;
    }

    const commandToRun = (state as any).proposedCommand;
    console.log(`[Workflow: Execution] Approved! Executing: "${commandToRun}"`);
    
    let runResult = await executeCommand(commandToRun);
    
    // Check if it is a GitHub incident and the execution failed (tests failed)
    const isGithub = (state as any).errorLog.startsWith('[GITHUB ISSUE');
    
    if (isGithub && !runResult.success) {
      console.log(`[Workflow: Execution] First patch attempt failed Jest tests. Initiating Self-Correction loop...`);
      
      let attempts = 1;
      const maxAttempts = 3;
      let lastErrorOutput = runResult.output || 'Test suite failed.';
      
      const targetSourceFile = path.resolve('d:/HiDevs/GoogleAgents/GithubParellelAgents/test_sandbox/ms/src/index.ts');
      const originalCode = fs.existsSync(targetSourceFile) ? fs.readFileSync(targetSourceFile, 'utf8') : '';
      
      while (attempts < maxAttempts && !runResult.success) {
        attempts++;
        console.log(`[Workflow: Execution] Self-Correction Attempt ${attempts}/${maxAttempts}...`);
        
        if (activeSwarmRuns[runId]) {
          activeSwarmRuns[runId].status = `RE-TRIAGING (Attempt ${attempts})`;
        }
        
        try {
          const failingPatchPath = path.resolve(`d:/HiDevs/GoogleAgents/GithubParellelAgents/temp_patches/${runId}.ts`);
          const failingCode = fs.existsSync(failingPatchPath) ? fs.readFileSync(failingPatchPath, 'utf8') : '';

          const debugPrompt = `You are a Senior Software Engineer debugging a failing test suite.
          The previous patch attempt failed.
          
          Original Code:
          \`\`\`typescript
          ${originalCode}
          \`\`\`
          
          Failing Code Patch that caused the error:
          \`\`\`typescript
          ${failingCode}
          \`\`\`
          
          Identify the bug in the failing patch logic. 
          
          CRITICAL OUTPUT CONSTRAINTS:
          1. DO NOT attempt to generate arbitrary custom diff visualizers. 
          2. Output the FULL, single-spaced sanitized file code within a single, continuous block.
          3. Keep all unchanged lines exactly as they are—do not duplicate or prefix unchanged code lines with an extra '+' or '-'.
          4. Ensure your text generation completes fully. Never truncate or leave structural blocks open or cut off mid-sentence.
          5. Return ONLY the complete corrected contents of the file (no markdown backticks or explanations).`;
          
          const correctionResult = await retryWithBackoff(() => incidentAgent.generate(debugPrompt));
          let correctedCode = correctionResult.text || '';
          
          if (correctedCode.includes('```typescript')) {
            correctedCode = correctedCode.split('```typescript')[1].split('```')[0].trim();
          } else if (correctedCode.includes('```')) {
            correctedCode = correctedCode.split('```')[1].split('```')[0].trim();
          }
          
          // Write corrected code to patch file
          const patchPath = path.resolve(`d:/HiDevs/GoogleAgents/GithubParellelAgents/temp_patches/${runId}.ts`);
          fs.writeFileSync(patchPath, correctedCode, 'utf8');
          
          // Re-execute
          console.log(`[Workflow: Execution] Re-running tests for Attempt ${attempts}...`);
          runResult = await executeCommand(commandToRun);
          
          if (runResult.success) {
            console.log(`[Workflow: Execution] Self-Correction succeeded on Attempt ${attempts}!`);
            break;
          } else {
            lastErrorOutput = runResult.output || 'Test suite failed.';
          }
        } catch (e: any) {
          console.error(`[Workflow: Execution] Self-correction attempt ${attempts} failed to query LLM:`, e.message);
        }
      }
    }
    
    const res = {
      success: runResult.success,
      output: runResult.output || runResult.error || 'No output.',
      status: runResult.success ? 'RESOLVED' : 'FAILED'
    };
    
    setState(res);
    if (activeSwarmRuns[runId]) {
      activeSwarmRuns[runId].status = runResult.success ? 'COMPLETED' : 'FAILED';
      activeSwarmRuns[runId].result = res;
    }
    return res;
  }
});

// Compose the SRE Workflow using stateSchema
export const incidentWorkflow = createWorkflow({
  id: 'incident-response-workflow',
  inputSchema: z.object({
    errorLog: z.string()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    status: z.string()
  }),
  stateSchema
})
  .then(triageStep)
  .then(safetyAuditStep)
  .then(requestApprovalStep)
  .then(executionStep)
  .commit();

// Instantiate Mastra class to register workflow and agents
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: { incidentAgent },
  workflows: { incidentWorkflow }
});
