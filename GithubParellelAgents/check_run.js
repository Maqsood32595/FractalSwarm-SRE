// Use global fetch

async function checkRun() {
  try {
    const res = await fetch('http://localhost:3004/api/runs');
    if (!res.ok) {
      console.error('Failed to fetch runs from SRE Gateway');
      return;
    }
    const runs = await res.json();
    const run = runs.find(r => r.runId === 'dvjr8okagjw25u5vdspp8k' || r.errorLog?.includes('#142'));
    if (!run) {
      console.log('Run not found. Active runs:', runs.map(r => r.runId));
      return;
    }
    console.log('Run Status:', run.status);
    console.log('Run Result:', JSON.stringify(run.result, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkRun();
