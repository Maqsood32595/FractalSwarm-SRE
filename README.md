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

---

## Production Hardening Roadmap

The current implementation is a functional prototype demonstrating the core agent architecture. The following items are identified for integration before enterprise deployment. None require architectural rewrites — each is an additive layer on the existing codebase.

### Security (OWASP API Security)
- **TLS 1.3:** Deploy behind Google Cloud Run or NGINX reverse proxy for automatic HTTPS termination. Currently runs plain HTTP on localhost.
- **Authentication:** Add Google Cloud Identity-Aware Proxy (IAP) in front of all API endpoints. Currently, any network-accessible caller can trigger or approve workflow runs.
- **Rate Limiting:** Add `express-rate-limit` middleware on the `/api/log-ingest/alert` and `/api/incident-agent/resume` endpoints to prevent abuse.

### 12-Factor App Compliance
- **Config as Environment Variables:** GCP project IDs in `stream_gcp_logs.js` are currently hardcoded. These move to `.env` / Cloud Run environment variables.
- **Stateless Process Store:** `activeSwarmRuns` is currently an in-memory Map that is lost on process restart. Replace with Redis or Firestore to persist workflow state across restarts and instances.
- **Structured Logging:** Replace `console.log` calls with a structured JSON logger (`pino`) so output is parseable by Cloud Logging and log aggregation systems.

### Responsible AI — Explainability
- **Reasoning Trace:** Each workflow run currently stores only the final proposed command. A `reasoning_trace` field will be added to capture: which memory vault entry matched and at what similarity score, whether the LLM or the local rule-based fallback generated the command, and the raw grandchild telemetry before compression. This trace will be surfaced in the Playbook Editor so operators can see *why* a command was proposed before approving it.

### LLM Observability (OpenTelemetry)
- **Tracing:** Instrument the Mastra workflow, each LLM agent call, and the WASM POPCNT engine with OpenTelemetry spans. Mastra has OpenTelemetry hooks built in — this is a configuration change.
- **Export Target:** Google Cloud Trace (no additional infrastructure required for GCP-hosted deployments).
- **Key metrics to track:** tokens consumed per incident resolution, P95 latency from alert ingestion to workflow suspension, WASM cache hit rate vs LLM fallback rate.

### Data Privacy & Compliance
- **PII Scrubbing:** GCP log entries can contain user emails, IP addresses, and service account identifiers. A scrubbing step will be added before log text is passed to any LLM call, replacing identifiers with typed tokens (`[EMAIL_REDACTED]`, `[IP_REDACTED]`).
- **Data Residency:** For regulated environments, LLM calls will route through Vertex AI (which supports regional data residency) rather than direct AI Studio endpoints.
- **Playbook TTL:** The `database.bin` vector store currently retains entries indefinitely. A configurable TTL field and a scheduled cleanup job will enforce data retention policies (default: 90 days).

### Blast Radius Sandboxing
- **Live Read-Only Mode:** The existing `Execute Mitigations` feature flag disables command execution globally. A more granular `SANDBOX_MODE` flag will be added that allows the agent swarm to continue diagnosing and the human operator to review proposed playbooks — but routes all execution to a dry-run logger instead of the terminal executor. This allows the session to remain active without any write risk.
