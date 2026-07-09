import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
const __dirname = path.join(path.resolve(), 'GithubParellelAgents');

const app = express();
const PORT = 3004;
const GATEWAY_URL = 'http://localhost:3002';

app.use(cors());
app.use(express.json());

// Helper function to generate a simple line-by-line HTML diff
function getDiffHtml(runId: string): string {
  try {
    const originalFile = path.resolve('d:/HiDevs/GoogleAgents/GithubParellelAgents/test_sandbox/ms/src/index.ts');
    const patchedFile = path.resolve(`d:/HiDevs/GoogleAgents/GithubParellelAgents/temp_patches/${runId}.ts`);

    if (!fs.existsSync(originalFile) || !fs.existsSync(patchedFile)) {
      return '<div class="text-xs text-slate-500">Code diff not available.</div>';
    }

    const oldContent = fs.readFileSync(originalFile, 'utf8').split(/\r?\n/);
    const newContent = fs.readFileSync(patchedFile, 'utf8').split(/\r?\n/);

    let diffHtml = '<div class="font-mono text-xs overflow-x-auto p-4 bg-slate-950 rounded-xl border border-white/5 max-h-96 space-y-0.5">';
    
    // Simple diff comparison algorithm (for visual presentation)
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldContent.length || newIdx < newContent.length) {
      const oldLine = oldContent[oldIdx];
      const newLine = newContent[newIdx];

      if (oldLine === newLine) {
        // Unchanged line
        if (oldLine !== undefined) {
          diffHtml += `<div class="text-slate-500 select-none flex"><span class="w-8 text-right pr-2 text-slate-600">${oldIdx + 1}</span><span class="pl-2">${escapeHtml(oldLine)}</span></div>`;
        }
        oldIdx++;
        newIdx++;
      } else {
        // Simple mismatch resolution: check if next lines match to identify additions/deletions
        let lookaheadMatch = false;
        for (let offset = 1; offset < 5; offset++) {
          if (oldContent[oldIdx + offset] === newLine) {
            // Deletion occurred
            for (let d = 0; d < offset; d++) {
              diffHtml += `<div class="bg-red-950/40 text-red-400 flex"><span class="w-8 text-right pr-2 text-red-600/50">${oldIdx + d + 1}</span><span class="pl-2 font-bold">-</span><span class="pl-2">${escapeHtml(oldContent[oldIdx + d])}</span></div>`;
            }
            oldIdx += offset;
            lookaheadMatch = true;
            break;
          } else if (oldLine === newContent[newIdx + offset]) {
            // Addition occurred
            for (let a = 0; a < offset; a++) {
              diffHtml += `<div class="bg-emerald-950/40 text-emerald-400 flex"><span class="w-8 text-right pr-2 text-emerald-600/50">+</span><span class="pl-2 font-bold">+</span><span class="pl-2">${escapeHtml(newContent[newIdx + a])}</span></div>`;
            }
            newIdx += offset;
            lookaheadMatch = true;
            break;
          }
        }

        if (!lookaheadMatch) {
          // Replace line (combination of delete and add)
          if (oldLine !== undefined) {
            diffHtml += `<div class="bg-red-950/40 text-red-400 flex"><span class="w-8 text-right pr-2 text-red-600/50">${oldIdx + 1}</span><span class="pl-2 font-bold">-</span><span class="pl-2">${escapeHtml(oldLine)}</span></div>`;
            oldIdx++;
          }
          if (newLine !== undefined) {
            diffHtml += `<div class="bg-emerald-950/40 text-emerald-400 flex"><span class="w-8 text-right pr-2 text-emerald-600/50">+</span><span class="pl-2 font-bold">+</span><span class="pl-2">${escapeHtml(newLine)}</span></div>`;
            newIdx++;
          }
        }
      }
    }

    diffHtml += '</div>';
    return diffHtml;
  } catch (err: any) {
    return `<div class="text-xs text-red-400">Failed to compile diff: ${err.message}</div>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Endpoint: Fetch diff for a specific run ID
app.get('/api/runs/:runId/diff', (req, res) => {
  const { runId } = req.params;
  const diffHtml = getDiffHtml(runId);
  return res.json({ diffHtml });
});

// Endpoint: Trigger GitHub issue storm (simulated)
app.post('/api/simulator/github-storm', (req, res) => {
  console.log('[Dashboard] Triggering GitHub live issue ingest via fetch_issues.js --live');
  exec('node d:/HiDevs/GoogleAgents/GithubParellelAgents/fetch_issues.js --live', (error, stdout, stderr) => {
    if (error) {
      console.error(`[GitHub Ingest Error]: ${error.message}`);
      return;
    }
    console.log(`[GitHub Ingest Completed]: ${stdout}`);
  });
  return res.json({ success: true, message: 'GitHub Ingest Triggered.' });
});

// Serve the dedicated GitHub parallel agents dashboard page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GithubParallelAgents — Code Triage Control Plane</title>
        <script src="https://cdn.tailwindcss.com/3.4.16"></script>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #0d1117;
            background-image: radial-gradient(circle at 50% -20%, #1c212c 0%, #0d1117 80%);
          }
          .github-card {
            background: #161b22;
            border: 1px solid #30363d;
          }
          .glass-panel {
            background: rgba(22, 27, 34, 0.8);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid #30363d;
          }
        </style>
      </head>
      <body class="text-slate-200 min-h-screen pb-12">
        <header class="w-full py-4 px-6 md:px-12 flex justify-between items-center glass-panel sticky top-0 z-50">
          <div class="flex items-center gap-3">
            <span class="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">🐙 GithubParallelAgents</span>
            <span class="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-medium">Self-Healing Swarms</span>
          </div>
          <div class="flex items-center gap-4">
            <button id="approveAllBtn" onclick="approveAllSwarms()" class="hidden px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-500/10 transition">⚡ Deploy Parallel Agents (Bulk PR Release)</button>
            <button onclick="resetDashboard()" class="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition">Reset Runs</button>
            <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span class="text-xs text-slate-400 font-medium">Listening on Port 3004</span>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-6 md:px-12 mt-8">
          <!-- Project & Target Repository Card -->
          <div class="github-card rounded-2xl p-6 mb-8 flex justify-between items-center bg-gradient-to-r from-[#161b22] to-[#1d2430]">
            <div class="flex items-center gap-4">
              <span class="text-4xl">📦</span>
              <div>
                <h1 class="text-2xl md:text-3xl font-extrabold tracking-wide text-slate-100 flex flex-wrap items-center gap-2.5">
                  <span>Open Source Git Repository:</span>
                  <span class="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-xl">vercel/ms</span>
                </h1>
                <p class="text-xs text-slate-400 mt-2">Status: Cloned to Local Git Sandbox. Jest Unit test suite: <span class="text-emerald-400 font-bold">167/167 tests operational</span>.</p>
              </div>
            </div>
            <button onclick="triggerGitHubStorm()" id="githubStormBtn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-5 rounded-lg shadow-lg shadow-indigo-500/20 transition flex items-center gap-2 shrink-0">
              <span>🐙</span> Ingest GitHub Open Issues
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Sidebar Panel: Safety and Observability -->
            <div class="space-y-6 lg:col-span-1">
              <div class="github-card rounded-2xl p-5">
                <h2 class="text-sm font-bold uppercase tracking-wider mb-4 text-indigo-400 flex items-center gap-2">
                  <span>🛡️</span> Sandbox Safety Guardrails
                </h2>
                <div class="space-y-3.5 text-xs">
                  <div class="flex justify-between items-center p-2.5 bg-black/20 rounded-lg border border-white/5">
                    <span class="text-slate-400">File Path Lock Constraint</span>
                    <span class="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">src/**/*.ts</span>
                  </div>
                  <div class="flex justify-between items-center p-2.5 bg-black/20 rounded-lg border border-white/5">
                    <span class="text-slate-400">Atomic Git Sandbox Rollbacks</span>
                    <span class="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">ENABLED</span>
                  </div>
                  <div class="flex justify-between items-center p-2.5 bg-black/20 rounded-lg border border-white/5">
                    <span class="text-slate-400">AST Import Leak Auditor</span>
                    <span class="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">ACTIVE</span>
                  </div>
                </div>
              </div>

              <div class="github-card rounded-2xl p-5">
                <h2 class="text-sm font-bold uppercase tracking-wider mb-4 text-indigo-400">
                  🧬 Swarm Topology Details
                </h2>
                <div class="space-y-3.5 text-xs text-slate-400 leading-relaxed">
                  <p><strong>Parent Commander:</strong> Coordinates issue diagnostics, triggers file read tasks, and formats code diff proposals.</p>
                  <p><strong>Child Code Specialist:</strong> Proposes TypeScript file replacements matching compiler instructions.</p>
                  <p><strong>Diagnostics Grandchild:</strong> Queries files and reads local sandbox configs via read-only tools.</p>
                </div>
              </div>
            </div>

            <!-- Main Panel: Issues Feed -->
            <div class="lg:col-span-2 space-y-6">
              <div class="github-card rounded-2xl p-6">
                <h2 class="text-md font-bold mb-4 text-slate-200 flex items-center gap-2">
                  <span>🚨</span> Active Issue triaging cards
                </h2>
                <div id="runsContainer" class="space-y-6">
                  <div class="text-slate-500 text-sm text-center py-12">No active issue swarms. Click "Ingest GitHub Open Issues" above to fetch issues.</div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <div id="toast" class="fixed bottom-6 right-6 github-card rounded-xl px-5 py-4 shadow-2xl transition duration-300 transform translate-y-24 opacity-0 max-w-sm flex gap-3 z-50">
          <span id="toastIcon" class="text-lg"></span>
          <div>
            <p id="toastTitle" class="font-semibold text-sm text-slate-200"></p>
            <p id="toastMessage" class="text-xs text-slate-400 mt-0.5"></p>
          </div>
        </div>

        <script>
          const GATEWAY_URL = '${GATEWAY_URL}';
          const diffCache = {};

          function renderSwarmTree(node) {
            if (!node) return '';
            let childrenHtml = '';
            if (node.children && node.children.length > 0) {
              childrenHtml = '<div class="pl-4 mt-2 border-l border-white/5 space-y-2">';
              node.children.forEach(child => {
                childrenHtml += renderSwarmTree(child);
              });
              childrenHtml += '</div>';
            }

            let statusColor = 'text-blue-400';
            if (node.status === 'completed') statusColor = 'text-emerald-400';
            if (node.status === 'running' || node.status === 'active') statusColor = 'text-amber-400 animate-pulse';

            let html = '<div class="text-[11px] font-mono p-2 rounded bg-black/20 border border-white/[0.02]">';
            html += '<div class="flex justify-between items-center">';
            html += '<div>';
            html += '<span class="text-slate-400 font-bold">' + node.name + '</span>';
            html += ' <span class="text-[10px] text-slate-500">(' + node.role + ')</span>';
            html += '</div>';
            html += '<span class="' + statusColor + ' uppercase tracking-wider text-[9px] font-bold">' + (node.status || 'active') + '</span>';
            html += '</div>';
            if (node.model) {
              html += '<div class="text-[9px] text-slate-500 mt-0.5">Model: ' + node.model + '</div>';
            }
            if (node.tools) {
              html += '<div class="text-[9px] text-blue-400 mt-1 font-semibold">Tools: ' + node.tools.join(', ') + '</div>';
            }
            html += childrenHtml;
            html += '</div>';
            return html;
          }

          async function fetchRuns() {
            try {
              const res = await fetch(GATEWAY_URL + '/api/incident-agent/runs');
              if (!res.ok) return;
              const allRuns = await res.json();
              
              // Filter runs to only display GITHUB ISSUES
              const runs = allRuns.filter(r => r.errorLog.startsWith('[GITHUB ISSUE'));

              // Show/hide Approve All button based on suspended runs
              const hasSuspended = runs.some(r => r.status === 'suspended');
              const approveAllBtn = document.getElementById('approveAllBtn');
              if (approveAllBtn) {
                if (hasSuspended) {
                  approveAllBtn.classList.remove('hidden');
                } else {
                  approveAllBtn.classList.add('hidden');
                }
              }

              const container = document.getElementById('runsContainer');
              
              if (runs.length === 0) {
                container.innerHTML = '<div class="text-slate-500 text-sm text-center py-12">No active issue swarms. Click "Ingest GitHub Open Issues" above to fetch issues.</div>';
                return;
              }

              let html = '';
              for (const run of runs) {
                const stepDetails = run.context || {};
                const isSuspended = run.status === 'suspended';
                const isCompleted = run.status === 'completed';
                const isReTriaging = run.swarmStatus && run.swarmStatus.startsWith('RE-TRIAGING');
                
                html += '<div class="p-5 rounded-2xl bg-slate-900/50 border ' + (isSuspended ? 'border-amber-500/20 bg-amber-500/[0.01]' : 'border-white/5') + ' transition space-y-4">';
                
                // Status Header
                html += '<div class="flex justify-between items-center">';
                html += '<div class="flex items-center gap-2">';
                html += '<span class="text-xs bg-indigo-500/10 text-indigo-400 font-mono px-2 py-0.5 rounded">Issue #' + (run.errorLog.match(/#(\\d+)/)?.[1] || 'Unknown') + '</span>';
                html += '<span class="text-sm font-semibold text-slate-200">Self-Healing Code Swarm</span>';
                html += '</div>';
                
                let statusClass = '';
                if (isSuspended) statusClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                else if (isCompleted) statusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                else if (run.status === 'failed') statusClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
                else if (run.status === 'running' || isReTriaging) statusClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse';
                
                html += '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ' + statusClass + '">' + (run.swarmStatus || run.status) + '</span>';
                html += '</div>';

                // GitHub Issue Title & Description
                const titleMatch = run.errorLog.match(/Title: (.*?) \\|/);
                const titleStr = titleMatch ? titleMatch[1] : 'GitHub Issue';
                const bodyMatch = run.errorLog.split('| Body: ')[1] || 'No description provided.';

                html += '<div class="bg-black/20 rounded-xl p-4 text-xs border border-white/5 space-y-1.5">';
                html += '<div><span class="text-slate-500 font-bold uppercase">Title:</span> <span class="text-slate-200 font-semibold">' + titleStr + '</span></div>';
                html += '<div><span class="text-slate-500 font-bold uppercase">Body:</span> <span class="text-slate-400 leading-relaxed block mt-1">' + bodyMatch + '</span></div>';
                if (run.compressionRatio) {
                  html += '<div class="pt-1.5 border-t border-white/5 mt-1.5"><span class="text-slate-500">Diagnostics Compression:</span> <span class="text-purple-400 font-semibold">' + run.compressionRatio + '</span></div>';
                }
                html += '</div>';

                // Code Diff Rendering (Mind-blowing visual feedback)
                if (isSuspended || isCompleted || run.status === 'failed') {
                  html += '<div>';
                  html += '<span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Code Change Diff (src/index.ts)</span>';
                  const cachedDiff = (diffCache[run.runId] && diffCache[run.runId] !== 'fetching') ? diffCache[run.runId] : 'Loading visual diff...';
                  html += '<div id="diff_' + run.runId + '" class="space-y-1">' + cachedDiff + '</div>';
                  html += '</div>';
                }

                // Recursive Agent Tree
                if (run.swarmTree) {
                  html += '<div>';
                  html += '<span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recursive Code Swarm Tree</span>';
                  html += '<div class="space-y-2 p-3 bg-black/30 border border-white/5 rounded-xl">';
                  html += renderSwarmTree(run.swarmTree);
                  html += '</div>';
                  html += '</div>';
                }

                // Self-Correction & Compiler Output
                if (run.result) {
                  const logOutput = run.result.output || run.result.result?.output || JSON.stringify(run.result);
                  const isSuccess = run.result.success;
                  
                  html += '<div>';
                  html += '<span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Jest Test Suite & Compiler Logs</span>';
                  html += '<pre class="bg-black/30 rounded-xl p-4 text-xs font-mono border ' + (isSuccess ? 'border-emerald-500/20 text-emerald-400' : 'border-red-500/20 text-red-400') + ' overflow-x-auto whitespace-pre-wrap max-h-48">' + logOutput + '</pre>';
                  html += '</div>';
                }

                // Operator Action Gate
                if (isSuspended) {
                  html += '<div class="flex gap-3 justify-end pt-2 border-t border-white/5">';
                  html += '<button onclick="resumeWorkflow(\\\'' + run.runId + '\\\', false)" class="px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition">Reject Patch</button>';
                  html += '<button onclick="resumeWorkflow(\\\'' + run.runId + '\\\', true)" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/10 transition flex items-center gap-1">Approve & Deploy Fix</button>';
                  html += '</div>';
                }

                html += '</div>';
              }
              container.innerHTML = html;

              // Now fetch diffs once elements are guaranteed to be in the DOM
              for (const run of runs) {
                const isSuspended = run.status === 'suspended';
                const isCompleted = run.status === 'completed';
                if (isSuspended || isCompleted || run.status === 'failed') {
                  fetchDiff(run.runId);
                }
              }
            } catch(e) {
              console.error(e);
            }
          }

          async function fetchDiff(runId) {
            if (diffCache[runId] === 'fetching' || (diffCache[runId] && diffCache[runId] !== 'fetching')) return;
            diffCache[runId] = 'fetching';
            try {
              const res = await fetch('/api/runs/' + runId + '/diff');
              if (!res.ok) {
                delete diffCache[runId];
                return;
              }
              const data = await res.json();
              diffCache[runId] = data.diffHtml;
              const diffDiv = document.getElementById('diff_' + runId);
              if (diffDiv) {
                diffDiv.innerHTML = data.diffHtml;
              }
            } catch (e) {
              delete diffCache[runId];
            }
          }

          // Poll active runs
          setInterval(fetchRuns, 1500);
          fetchRuns();

          async function triggerGitHubStorm() {
            const btn = document.getElementById('githubStormBtn');
            btn.disabled = true;
            btn.innerHTML = '<span>🐙</span> Ingesting Issues...';
            try {
              const res = await fetch('/api/simulator/github-storm', { method: 'POST' });
              if (res.ok) {
                showToast('🐙 GitHub Connection Active', 'Pulling open issues and triggering local code swarms...', 'success');
              } else {
                showToast('❌ Ingestion Failed', 'Could not fetch issues.', 'error');
              }
            } catch (e) {
              showToast('❌ Network Error', 'Connection failed.', 'error');
            } finally {
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '<span>🐙</span> Ingest GitHub Open Issues';
              }, 10000);
            }
          }

          async function resumeWorkflow(runId, approved) {
            try {
              const res = await fetch(GATEWAY_URL + '/api/incident-agent/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId, approved })
              });
              if (res.ok) {
                showToast('🚀 Workflow Resumed', approved ? 'Executing patch & running test suites...' : 'Patch aborted and rolled back.', 'success');
              } else {
                const data = await res.json();
                showToast('❌ Resumption Failed', data.error, 'error');
              }
              fetchRuns();
            } catch (e) {
              showToast('❌ Connection Error', 'Failed to reach API gateway.', 'error');
            }
          }

          async function approveAllSwarms() {
            const btn = document.getElementById('approveAllBtn');
            btn.disabled = true;
            btn.innerHTML = '⚡ Deploying...';
            try {
              const res = await fetch(GATEWAY_URL + '/api/incident-agent/resume-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              if (res.ok) {
                showToast('⚡ Parallel Swarms Resumed', 'All patches applied concurrently in sandbox.', 'success');
                fetchRuns();
              } else {
                const data = await res.json();
                showToast('❌ Resumption Failed', data.error || 'Bulk resume failed.', 'error');
              }
            } catch (e) {
              showToast('❌ Network Error', 'Connection failed.', 'error');
            } finally {
              btn.disabled = false;
              btn.innerHTML = '⚡ Deploy Parallel Agents (Bulk PR Release)';
            }
          }

          async function resetDashboard() {
            try {
              const res = await fetch(GATEWAY_URL + '/api/incident-agent/reset', { method: 'POST' });
              if (res.ok) {
                loadedDiffs.clear();
                fetchRuns();
                showToast('🔄 State Cleared', 'Active runs state reset successfully.', 'success');
              }
            } catch (e) {}
          }

          function showToast(title, message, type) {
            const toast = document.getElementById('toast');
            const toastTitle = document.getElementById('toastTitle');
            const toastMessage = document.getElementById('toastMessage');
            const toastIcon = document.getElementById('toastIcon');
            
            toastTitle.innerText = title;
            toastMessage.innerText = message;
            
            if (type === 'success') {
              toastIcon.innerText = '🐙';
              toastIcon.className = 'text-indigo-400';
            } else {
              toastIcon.innerText = '⚠️';
              toastIcon.className = 'text-red-400';
            }
            
            toast.classList.remove('translate-y-24', 'opacity-0');
            setTimeout(() => {
              toast.classList.add('translate-y-24', 'opacity-0');
            }, 3000);
          }
        </script>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🐙 GithubParallelAgents Dashboard: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
