# FractalSRE Technical Reference Ledger

This document registers the low-level technical specifications, design decisions, and runtime parameters implemented in **FractalSRE**.

---

## 🏗️ 1. Fractal V2 Kernel Scaffolding
*   **Discovery Engine:** The gateway (`server/kernel.ts`) recursively scans `/server/features` looking for `feature.manifest.json` configurations.
*   **Clean-Room Hot Swapping:** To support loading new playbooks without resetting connections, the kernel traverses `require.cache` and deletes all matching paths in a cell's directory before calling `require()`.
*   **Routing Path:**
    `Gateway -> BasePath (/api/<feature>) -> Router (/routes.ts) -> Serving UI (/ui)`

---

## 🧠 2. QSAG 1-Bit Vector Quantization
*   **Dimension:** 384-dimensional float embeddings.
*   **Quantization:** Float values $\ge 0.0$ map to bit value `1`, else `0`.
*   **Memory Footprint:** 384 floats (1,536 bytes) compressed into exactly 48 bytes (exactly 32x reduction).
*   **Binary DB Layout:** Each record in `database.bin` is serialized sequentially as:
    `[UUID: 16 bytes][Packed Vector: 48 bytes][Text Length: 4 bytes (u32 LE)][Text Payload: N bytes]`

---

## ⚡ 3. WebAssembly Zig POPCNT Memory Mapping
*   **Compilation:** Zig code compiles to freestanding WebAssembly via:
    `zig build-lib qsag_matcher.zig -target wasm32-freestanding -dynamic -rdynamic -O ReleaseFast`
*   **Function Signature:**
    `fn scanDatabase(query: [*]const u8, db_buffer: [*]const u8, record_count: usize, out_distances: [*]u32) void`
*   **Linear Memory Offset Layout:**
    *   `Query Offset (0)`: 48 bytes (align 0)
    *   `Out Distances Offset (64)`: `record_count * 4` bytes (align 64)
    *   `DB Buffer Offset (Aligned at 64)`: `record_count * 64` bytes (containing contiguous array of `[UUID: 16b][Packed Vector: 48b]`)
*   **Dynamic Page Allocation:** 
    `Pages = Math.ceil((DB_Offset + (record_count * 64)) / 65536)`
    Node grows the WASM buffer memory dynamically using `memory.grow()` if required.

---

## 🤖 4. Mastra SRE Agent & Workflow
*   **Agent Configuration:** Defined inside the `incident-agent` cell. equipped with tools to query Qdrant and execute shell commands.
*   **Workflow Engine:** Maps the incident lifecycle state machine. Exposes suspend/resume states to orchestrate Slack human approval before executing remediation actions.

---

## 🛡️ 5. Enkrypt AI Guardrails API
*   **Endpoint:** `POST https://api.enkryptai.com/guardrails/detect`
*   **Payload Format:**
    ```json
    {
      "text": "Proposed terminal command script",
      "detectors": {
        "injection_attack": { "enabled": true },
        "policy_violation": { "enabled": true }
      }
    }
    ```
*   **API Key Header:** `apikey: process.env.ENKRYPT_API_KEY`

---

## 🔄 6. Mastra Workflow Resumption Hook
*   **Context:** Mastra workflows use a state persistence mechanism to handle suspensions. Calling `createRun` or `resume` requires the workflow to be bound to a `Mastra` instance that provides a storage engine.
*   **In-Memory Store:** The workflow and agent are registered to a new `Mastra` instance inside `server/features/incident-agent/workflow.ts` using `new Mastra({ agents: { incidentAgent }, workflows: { incidentWorkflow } })`.
*   **Under-the-Hood:** Registering the workflow mutates the workflow object in-place, assigning it a default `InMemoryStore` that persists run execution snapshots and enables dynamic step-level resumption.

---

## 🌪️ 7. Alert Storm Benchmark Results
*   **Scale:** 1,000 alert logs burst-fired concurrently.
*   **Local Filtering Rate:** 100.0% local cache hits for duplicate logs.
*   **Latency:** Average POPCNT matching latency of <1ms.
*   **Total Pipeline Burst Duration:** ~1.2s execution time to filter all 1,000 alert streams.

---

## 🛡️ 8. Active Failure Isolation & Grandchild Swarm Triage
*   **Hierarchical Diagnostics:** When an anomaly is detected, the **Parent Agent (Incident Commander)** delegates log gathering and analysis to a domain-specialist **Child Agent**. The Child agent instantiates a **Grandchild Agent** equipped with low-level diagnostics and file-parsing tools to extract telemetry.
*   **Dynamic Remediation Synthesis:** 
    *   *LLM-Driven:* If the LLM model is online, the SRE Incident Commander dynamically analyzes the compressed telemetry context to determine the root-cause and formulate a targeted recovery command (e.g. killing conflicting PIDs or re-routing services).
    *   *Rule-Based Fallback:* If LLM keys are missing, the system shifts to a deterministic local rule-based failure-isolation state machine that checks parsed logs to isolate conflicts and propose exact mitigate commands (like port-freeing or temp-disk clearing).
*   **Safety Assurance:** Every proposed command is audited against safety policies via the **Safety Guard Service (Enkrypt AI)** before halting the workflow state machine at a human-in-the-loop approval step.
*   **Coexistence:** Both the high-throughput WASM POPCNT matching simulator and the active hierarchical failure-isolation triage engines run in parallel on port `3002`.
