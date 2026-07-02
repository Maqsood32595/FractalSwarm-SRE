import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint: Ingest a log stream entry / system alert
router.post('/alert', async (req: Request, res: Response) => {
  const { errorLog } = req.body;
  if (!errorLog) {
    return res.status(400).json({ error: 'errorLog string is required.' });
  }

  console.log(`[Log Ingest] Received Alert Log: "${errorLog}"`);

  try {
    const port = process.env.PORT || 3002;
    
    // Forward the log to the Mastra Incident Agent trigger endpoint
    const response = await fetch(`http://localhost:${port}/api/incident-agent/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorLog })
    });

    if (!response.ok) {
      throw new Error(`Incident Agent trigger returned status ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Log Ingest Alert Error]', err.message);
    return res.status(500).json({ error: `Failed to trigger incident handling: ${err.message}` });
  }
});

export default router;
