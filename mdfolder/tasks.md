# FractalSwarm & GitHub Parallel Agents Project Roadmap

This document outlines the development phases, completed features, and the implementation plan for the **GithubParellelAgents** pipeline.

---

## Phase 1: Core SRE Control Plane (Completed)
- [x] **Modular Express Backend:** Built the core feature gateways (`log-ingest`, `incident-agent`, `memory-vault`, `safety-guard`).
- [x] **Mastra Multi-Agent Swarm:** Built the Parent-Child-Grandchild tree structure (Incident Commander, Domain Specialists, MCP Log Parsers).
- [x] **Storage Triage Demo:** Implemented local file-path diagnostic metrics and self-healing log cleanup (`temp_sys_bloat.log` deletion).
- [x] **Memory Vault Cache:** Implemented a binary memory database (`database.bin`) to cache verified playbooks and minimize LLM calls.

---

## Phase 2: Production Reliability & Hardening (Completed)
- [x] **Express Concurrency Queue:** Wrapped the log-triage trigger in a sequential queue (`concurrency = 1`) to serialize incoming alerts.
- [x] **Exponential Backoff (`retryWithBackoff`):** Wrapped all Gemini LLM calls in a retry handler that waits with escalating delays (3s, 6s, 12s...) during 429 rate-limit spikes.
- [x] **Smart Fallback Rules:** Added fallback logic to dynamically extract line metadata (e.g. Bakerloo vs. District) and generate unique runbooks when LLM quotas are exhausted.
- [x] **TfL Live API Integration:** Connected the dashboard to Transport for London (TfL) live REST streams to ingest active transit delays.
- [x] **Bulk Swarm Deploys:** Implemented parallel workflow resolution using async event loops (`Promise.all`) on the `/resume-all` route.

---

## Phase 3: Standalone Packaging & Open Source (Completed)
- [x] **`/core-wasm` Standalone Pack:** Packaged the Zig source code and freestanding WebAssembly POPCNT log deduplicator with a Node.js test script.
- [x] **`/orchestration-blueprint` Pack:** Packaged the core Mastra SRE agent trees and workflow scripts as a reusable blueprint.
- [x] **Root Documentation:** Rewrote `README.md` to highlight the 90% LLM token-saving architecture.

---

## Phase 4: GitHub Parallel Agents (`GithubParellelAgents`) (In Progress)
- [ ] **Repository Setup:** Clone the target repository (`vercel/ms`) into a local, isolated sandbox: `GithubParellelAgents/test_sandbox/ms`.
- [ ] **GitHub Ingest Bridge:** Build `fetch_issues.js` to query live issues via GitHub REST API, support offline cached issues (`cached_issues.json`) for demo stability, and feed them into the log-ingest pipeline.
- [ ] **Code Specialist Swarm:** Define the Code Agent swarm to read `src/index.ts` and draft git patches for the issues.
- [ ] **Self-Correcting Test Runner:**
  - Apply the patch to the sandbox repository.
  - Run the local Jest test suite (`npm run test`).
  - **If tests pass:** Proceed to simulate opening a Pull Request.
  - **If tests fail:** Capture console/test error logs, trigger the LLM to rewrite the patch based on the error, and display the revised card on the dashboard.
- [ ] **Safety Boundaries (Blast Radius Control):**
  - Restrict write actions to file whitelist (`src/**/*.ts`).
  - Implement automatic `git reset --hard` rollbacks on failed attempts or user rejection.
  - Implement AST checks to block unauthorized imports.
- [ ] **PR-Review Panel Dashboard:** Integrate the code diff editor directly into the control plane HTML dashboard.
