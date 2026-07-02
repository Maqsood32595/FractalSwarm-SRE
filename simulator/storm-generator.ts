import { performance } from 'perf_hooks';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Seed data: Standard SRE playbooks
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

// Seed the Memory Vault database
async function seedDatabase() {
  console.log('\n[Simulator] Seeding local memory vault database...');
  for (const playbook of SEED_PLAYBOOKS) {
    const vector = getMockVector(playbook.errorLog);
    try {
      const res = await fetch(`${BASE_URL}/api/memory-vault/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: playbook.id,
          vector,
          text: playbook.text
        })
      });
      if (res.ok) {
        console.log(`  └─ Seeded playbook for: "${playbook.errorLog}"`);
      } else {
        const err = await res.json();
        console.error(`  └─ Failed to seed: ${err.error}`);
      }
    } catch (e: any) {
      console.error(`  └─ Connection failed during seeding: ${e.message}`);
    }
  }
}

// Generate the 1,000 alert storm
async function runStorm() {
  await seedDatabase();

  console.log('\n[Simulator] Preparing Alert Storm...');
  
  const totalAlerts = 1000;
  const duplicateAlertsCount = 995;
  const novelAlertsCount = 5;

  const payloads: string[] = [];

  // 1. Generate 995 duplicate known alerts
  for (let i = 0; i < duplicateAlertsCount; i++) {
    payloads.push('No space left on device');
  }

  // 2. Generate 5 novel unknown alerts (deadlocks, memory leaks)
  for (let i = 0; i < novelAlertsCount; i++) {
    payloads.push(`Critical transaction deadlock on thread ID ${Math.random()}`);
  }

  // Shuffle payloads
  payloads.sort(() => Math.random() - 0.5);

  console.log(`[Simulator] 🔥 Burst-firing ${totalAlerts} logs in under 100ms...`);

  let processedCount = 0;
  let localCacheHits = 0;
  let qdrantMisses = 0;
  let totalMatchingTimeUs = 0;

  const t0 = performance.now();

  // Burst fire all requests using Promise.all to load the Event Loop
  const requests = payloads.map(async (errorLog) => {
    try {
      // 1. Convert to vector locally
      const floatVector = getMockVector(errorLog);
      
      const queryStart = performance.now();
      
      // 2. Query the Memory Vault directly to profile POPCNT match speed
      const res = await fetch(`${BASE_URL}/api/memory-vault/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floatVector, topK: 1, queryText: errorLog })
      });

      const durationUs = (performance.now() - queryStart) * 1000.0;
      totalMatchingTimeUs += durationUs;

      if (!res.ok) {
        throw new Error('Query request failed');
      }

      const data = await res.json();
      processedCount++;
      
      if (data.source === 'QSAG_WASM_CACHE') {
        localCacheHits++;
      } else {
        qdrantMisses++;
      }
    } catch (e: any) {
      console.error(`Request failed: ${e.message}`);
    }
  });

  await Promise.all(requests);
  const totalDurationMs = performance.now() - t0;
  const averageLatencyUs = totalMatchingTimeUs / totalAlerts;

  console.log(`\n======================================================`);
  console.log(`📊 FractalSRE In-Memory Alert Storm Benchmark`);
  console.log(`======================================================`);
  console.log(`⚡ Ingestion Total Alerts   : ${processedCount}`);
  console.log(`⚡ Filtered Locally (QSAG)  : ${localCacheHits} (${(localCacheHits/processedCount * 100).toFixed(1)}%)`);
  console.log(`⚡ Routed to Cloud RAG      : ${qdrantMisses} (${(qdrantMisses/processedCount * 100).toFixed(1)}%)`);
  console.log(`⚡ Match Latency (Average)  : ${(averageLatencyUs / 1000).toFixed(4)}ms (${averageLatencyUs.toFixed(2)}μs)`);
  console.log(`⚡ Total Storm Burst Duration: ${totalDurationMs.toFixed(2)}ms`);
  console.log(`======================================================\n`);
}

runStorm().catch(err => console.error('Simulator crashed:', err));
