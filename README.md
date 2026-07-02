# FractalSwarm (AetherSRE V2)

An autonomous, human-in-the-loop SRE Control Plane designed to automate cloud incident triage, deduplication, and safe remediation. The platform combines a hierarchical agent swarm topology with WebAssembly-based log clustering and structured policy gating.

---

## Architecture Overview

FractalSwarm operates on a three-tier agent hierarchy connected to real-time cloud telemetry and local vector stores:

```
                      [ Raw GCP Cloud Logs ]
                                 │
                                 ▼
                     [ WASM Deduplication ]
                                 │ (Deduped Alert Clusters)
                                 ▼
                    [ Parent Incident Commander ]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      [ Child Diagnostics SRE ]      [ Child Diagnostics SRE ]
        (Database Specialist)          (Compute Specialist)
                 │                               │
                 ▼                               ▼
      [ Grandchild Log Parser ]      [ Grandchild Log Parser ]
       (Read-only log/metrics)        (Read-only log/metrics)
```

1. **Hierarchical Least-Privilege Swarm Tree:**
   * **Parent Incident Commander:** Coordinates global triage, collects child diagnoses, evaluates local playbook similarity, and drafts remediation commands.
   * **Child Diagnostics SRE:** Scoped strictly to specific domains (e.g., database, systems storage) to isolate context.
   * **Grandchild Parser Nodes:** Sandboxed, read-only agents equipped only with diagnostic tools (reading log lines, parsing system metrics) to eliminate write-access vulnerabilities.

2. **Zig-compiled WebAssembly POPCNT Filtering:**
   * Before logs are sent to LLMs, raw text payloads are processed locally. A Zig/WASM module maps log patterns into binary arrays and computes bitwise Hamming distance to group identical or structurally similar alerts in <0.3ms. This limits API token usage and prevents duplicate swarm instantiation.

3. **Human-in-the-Loop Playbook Editor & Memory Vault:**
   * Proposed remediation commands must be audited by safety rules and approved by a human operator. 
   * Operators can edit proposed commands directly on the control plane dashboard. Upon approval, the modified playbook is vectorized and saved to a local database (`database.bin`), updating the similarity search threshold for future matches.

---

## Directory Structure

```
├── server/
│   ├── features/
│   │   ├── incident-agent/  # Swarm workflow definitions (Mastra)
│   │   ├── log-ingest/      # HTTP alert ingestion bridge
│   │   ├── memory-vault/    # Zig/WASM DB & Qdrant query logic
│   │   └── safety-guard/    # Command audit and safety policy rules
│   └── index.ts             # Express gateway & HTML control plane dashboard
├── stream_gcp_logs.js       # Live GCP Cloud Logging bridge and classifier
├── package.json             # Dependencies and runtime scripts
└── README.md
```

---

## Setup & Ingesting Telemetry

### Prerequisites
* Node.js v18+
* Google Cloud CLI (`gcloud`) authenticated and configured on the target machine.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Maqsood32595/FractalSwarm-SRE.git
   cd FractalSwarm-SRE
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Platform
1. Start the control plane server and dashboard:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3002` in your browser.

2. Trigger telemetry ingestion:
   * **Option A:** Click **Ingest Real GCP Telemetry** directly on the dashboard.
   * **Option B:** Run the telemetry bridge manually:
     ```bash
     node stream_gcp_logs.js
     ```
