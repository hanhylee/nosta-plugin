---

name: use-flow
description: Discover, validate, start, sync evidence for, inspect, and control Nosta YAML workflows using the verb-first MCP tools.
---

# Using Nosta Flows

Use this skill to run any workflow in `.nosta/workflows/<verb>.yaml` (or the bundled blank-slate `explore` flow) and keep the Nosta flow page updated with verifiable evidence.

## Core Lifecycle

1. **Discover & validate:**
   - Inspect `.nosta/workflows/*.yaml` in the repo (or start `explore` for blank-slate work).
   - Call `validate_flow` before starting a modified or unfamiliar workflow.
2. **Start idempotently:**
   - Call `start_flow` with `{ workflow: "<name>", repoRoot }` (and optional `values`).
   - Active bindings on `(commonRepo, branch)` are reused automatically across retries and git worktrees unless `forceNew: true` is passed.
3. **Record evidence & sync:**
   - Call `sync_flow` to publish check results, artifacts, and diff snapshots as steps complete.
   - Poll `get_flow` / `flows_list_events` or list runs with `flows_list`.
4. **Control & human gates:**
   - Use `advance_flow`, `flows_signal`, `flows_start`, or `flows_cancel` as needed.
   - Never call `approve_flow`, `flows_approve`, or `bypass_flow` without explicit confirmation from the human owner.
