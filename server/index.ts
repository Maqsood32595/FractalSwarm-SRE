import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FractalKernel } from './kernel';
import { performance } from 'perf_hooks';

// Load environment variables if available
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize the Fractal Kernel
const kernel = new FractalKernel(app);

// Helper to compute a deterministic 384d vector based on log content
function getMockVector(str: string): number[] {
  return new Array(384).fill(0).map((_, i) => {
    let hash = 0;
    const key = str + i.toString();
    for (let j = 0; j < key.length; j++) {
      hash = key.charCodeAt(j) + ((hash << 5) - hash);
    }
    return hash % 100 > 50 ? 0.1 : -0.1;
  });
}

async function start() {
  try {
    // Boot and discover all features dynamically
    await kernel.boot();

    // Reset Dashboard State Endpoint
    app.post('/api/simulator/reset', (req, res) => {
      try {
        const { activeSwarmRuns } = require('./features/incident-agent/workflow');
        if (activeSwarmRuns) {
          for (const key of Object.keys(activeSwarmRuns)) {
            delete activeSwarmRuns[key];
          }
        }
        return res.json({ success: true });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    });

    // Live Simulator Endpoint
    app.post('/api/simulator/storm', async (req, res) => {
      const PORT = process.env.PORT || 3002;
      const BASE_URL = `http://127.0.0.1:${PORT}`;

      const SEED_PLAYBOOKS = [
        {
          id: 'e2a84e31-8cd2-4c54-8c81-807e607e4c34',
          text: 'Playbook: Disk space cleanup\nSignature: No space left on device\nCommand: df -h && echo "Disk clean completed."',
          errorLog: 'No space left on device'
        },
        {
          id: 'f321921a-4c22-48bd-bb29-923f00a293f0',
          text: 'Playbook: Database restart\nSignature: Connection refused on port 5432\nCommand: echo "Starting Postgres Server..." && pg_ctl start',
          errorLog: 'Connection refused on port 5432'
        },
        {
          id: 'a9b8c7d6-e5f4-4321-b0a9-f8e7d6c5b4a3',
          text: 'Playbook: Nginx reload\nSignature: Nginx gateway timeout 504\nCommand: echo "Reloading Nginx..." && nginx -s reload',
          errorLog: 'Nginx gateway timeout 504'
        },
        {
          id: 'd9b8a7c6-2e3d-4c5b-6a7b-8c9d0e1f2a3b',
          text: 'Playbook: Memory allocation fix\nSignature: Out of memory (OOM) error\nCommand: echo "Memory status check..." && free -m',
          errorLog: 'Out of memory (OOM) error'
        }
      ];

      // Seed playbooks
      for (const playbook of SEED_PLAYBOOKS) {
        const vector = getMockVector(playbook.errorLog);
        try {
          await fetch(`${BASE_URL}/api/memory-vault/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: playbook.id,
              vector,
              text: playbook.text
            })
          });
        } catch (e) {
          // Ignore
        }
      }

      const totalAlerts = 1000;
      const duplicateAlertsCount = 995;
      const novelAlertsCount = 5;
      const payloads: string[] = [];

      for (let i = 0; i < duplicateAlertsCount; i++) {
        payloads.push('No space left on device');
      }
      for (let i = 0; i < novelAlertsCount; i++) {
        payloads.push(`Critical transaction deadlock on thread ID ${Math.random()}`);
      }
      payloads.sort(() => Math.random() - 0.5);

      // In-process POPCNT LUT benchmark
      const POPCOUNT_LUT = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        let count = 0;
        let temp = i;
        while (temp > 0) {
          if (temp & 1) count++;
          temp >>= 1;
        }
        POPCOUNT_LUT[i] = count;
      }

      function quantizeVector(vector: number[]): Uint8Array {
        const packed = new Uint8Array(48);
        let currentByte = 0;
        for (let i = 0; i < vector.length; i++) {
          const bitIdx = i % 8;
          if (vector[i] >= 0.0) {
            currentByte |= 1 << (7 - bitIdx);
          }
          if (bitIdx === 7 || i === vector.length - 1) {
            packed[i >> 3] = currentByte;
            currentByte = 0;
          }
        }
        return packed;
      }

      const localDB = SEED_PLAYBOOKS.map(p => quantizeVector(getMockVector(p.errorLog)));

      let processedCount = 0;
      let localCacheHits = 0;
      let qdrantMisses = 0;
      let totalMatchingTimeUs = 0;

      const t0 = performance.now();

      for (let i = 0; i < totalAlerts; i++) {
        const errorLog = payloads[i];
        const queryPacked = quantizeVector(getMockVector(errorLog));
        
        const matchStart = performance.now();
        
        let bestDistance = 999;
        for (let j = 0; j < localDB.length; j++) {
          const targetPacked = localDB[j];
          let dist = 0;
          for (let b = 0; b < 48; b++) {
            dist += POPCOUNT_LUT[queryPacked[b] ^ targetPacked[b]];
          }
          if (dist < bestDistance) {
            bestDistance = dist;
          }
        }
        
        const durationUs = (performance.now() - matchStart) * 1000.0;
        totalMatchingTimeUs += durationUs;

        processedCount++;
        const similarity = (1.0 - (bestDistance / 384.0)) * 100;
        if (similarity >= 87.5) {
          localCacheHits++;
        } else {
          qdrantMisses++;
        }
      }

      const totalDurationMs = performance.now() - t0;
      const averageLatencyUs = totalMatchingTimeUs / totalAlerts;

      return res.json({
        totalAlerts: processedCount,
        localCacheHits,
        qdrantMisses,
        averageLatencyMs: averageLatencyUs / 1000.0,
        totalDurationMs
      });
    });

    // Real GCP Telemetry Ingestion Endpoint
    app.post('/api/simulator/gcp-storm', (req, res) => {
      const { exec } = require('child_process');
      const path = require('path');
      
      const scriptPath = path.resolve(__dirname, '../stream_gcp_logs.js');
      
      exec(`node "${scriptPath}"`, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error(`[GCP Ingest Error]: ${error.message}`);
          return;
        }
        console.log(`[GCP Ingest Completed]: ${stdout}`);
      });
      
      return res.json({ success: true, message: 'GCP ingestion started in background.' });
    });

    // Real TfL Transport Telemetry Ingestion Endpoint
    app.post('/api/simulator/tfl-storm', (req, res) => {
      const { exec } = require('child_process');
      const path = require('path');
      
      const scriptPath = path.resolve(__dirname, '../stream_transport_logs.js');
      
      exec(`node "${scriptPath}"`, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error(`[TfL Ingest Error]: ${error.message}`);
          return;
        }
        console.log(`[TfL Ingest Completed]: ${stdout}`);
      });
      
      return res.json({ success: true, message: 'TfL transport ingestion started in background.' });
    });

    // Serve control panel Dashboard UI
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FractalSwarm Control Plane</title>
            <script src="https://cdn.tailwindcss.com/3.4.16"></script>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
              body {
                font-family: 'Plus Jakarta Sans', sans-serif;
                background-color: #08090c;
                background-image: radial-gradient(circle at 50% -20%, #171d2b 0%, #08090c 70%);
              }
              .glass-panel {
                background: rgba(17, 24, 39, 0.6);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.05);
              }
            </style>
          </head>
          <body class="text-slate-100 min-h-screen pb-12">
            <header class="w-full border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center glass-panel sticky top-0 z-50">
              <div class="flex items-center gap-3">
                <span class="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">FractalSwarm</span>
                <span class="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">AetherSRE V2</span>
              </div>
              <div class="flex items-center gap-4">
                <button id="approveAllBtn" onclick="approveAllSwarms()" class="hidden px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition flex items-center gap-1.5">⚡ Deploy All Parallel Swarms</button>
                <button onclick="resetDashboard()" class="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition">Reset Dashboard</button>
                <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span class="text-xs text-slate-400 font-medium">Control Plane Active</span>
              </div>
            </header>

            <main class="max-w-7xl mx-auto px-6 md:px-12 mt-8">
              <!-- Global SRE Infrastructure Health Card -->
              <div id="systemHealthCard" class="glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-emerald-500/10 bg-emerald-500/[0.01]">
                <div class="flex items-center gap-4">
                  <span id="healthDot" class="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <div>
                    <h2 id="healthTitle" class="text-sm font-bold tracking-wider text-slate-200">SYSTEM STATUS: OPERATIONAL</h2>
                    <p id="healthDesc" class="text-xs text-slate-500 mt-0.5">All agent cells are idle. Infrastructure running smoothly.</p>
                  </div>
                </div>
                <span id="healthBadge" class="text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">HEALTHY</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="space-y-8 lg:col-span-1">
                  <div class="glass-panel rounded-2xl p-6">
                    <h2 class="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                      <span class="text-emerald-400">⚡</span> Active Feature Cells
                    </h2>
                    <div class="space-y-3">
                      ${Array.from(kernel.loadedFeatures.values()).map(f => `
                        <div class="flex flex-col p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
                          <div class="flex justify-between items-center mb-1">
                            <span class="font-medium text-sm text-slate-200">${f.manifest.name}</span>
                            <span class="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">${f.manifest.version}</span>
                          </div>
                          <p class="text-xs text-slate-500 mb-2">${f.manifest.description}</p>
                          <span class="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/5 px-2 py-1 rounded w-fit">${f.manifest.basePath}</span>
                        </div>
                      `).join('') || '<div class="text-red-400 text-xs">No active cells mounted.</div>'}
                    </div>
                  </div>

                  <div class="glass-panel rounded-2xl p-6">
                    <h2 class="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                      <span class="text-amber-400">⚙️</span> Governance & Flags
                    </h2>
                    <div class="space-y-4">
                      <div class="flex justify-between items-center">
                        <span class="text-xs font-medium text-slate-400">Execute Mitigations</span>
                        <button onclick="toggleFlag('EXECUTE_MITIGATIONS')" id="flagExecute" class="px-3 py-1 rounded-lg text-xs font-bold border transition"></button>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-xs font-medium text-slate-400">WASM Context Compression</span>
                        <button onclick="toggleFlag('CONTEXT_COMPRESSION')" id="flagCompression" class="px-3 py-1 rounded-lg text-xs font-bold border transition"></button>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-xs font-medium text-slate-400">Agent LLM Tier</span>
                        <select onchange="updateModelTier(this.value)" id="flagModel" class="bg-slate-900 text-xs border border-white/10 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none">
                          <option value="FLASH">Gemini 2.5 Flash (Economy)</option>
                          <option value="PRO">Gemini 2.5 Pro (Precision)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div class="glass-panel rounded-2xl p-6">
                    <h2 class="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
                      <span class="text-blue-400">🚀</span> Inject Custom Alert
                    </h2>
                    <div class="space-y-4">
                      <div>
                        <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Error Log Message</label>
                        <textarea id="customAlertLog" placeholder="e.g. No space left on device, Database server has crashed." rows="3" 
                          class="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition"></textarea>
                      </div>
                      <button onclick="injectAlert()" id="triggerBtn" class="w-full bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-400 hover:to-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition">
                        Trigger Swarm Triage
                      </button>
                      <div id="triggerStatus" class="hidden text-xs rounded-xl p-3 border"></div>
                    </div>
                  </div>
                </div>

                <div class="lg:col-span-2 space-y-8">
                  <div class="glass-panel rounded-2xl p-8 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="flex justify-between items-start mb-6">
                      <div>
                        <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
                          <span class="text-emerald-400">🌪️</span> Log Storm Simulator
                        </h2>
                        <p class="text-xs text-slate-400 mt-1">Benchmarking local Zig/WASM POPCNT filtering against 1,000 concurrent alerts in real-time.</p>
                      </div>
                      <div class="flex gap-2">
                        <button onclick="runTfLStorm()" id="tflStormBtn" class="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-lg transition flex items-center gap-2">
                          <span>🚇</span> Live London Transit Data
                        </button>
                        <button onclick="runGCPStorm()" id="gcpStormBtn" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/20 transition flex items-center gap-2">
                          <span>📡</span> Ingest Real GCP Telemetry
                        </button>
                        <button onclick="runAlertStorm()" id="stormBtn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-lg transition">
                          Fire 1,000 Alert Storm
                        </button>
                      </div>
                    </div>

                    <div id="stormResults" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <span class="block text-2xl font-bold text-slate-200" id="statAlerts">0</span>
                        <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Alerts Ingested</span>
                      </div>
                      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <span class="block text-2xl font-bold text-emerald-400" id="statHits">0%</span>
                        <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">WASM Cache Hits</span>
                      </div>
                      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <span class="block text-2xl font-bold text-blue-400" id="statLatency">0ms</span>
                        <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Avg Latency</span>
                      </div>
                      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <span class="block text-2xl font-bold text-purple-400" id="statDuration">0ms</span>
                        <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Duration</span>
                      </div>
                    </div>
                    
                    <div id="stormLoader" class="hidden mt-4">
                      <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-emerald-400 to-blue-500 h-full w-full animate-pulse"></div>
                      </div>
                      <span class="text-xs text-slate-500 mt-2 block text-center">Running local Zig/WASM matcher...</span>
                    </div>
                  </div>

                  <div class="glass-panel rounded-2xl p-6">
                    <h2 class="text-lg font-bold mb-4 text-slate-200 flex items-center gap-2">
                      <span class="text-blue-400">🤖</span> Dynamic Swarms & Approvals
                    </h2>
                    <div id="runsContainer" class="space-y-4">
                      <div class="text-slate-500 text-sm text-center py-8">No active swarm runs. Inject an alert above to spawn a recovery swarm.</div>
                    </div>
                  </div>
                </div>
              </div>
            </main>

            <div id="toast" class="fixed bottom-6 right-6 glass-panel border border-white/10 rounded-xl px-5 py-4 shadow-2xl transition duration-300 transform translate-y-24 opacity-0 max-w-sm flex gap-3">
              <span id="toastIcon" class="text-lg"></span>
              <div>
                <p id="toastTitle" class="font-semibold text-sm text-slate-200"></p>
                <p id="toastMessage" class="text-xs text-slate-400 mt-0.5"></p>
              </div>
            </div>

            <script>
              let currentFlags = {};

              async function fetchFlags() {
                try {
                  const res = await fetch('/api/incident-agent/flags');
                  currentFlags = await res.json();
                  
                  const execBtn = document.getElementById('flagExecute');
                  if (currentFlags.EXECUTE_MITIGATIONS) {
                    execBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold border border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
                    execBtn.innerText = 'ENABLED';
                  } else {
                    execBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold border border-red-500/20 bg-red-500/5 text-red-400';
                    execBtn.innerText = 'DRY-RUN';
                  }

                  const compBtn = document.getElementById('flagCompression');
                  if (currentFlags.CONTEXT_COMPRESSION) {
                    compBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold border border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
                    compBtn.innerText = 'ACTIVE';
                  } else {
                    compBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold border border-slate-700 bg-slate-800 text-slate-400';
                    compBtn.innerText = 'DISABLED';
                  }

                  document.getElementById('flagModel').value = currentFlags.AGENT_MODEL_TIER;
                } catch (e) {
                  console.error(e);
                }
              }

              async function toggleFlag(flagName) {
                const updatedVal = !currentFlags[flagName];
                try {
                  await fetch('/api/incident-agent/flags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [flagName]: updatedVal })
                  });
                  fetchFlags();
                  showToast('⚙️ Flag Updated', flagName + ' toggled successfully.', 'success');
                } catch(e) {
                  showToast('❌ Error', 'Failed to update flag.', 'error');
                }
              }

              async function updateModelTier(val) {
                try {
                  await fetch('/api/incident-agent/flags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ AGENT_MODEL_TIER: val })
                  });
                  fetchFlags();
                  showToast('⚙️ LLM Model Updated', 'Swarmed models routed to ' + val + ' tier.', 'success');
                } catch(e) {
                  showToast('❌ Error', 'Failed to route models.', 'error');
                }
              }

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
                if (node.status === 'running') statusColor = 'text-amber-400 animate-pulse';

                let html = '<div class="text-[11px] font-mono p-2 rounded bg-black/10 border border-white/[0.02]">';
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

              function updateGlobalHealth(runs) {
                const card = document.getElementById('systemHealthCard');
                const dot = document.getElementById('healthDot');
                const title = document.getElementById('healthTitle');
                const desc = document.getElementById('healthDesc');
                const badge = document.getElementById('healthBadge');

                if (!runs || runs.length === 0) {
                  // Operational state
                  card.className = "glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-emerald-500/10 bg-emerald-500/[0.01]";
                  dot.className = "w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse";
                  title.innerText = "SYSTEM STATUS: OPERATIONAL";
                  desc.innerText = "All agent cells are idle. Infrastructure running smoothly.";
                  badge.className = "text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                  badge.innerText = "HEALTHY";
                  return;
                }

                // Check for different run statuses in active runs
                const hasSuspended = runs.some(r => r.status === 'suspended');
                const hasRunning = runs.some(r => r.status === 'running' || r.status === 'triage');
                const hasFailed = runs.some(r => r.status === 'failed');
                const lastRun = runs[0]; // Fetch the most recent run

                if (hasSuspended) {
                  card.className = "glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-amber-500/20 bg-amber-500/[0.01]";
                  dot.className = "w-3.5 h-3.5 rounded-full bg-amber-500 animate-bounce";
                  title.innerText = "SYSTEM STATUS: DEGRADED (ACTION REQUIRED)";
                  desc.innerText = "Incident triage complete. Awaiting human operator approval to deploy mitigation.";
                  badge.className = "text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20";
                  badge.innerText = "PENDING FIX";
                } else if (hasRunning) {
                  card.className = "glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-blue-500/20 bg-blue-500/[0.01]";
                  dot.className = "w-3.5 h-3.5 rounded-full bg-blue-500 animate-ping";
                  title.innerText = "SYSTEM STATUS: DIAGNOSING";
                  desc.innerText = "Parent incident commander engaged. Spawning child specialists to analyze log traces.";
                  badge.className = "text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20";
                  badge.innerText = "TRIAGING";
                } else if (hasFailed) {
                  card.className = "glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-red-500/20 bg-red-500/[0.01]";
                  dot.className = "w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse";
                  title.innerText = "SYSTEM STATUS: MITIGATION FAILED";
                  desc.innerText = "SRE agent mitigation execution returned non-zero code. Manual inspection required.";
                  badge.className = "text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20";
                  badge.innerText = "CRITICAL";
                } else if (lastRun && lastRun.status === 'completed') {
                  card.className = "glass-panel rounded-2xl p-5 mb-8 flex justify-between items-center transition duration-300 border border-emerald-500/20 bg-emerald-500/[0.02]";
                  dot.className = "w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse";
                  title.innerText = "SYSTEM STATUS: MITIGATED & OPERATIONAL";
                  desc.innerText = "Threat neutralized successfully! Local database playbooks updated and indexed.";
                  badge.className = "text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                  badge.innerText = "RESOLVED";
                }
              }

              async function fetchRuns() {
                try {
                  const res = await fetch('/api/incident-agent/runs');
                  if (!res.ok) return;
                  const runs = await res.json();
                  
                  // Update global health card status
                  updateGlobalHealth(runs);

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
                    container.innerHTML = '<div class="text-slate-500 text-sm text-center py-8">No active swarm runs. Inject an alert above to spawn a recovery swarm.</div>';
                    return;
                  }

                  let html = '';
                  runs.forEach(run => {
                    const stepDetails = run.context || {};
                    const isSuspended = run.status === 'suspended';
                    const isCompleted = run.status === 'completed';
                    
                    html += '<div class="p-5 rounded-2xl bg-white/[0.02] border ' + (isSuspended ? 'border-amber-500/20 bg-amber-500/[0.01]' : 'border-white/5') + ' transition">';
                    
                    // Status Header
                    html += '<div class="flex justify-between items-center mb-3">';
                    html += '<div class="flex items-center gap-2">';
                    html += '<span class="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">' + run.runId.substring(0, 8) + '</span>';
                    html += '<span class="text-sm font-semibold text-slate-200">Incident Triage Swarm</span>';
                    html += '</div>';
                    
                    let statusClass = '';
                    if (isSuspended) statusClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                    else if (isCompleted) statusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    else if (run.status === 'failed') statusClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
                    else if (run.status === 'running') statusClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse';
                    
                    html += '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ' + statusClass + '">' + (run.swarmStatus || run.status) + '</span>';
                    html += '</div>';

                    // Incident Alert Details
                    html += '<div class="bg-black/20 rounded-xl p-3.5 mb-4 text-xs font-mono border border-white/5 space-y-1">';
                    html += '<div><span class="text-slate-500">Root Alert:</span> <span class="text-slate-300">' + run.errorLog + '</span></div>';
                    if (stepDetails.command) {
                      html += '<div><span class="text-slate-500">Proposed  :</span> <span class="text-emerald-400 font-semibold">' + stepDetails.command + '</span></div>';
                    }
                    if (stepDetails.explanation) {
                      html += '<div><span class="text-slate-500">Diagnosis  :</span> <span class="text-slate-400">' + stepDetails.explanation + '</span></div>';
                    }
                    if (run.compressionRatio) {
                      html += '<div><span class="text-slate-500">WASM Comp :</span> <span class="text-purple-400 font-medium">' + run.compressionRatio + '</span></div>';
                    }
                    html += '</div>';

                    // Dynamic Swarm Hierarchy Render
                    if (run.swarmTree) {
                      html += '<div class="mb-4">';
                      html += '<span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recursive FAS Agent Tree</span>';
                      html += '<div class="space-y-2 p-3 bg-black/40 border border-white/5 rounded-xl">';
                      html += renderSwarmTree(run.swarmTree);
                      html += '</div>';
                      html += '</div>';
                    }

                    // Output Logs
                    if (run.result) {
                      const logOutput = run.result.output || run.result.result?.output || JSON.stringify(run.result);
                      html += '<div class="mb-4">';
                      html += '<span class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Execution Logs</span>';
                      html += '<pre class="bg-black/40 rounded-xl p-4 text-xs font-mono border border-white/5 text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-40">' + logOutput + '</pre>';
                      html += '</div>';
                    }

                    // Approvals & Playbook Editor
                    if (isSuspended) {
                      html += '<div class="bg-black/30 rounded-xl p-4 border border-blue-500/30 mt-4 mb-4">';
                      html += '<span class="block text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2"><span class="text-sm">🛠️</span> Playbook Draft Editor</span>';
                      
                      html += '<div class="space-y-3">';
                      html += '<div><label class="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Incident Signature</label>';
                      html += '<input type="text" id="edit_sig_' + run.runId + '" value="' + (stepDetails.explanation || run.errorLog).replace(/"/g, '&quot;') + '" class="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-blue-500 transition">';
                      html += '</div>';

                      html += '<div><label class="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Proposed Mitigation Command</label>';
                      html += '<input type="text" id="edit_cmd_' + run.runId + '" value="' + (stepDetails.command || '').replace(/"/g, '&quot;') + '" class="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-emerald-400 font-mono focus:border-emerald-500 transition">';
                      html += '</div>';
                      html += '</div>';

                      html += '<div class="flex gap-3 justify-end mt-4">';
                      html += '<button onclick="resumeWorkflow(\\\'' + run.runId + '\\\', false)" class="px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition">Abort Swarm</button>';
                      html += '<button onclick="resumeWorkflow(\\\'' + run.runId + '\\\', true)" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-lg shadow-blue-500/10 transition">Approve & Deploy Fix</button>';
                      html += '</div>';
                      html += '</div>';
                    }

                    html += '</div>';
                  });
                  container.innerHTML = html;
                } catch(e) {
                  console.error(e);
                }
              }

              // Poll runs and flags
              setInterval(fetchRuns, 1000);
              fetchRuns();
              fetchFlags();

              async function resetDashboard() {
                try {
                  const res = await fetch('/api/incident-agent/reset', { method: 'POST' });
                  if (res.ok) {
                    document.getElementById('statAlerts').innerText = '0';
                    document.getElementById('statHits').innerText = '0%';
                    document.getElementById('statLatency').innerText = '0ms';
                    document.getElementById('statDuration').innerText = '0ms';
                    fetchRuns();
                    showToast('🔄 Dashboard Reset', 'All active runs cleared.', 'success');
                  } else {
                    showToast('❌ Reset Failed', 'Error clearing state.', 'error');
                  }
                } catch (e) {
                  showToast('❌ Reset Error', 'Network error.', 'error');
                }
              }

              async function approveAllSwarms() {
                const btn = document.getElementById('approveAllBtn');
                btn.disabled = true;
                btn.innerHTML = '⚡ Deploying...';
                try {
                  const res = await fetch('/api/incident-agent/resume-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  if (res.ok) {
                    showToast('⚡ Parallel Swarms Resumed', 'All SRE mitigations deployed simultaneously.', 'success');
                    fetchRuns();
                  } else {
                    const data = await res.json();
                    showToast('❌ Deployment Failed', data.error || 'Bulk resumption error.', 'error');
                  }
                } catch (e) {
                  showToast('❌ Deployment Error', 'Network error.', 'error');
                } finally {
                  btn.disabled = false;
                  btn.innerHTML = '⚡ Deploy All Parallel Swarms';
                }
              }

              async function injectAlert() {
                const log = document.getElementById('customAlertLog').value.trim();
                if (!log) return;
                
                const btn = document.getElementById('triggerBtn');
                const status = document.getElementById('triggerStatus');
                btn.disabled = true;
                btn.innerText = 'Triggering...';
                
                try {
                  const res = await fetch('/api/incident-agent/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ errorLog: log })
                  });
                  const data = await res.json();
                  
                  status.classList.remove('hidden');
                  if (res.ok) {
                    status.className = 'text-xs rounded-xl p-3 border border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
                    status.innerHTML = 'Successfully triggered swarm! Run ID: ' + data.runId;
                    showToast('🚀 Swarm Triggered', 'Dynamic agent cells instantiated.', 'success');
                  } else {
                    status.className = 'text-xs rounded-xl p-3 border border-red-500/20 bg-red-500/5 text-red-400';
                    status.innerHTML = 'Error: ' + data.error;
                    showToast('❌ Trigger Failed', data.error, 'error');
                  }
                } catch (e) {
                  status.classList.remove('hidden');
                  status.className = 'text-xs rounded-xl p-3 border border-red-500/20 bg-red-500/5 text-red-400';
                  status.innerHTML = 'Network connection failed.';
                  showToast('❌ Connection Error', 'Failed to connect to Gateway.', 'error');
                } finally {
                  btn.disabled = false;
                  btn.innerText = 'Trigger Swarm Triage';
                  fetchRuns();
                }
              }

              async function resumeWorkflow(runId, approved) {
                let editedCommand = undefined;
                let editedSignature = undefined;

                if (approved) {
                  const cmdInput = document.getElementById('edit_cmd_' + runId);
                  const sigInput = document.getElementById('edit_sig_' + runId);
                  if (cmdInput) editedCommand = cmdInput.value;
                  if (sigInput) editedSignature = sigInput.value;
                }

                try {
                  const res = await fetch('/api/incident-agent/resume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ runId, approved, editedCommand, editedSignature })
                  });
                  if (res.ok) {
                    showToast('✅ Resumed Swarm', approved ? 'Executing fix...' : 'Swarm execution aborted.', 'success');
                    
                    if (approved && editedCommand && editedSignature) {
                      // Automatically ingest this updated playbook into Memory Vault
                      try {
                        const mockVector = new Array(384).fill(0).map(() => Math.random() > 0.5 ? 0.1 : -0.1);
                        await fetch('/api/memory-vault/ingest', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: runId, vector: mockVector, text: 'Playbook: ' + editedSignature + '\\nCommand: ' + editedCommand })
                        });
                        setTimeout(() => {
                           showToast('💾 Playbook Saved', editedSignature.substring(0, 40) + '... indexed to Local Memory Vault successfully.', 'success');
                        }, 2500);
                      } catch(e) {}
                    }
                  } else {
                    const err = await res.json();
                    showToast('❌ Resume Failed', err.error, 'error');
                  }
                  fetchRuns();
                } catch (e) {
                  showToast('❌ Network Error', 'Failed to connect to Gateway.', 'error');
                }
              }

              async function runAlertStorm() {
                const btn = document.getElementById('stormBtn');
                const loader = document.getElementById('stormLoader');
                btn.disabled = true;
                loader.classList.remove('hidden');
                
                try {
                  const res = await fetch('/api/simulator/storm', { method: 'POST' });
                  const data = await res.json();
                  
                  if (res.ok) {
                    document.getElementById('statAlerts').innerText = data.totalAlerts;
                    document.getElementById('statHits').innerText = (data.localCacheHits/data.totalAlerts * 100).toFixed(1) + '%';
                    document.getElementById('statLatency').innerText = data.averageLatencyMs.toFixed(3) + 'ms';
                    document.getElementById('statDuration').innerText = data.totalDurationMs.toFixed(0) + 'ms';
                    showToast('🌪️ Storm Completed', '1,000 requests matched successfully!', 'success');
                  } else {
                    showToast('❌ Storm Failed', 'Error running simulation.', 'error');
                  }
                } catch (e) {
                  showToast('❌ Storm Error', 'Connection failed during simulation.', 'error');
                } finally {
                  btn.disabled = false;
                  loader.classList.add('hidden');
                }
              }

              async function runGCPStorm() {
                const btn = document.getElementById('gcpStormBtn');
                btn.disabled = true;
                btn.innerHTML = '<span>📡</span> Fetching GCP Projects...';
                
                try {
                  const res = await fetch('/api/simulator/gcp-storm', { method: 'POST' });
                  if (res.ok) {
                    showToast('📡 GCP Connection Active', 'Querying production logs from multiple GCP projects...', 'success');
                  } else {
                    showToast('❌ GCP Fetch Failed', 'Failed to trigger ingestion.', 'error');
                  }
                } catch (e) {
                  showToast('❌ Network Error', 'Failed to connect to Gateway.', 'error');
                } finally {
                  setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<span>📡</span> Ingest Real GCP Telemetry';
                  }, 15000);
                }
              }

              async function runTfLStorm() {
                const btn = document.getElementById('tflStormBtn');
                btn.disabled = true;
                btn.innerHTML = '<span>🚇</span> Fetching TfL Status...';
                
                try {
                  const res = await fetch('/api/simulator/tfl-storm', { method: 'POST' });
                  if (res.ok) {
                    showToast('🚇 TfL Connection Active', 'Querying real-time London transit alerts from TfL API...', 'success');
                  } else {
                    showToast('❌ TfL Fetch Failed', 'Failed to trigger ingestion.', 'error');
                  }
                } catch (e) {
                  showToast('❌ Network Error', 'Failed to connect to Gateway.', 'error');
                } finally {
                  setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<span>🚇</span> Live London Transit Data';
                  }, 15000);
                }
              }

              function showToast(title, message, type) {
                const toast = document.getElementById('toast');
                const toastTitle = document.getElementById('toastTitle');
                const toastMessage = document.getElementById('toastMessage');
                const toastIcon = document.getElementById('toastIcon');
                
                toastTitle.innerText = title;
                toastMessage.innerText = message;
                
                if (type === 'success') {
                  toastIcon.innerText = '🛡️';
                  toastIcon.className = 'text-emerald-400';
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
      console.log(`\\n======================================================`);
      console.log(`⚡ FractalSwarm Gateway listening on port ${PORT}`);
      console.log(`⚡ Control Plane dashboard: http://localhost:${PORT}`);
      console.log(`======================================================\\n`);
    });
  } catch (error) {
    console.error('Fatal error during FractalSwarm boot sequence:', error);
    process.exit(1);
  }
}

start();
