import { Router, Request, Response } from 'express';
import { incidentWorkflow, activeSwarmRuns } from './workflow';
import { getFeatureFlags, setFeatureFlags } from './feature_flags';

const router = Router();

// Store active workflow runs in memory
const activeRuns = new Map<string, {
  run: any;
  runId: string;
  errorLog: string;
  suspendedStepId: string | null;
  status: 'running' | 'suspended' | 'completed' | 'failed';
  context: any;
  result?: any;
}>();

function generateUUID(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Endpoint: Trigger a new incident response workflow run
router.post('/trigger', async (req: Request, res: Response) => {
  const { errorLog } = req.body;
  if (!errorLog) {
    return res.status(400).json({ error: 'errorLog is required.' });
  }

  const runId = generateUUID();
  console.log(`[Incident Agent] Triggering SRE workflow for run ID: ${runId}`);

  try {
    // 1. Create a new Run instance from the workflow
    const run = await incidentWorkflow.createRun({ runId });

    activeRuns.set(runId, {
      run,
      runId,
      errorLog,
      suspendedStepId: null,
      status: 'running',
      context: { errorLog }
    });

    // 2. Start execution
    const runResult = await run.start({
      inputData: { errorLog }
    });

    const runInfo = activeRuns.get(runId);
    if (runInfo) {
      const resultObj = runResult as any;
      
      // Update custom swarm tracking status
      if (activeSwarmRuns[runId]) {
        activeSwarmRuns[runId].result = resultObj;
      }

      if (resultObj.status === 'paused' || resultObj.status === 'suspended') {
        const stepSnapshot = resultObj.steps?.['request-approval'];
        runInfo.status = 'suspended';
        runInfo.suspendedStepId = 'request-approval';
        runInfo.context = resultObj.suspendPayload || stepSnapshot?.payload || resultObj;
        
        console.log(`[Incident Agent] Run ID: ${runId} is SUSPENDED at 'request-approval'.`);
        return res.json({
          success: true,
          runId,
          status: 'SUSPENDED',
          message: 'Workflow paused, awaiting operator approval.',
          details: runInfo.context
        });
      } else {
        runInfo.status = 'completed';
        runInfo.result = resultObj.steps?.['execute-mitigation']?.payload || resultObj;
        console.log(`[Incident Agent] Run ID: ${runId} completed automatically.`);
        return res.json({
          success: true,
          runId,
          status: 'COMPLETED',
          result: runInfo.result
        });
      }
    }

    return res.json({ success: true, runId });
  } catch (err: any) {
    console.error('[Incident Agent Trigger Error]', err.message);
    const runInfo = activeRuns.get(runId);
    if (runInfo) {
      runInfo.status = 'failed';
      runInfo.context = { error: err.message };
    }
    return res.status(500).json({ error: `Workflow failed: ${err.message}` });
  }
});

// Endpoint: Resume a suspended workflow run (Approval/Rejection)
router.post('/resume', async (req: Request, res: Response) => {
  const { runId, approved, editedCommand, editedSignature } = req.body;
  if (!runId || approved === undefined) {
    return res.status(400).json({ error: 'runId and approved (boolean) are required.' });
  }

  const runInfo = activeRuns.get(runId);
  if (!runInfo || !runInfo.run) {
    return res.status(404).json({ error: `Workflow run with ID ${runId} not found.` });
  }

  if (runInfo.status !== 'suspended') {
    return res.status(400).json({ error: `Workflow run is not suspended. Current status: ${runInfo.status}` });
  }

  console.log(`[Incident Agent] Resuming run ID: ${runId} with approval: ${approved}`);
  runInfo.status = 'running';

  try {
    const resumeResult = await runInfo.run.resume({
      stepId: 'request-approval',
      resumeData: { approved, editedCommand, editedSignature }
    });

    runInfo.status = 'completed';
    runInfo.result = (resumeResult as any).steps?.['execute-mitigation']?.payload || resumeResult;

    console.log(`[Incident Agent] Run ID: ${runId} successfully resumed and completed with status: ${(resumeResult as any).status}`);

    return res.json({
      success: true,
      runId,
      status: 'COMPLETED',
      result: runInfo.result
    });
  } catch (err: any) {
    console.error('[Incident Agent Resume Error]', err.message);
    runInfo.status = 'failed';
    return res.status(500).json({ error: `Workflow resumption failed: ${err.message}` });
  }
});

// Endpoint: Get list of runs
router.get('/runs', (req: Request, res: Response) => {
  const runs = Array.from(activeRuns.values()).map(r => {
    const swarmInfo = activeSwarmRuns[r.runId];
    return {
      runId: r.runId,
      errorLog: r.errorLog,
      suspendedStepId: r.suspendedStepId,
      status: r.status,
      context: r.context,
      result: r.result,
      swarmTree: swarmInfo ? swarmInfo.tree : null,
      compressionRatio: swarmInfo ? swarmInfo.compressionRatio : null,
      swarmStatus: swarmInfo ? swarmInfo.status : r.status.toUpperCase()
    };
  });
  return res.json(runs);
});

// Endpoint: Get Feature Flags
router.get('/flags', (req: Request, res: Response) => {
  return res.json(getFeatureFlags());
});

// Endpoint: Update Feature Flags
router.post('/flags', (req: Request, res: Response) => {
  const updated = setFeatureFlags(req.body);
  return res.json(updated);
});

// Endpoint: Reset Runs
router.post('/reset', (req: Request, res: Response) => {
  activeRuns.clear();
  for (const key of Object.keys(activeSwarmRuns)) {
    delete activeSwarmRuns[key];
  }
  return res.json({ success: true });
});

export default router;
