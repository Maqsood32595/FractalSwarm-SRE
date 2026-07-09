# GithubParallelAgents Walkthrough & Validation Report

This document walks through the validation runs and design mechanics of the **GithubParallelAgents** pipeline.

---

## 🌪️ Triaged Issues & Setup
We simulated and triaged 3 real-world open issues from the `vercel/ms` repository:
1. **Issue #142:** Feature request to support microsecond parsing (`us` and `μs`).
2. **Issue #143:** Pluralization format error for negative values (e.g. `ms(-90000)` returning `'-1 minute'`).
3. **Issue #144:** Parser failure when encountering double spaces (e.g. `'100  ms'`).

A local sandbox of `ms` was cloned at `GithubParellelAgents/test_sandbox/ms` and dependency installation was completed.

---

## 🧬 Swarm Triaging Execution (AWAITING_APPROVAL)
1. **Bridge Ingest:** Running `node fetch_issues.js` pulls the issues and POSTs them to the Express log gateway.
2. **Mastra Swarm Engagement:** 
   - The **Grandchild (mcp-code-scraper)** reads the `src/index.ts` file content and measures the context size (6,108 characters).
   - The **Child (GitHub Code Specialist)** runs the Gemini 2.5 Flash model, analyzes the codebase and issue details, and generates a TypeScript patch file saved in `temp_patches/`.
   - The **Parent (Incident Commander)** compiles the execution command:
     `node patch_runner.js temp_patches/<runId>.ts`
3. **Suspension:** All 3 runs pass Safety Guard command checks and suspend at the operator gate.

---

## ⚡ Self-Correcting Execution & Sandbox Protection
When the bulk resume action (`resume-all`) is triggered:
* The system attempts to apply the code patch in the sandbox directory.
* It executes local TS checks (`npx tsc --noEmit`) and unit tests (`npx jest --config jest.config.cjs`).
* **Atomic Rollbacks:** Since the AI-generated code patch did not satisfy the strict type check bounds in `parse-strict.test.ts` (e.g., `'1mo'` type assignment), the runner intercepted the failure, **rolled back the file to its original clean state (`git reset --hard`)**, and triggered the **Self-Correction loop**.
* **Self-Correction Run:** The Parent agent queries the LLM with the Jest/TSC stack trace logs to generate a revised patch. The system runs up to 3 self-correction iterations.
* **Final Safety:** If all attempts fail, the codebase remains 100% clean and undamaged, preventing broken commits.

---

## 🐙 Interactive Port 3004 Dashboard
A dedicated, independent dashboard server runs on port **3004** (`npx tsx GithubParellelAgents/server.ts`):
* Renders issues as GitHub cards.
* Features a **Git-style HTML Diff viewer** comparing original code with proposed patches before execution.
* Exposes bulk resume trigger buttons and Jest console log outputs.
