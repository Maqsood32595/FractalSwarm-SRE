import { Router, Request, Response } from 'express';

const router = Router();

// Endpoint: Audit a proposed terminal command
router.post('/audit', async (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'command string is required.' });
  }

  const apiKey = process.env.ENKRYPT_API_KEY;

  if (apiKey) {
    try {
      console.log(`[Safety Guard] Routing command to Enkrypt AI API for evaluation...`);
      const response = await fetch('https://api.enkryptai.com/guardrails/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          text: command,
          detectors: {
            injection_attack: { enabled: true },
            policy_violation: { enabled: true }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Enkrypt AI API returned status ${response.status}`);
      }

      const data: any = await response.json();
      
      // If injection is detected or safety validation fails
      const isSafe = !data.injection_detected && (!data.policy_violations || data.policy_violations.length === 0);
      
      return res.json({
        safe: isSafe,
        rejectionReason: isSafe ? undefined : 'Enkrypt AI: Security policy violation or command injection detected.',
        details: data
      });
    } catch (err: any) {
      console.error('[Safety Guard API Error]', err.message);
      // Fallback to local safety check if API request fails
    }
  }

  // Local Safety Engine Fallback (No Key / Network Outage)
  console.log(`[Safety Guard] Running local safety policies...`);
  
  const lowerCmd = command.toLowerCase();
  
  // 1. Detect Injection Attacks (e.g. command chaining characters like ;, &&, |, or backticks inside strings)
  const hasInjection = /[\;&\|`]/.test(command) && 
    (lowerCmd.includes('curl') || lowerCmd.includes('wget') || lowerCmd.includes('sh ') || lowerCmd.includes('bash'));

  // 2. Detect Dangerous Root/System commands
  const dangerousWords = ['rm -rf', 'mkfs', 'dd if=', 'shutdown', 'reboot', '/etc/passwd', 'passwd ', 'shadow'];
  let blockedWord: string | null = null;
  for (const word of dangerousWords) {
    if (lowerCmd.includes(word)) {
      blockedWord = word;
      break;
    }
  }

  if (hasInjection) {
    console.log(`[Safety Guard] Blocked: Command injection signature detected.`);
    return res.json({
      safe: false,
      rejectionReason: 'Blocked by Local Engine: Potential shell script injection attack detected.'
    });
  }

  if (blockedWord) {
    console.log(`[Safety Guard] Blocked: Dangerous system command word "${blockedWord}".`);
    return res.json({
      safe: false,
      rejectionReason: `Blocked by Local Engine: Unauthorized system command "${blockedWord}".`
    });
  }

  console.log(`[Safety Guard] Command approved: "${command}"`);
  return res.json({
    safe: true
  });
});

export default router;
