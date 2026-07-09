import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3002;
const GITHUB_REPO = 'vercel/ms';

async function fetchAndIngest() {
  const isLive = process.argv.includes('--live');
  let issues = [];

  if (isLive) {
    console.log(`[GitHub Bridge] Querying live issues from GitHub API for: ${GITHUB_REPO}...`);
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues?state=open`, {
        headers: { 'User-Agent': 'GithubParallelAgents-Triage-Swarm' }
      });
      if (!response.ok) {
        throw new Error(`GitHub API returned status ${response.status}`);
      }
      const data = await response.json();
      // Filter out Pull Requests (which GitHub API returns as issues)
      issues = data.filter(issue => !issue.pull_request).slice(0, 3);
      console.log(`[GitHub Bridge] Found ${issues.length} live open issues.`);
    } catch (err) {
      console.warn(`[GitHub Bridge] Failed to fetch live issues: ${err.message}. Falling back to cached issues.`);
      issues = JSON.parse(fs.readFileSync(path.join(__dirname, 'cached_issues.json'), 'utf8'));
    }
  } else {
    console.log('[GitHub Bridge] Loading issues from cached_issues.json (Deterministic Mode)...');
    issues = JSON.parse(fs.readFileSync(path.join(__dirname, 'cached_issues.json'), 'utf8'));
  }

  // Ingest each issue to the control plane log gateway
  for (const issue of issues) {
    const errorLog = `[GITHUB ISSUE #${issue.number}] Title: ${issue.title} | Body: ${issue.body}`;
    console.log(`\n[GitHub Bridge] Ingesting Issue #${issue.number}...`);
    
    try {
      const ingestResponse = await fetch(`http://localhost:${PORT}/api/log-ingest/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorLog })
      });
      
      if (!ingestResponse.ok) {
        throw new Error(`Ingest gateway returned status ${ingestResponse.status}`);
      }
      const result = await ingestResponse.json();
      console.log(`[GitHub Bridge] Success! Run ID: ${result.runId} started for Issue #${issue.number}.`);
    } catch (err) {
      console.error(`[GitHub Bridge] Failed to ingest Issue #${issue.number}: ${err.message}`);
    }
    
    // Space out ingests by 1.5 seconds to protect LLM queue boundaries
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

fetchAndIngest();
