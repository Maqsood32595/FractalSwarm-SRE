# GitHub Parallel Agents (FractalSwarm Architecture)

This directory contains the autonomous, self-healing Software Engineering pipeline designed to resolve complex open-source and enterprise GitHub issues at scale.

## Core Architecture

Unlike unconstrained LLMs that blindly generate code, this architecture operates as a deterministic, self-healing pipeline:

1. **Air-Gapped Sandboxing (`test_sandbox`)**:
   Issues are ingested and patches are proposed against an ephemeral local clone of the target repository. Agents never touch your primary working directory, eliminating the risk of partial code pollution.

2. **Hierarchical Swarm Topology (`workflow.ts`)**:
   Tasks are delegated cleanly:
   - **Parent (Incident Commander)**: Coordinates state and manages the execution flow.
   - **Child (Code Specialist)**: Generates specific patches using AST context.
   - **Grandchild (Diagnostics Parser)**: Acts as a read-only parser to compile clean context.

3. **Deterministic Sandbox Verification (`patch_runner.js`)**:
   The pipeline doesn't guess if code is valid. It instantly boots the repository's native test framework (e.g., Jest), running and mathematically verifying all operational unit tests before proceeding.

4. **Recursive Self-Healing (Rollbacks)**:
   If a proposed patch fails a strict TypeScript compilation or a Jest unit test, the pipeline immediately rolls back the Git state (destroying the sandbox), flags the failure, and recursively feeds the telemetry back to the Swarm for self-correction.

5. **Human-in-the-Loop (HITL) Dashboard (`server.ts`)**:
   Every successfully drafted patch is suspended at an approval gate. Maintainers are presented with a clean, validated code diff to audit and safely deploy via the real-time React/Express dashboard.

## Running the Dashboard

```bash
# Run the Dashboard UI
npx tsx GithubParellelAgents/server.ts

# Ingest Live Issues
# Click the "Ingest" button on the UI, which natively triggers:
node GithubParellelAgents/fetch_issues.js --live
```
