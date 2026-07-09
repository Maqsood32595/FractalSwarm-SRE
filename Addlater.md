# FractalSwarm (AetherSRE V2) — Future Product Requirements Document (PRD)
### Architectural Roadmap for Production-Grade Operational Self-Healing

This document compiles the advanced SRE systems engineering specifications discussed for future implementation. These features are designed to transition FractalSwarm from a prototype into an enterprise-safe, federated, and self-auditing control plane.

---

## 1. Playbook Taxonomy & Scoped Search
To prevent search collisions and latency degradation as the playbook library scales to thousands of entries, we must move from a flat Memory Vault structure to a hierarchical taxonomy.

### Specification:
* **The Levels:**
  1. **Infrastructure-Level:** OS metrics, disk capacity, network interfaces. (Low churn, high stability, long TTL).
  2. **Service-Level:** APIs, database locks, cache evictions, Nginx configs. (Medium churn).
  3. **Application-Level:** Logic bugs, third-party exceptions, specific transaction errors. (High churn, high environment context dependency).
* **Top-Down Search:**
  * The Grandchild parser categorizes the incoming telemetry target resource layer during initial logs extraction.
  * The Parent Commander restricts the Zig-WASM POPCNT matcher to scan only the matching folder index, bypassing unrelated levels completely and keeping match times under 0.1ms.

---

## 2. PR-Style Playbook Governance & Peer-Review
To prevent a single operator's quick-and-dirty fix from polluting the global automation database, we must implement an approval and validation gate for playbooks before they are promoted to Autopilot.

### Specification:
* **Workflow States:**
  * `PROPOSED_DRAFT`: Initial state when an operator corrects/executes a new command on the dashboard.
  * `VERIFIED_GLOBAL`: Promoted state after peer review. Only global playbooks can run in auto-approval autopilot modes.
* **The Governance UI:**
  * A "Playbook Registry" tab on the dashboard exposing the telemetry fingerprint that triggered the alert, the executed command, the developer's name, and the output log.
  * Team members can cast "Verify" votes. A configurable threshold (e.g., 2 peer approvals) promotes the draft.

---

## 3. Just-In-Time Telemetry Verification (State Drift Mitigation)
Telemetry can recover naturally or be cleared by secondary scripts while a swarm is suspended waiting for operator approval. Executing stale playbooks on healthy resources is dangerous.

### Specification:
* **Verification Gate:**
  * When the operator clicks "Approve & Deploy", the gateway intercepts the command.
  * The Grandchild agent is re-triggered to perform a fast, read-only telemetry check.
  * If the target metrics have returned to safe thresholds (e.g., CPU is now 20% instead of 98%), the execution is aborted, and the run status transitions to `AUTO_RESOLVED` with detailed logger entries.

---

## 4. Flapping Suppression & Hysteretic Control
Metrics that rapidly alternate across warning thresholds can flood the control plane with "start-stop-abort" cycles, burning LLM tokens and loading the OS.

### Specification:
* **Hysteresis Deltas:**
  * Alert Trigger: Metric exceeds 92%.
  * Alert Recovery/Clear: Metric drops below 75% (preventing triggers if fluctuating in the 80-91% zone).
* **Sliding Time-Window Deduplication:**
  * Zig-WASM index keeps a active 5-minute sliding window cache of active incident signatures.
  * If an alert clears and re-triggers within 5 minutes, it is grouped under the active run instead of spawning a new swarm.
* **Cooldown Lockout:**
  * Executing a mitigation locks that signature from spawning new runs for 2 minutes to let metrics stabilize.

---

## 5. Federated Hub-and-Spoke Memory Vaults
To scale across multiple independent services and teams without risking cross-pollution or security leakage (blast radius).

### Specification:
* **The Spoke (Local Vault):**
  * Each service namespace owns its own isolated `database.bin` file.
  * Swarms running in that namespace can only read and write to their local spoke vault.
* **The Hub (Centralized Registry):**
  * A central, read-only registry aggregates successful SRE playbooks metadata across all spokes.
* **The Import Bridge:**
  * If a local service encounters an unknown incident, the agent queries the Central Hub.
  * If a match exists, the dashboard prompts the SRE: *"A matching playbook exists in the Central Hub. Would you like to review and import it to your namespace?"*

---

## 6. Observability of Governance (Playbook Health)
Treating automation code as a living, self-auditing organism.

### Specification:
* **Playbook Freshness Index:**
  * Visualizes the age of each playbook since its last review or execution. Stale entries trigger a sandboxed verification sweep.
* **Remediation Success Rate:**
  * Graphing the success vs failure ratio of runbooks over time. A drop in success indicates environment drift.
* **Entropy Alerting:**
  * Warns the SRE team when two playbooks share high similarity but propose conflicting commands, recommending consolidation.

---

## 7. HITL (Human-in-the-Loop) AI Explanations
To provide the human reviewer with the complete picture instantly on the Dashboard UI without having to mentally parse the entire code diff logic.

### Specification:
* **Structured Payload Prompting:**
  * Modify the system prompt in `workflow.ts` to output a structured payload containing both an explanation and the code in a single response, using delimiters like `[EXPLANATION]` and `[CODE]`.
* **Zero-Latency Extraction:**
  * The SRE Gateway will parse this single payload into two variables (Explanation + Code), avoiding a second API round-trip.
* **UI Rendering:**
  * Render the explanation block in the Dashboard UI (`server.ts` HTML generator) directly above the `CODE CHANGE DIFF` block, giving the human instant, plain-English context for the AI's logic.
