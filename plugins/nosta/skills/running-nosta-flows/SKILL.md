---
name: running-nosta-flows
description: Start, monitor, inspect, and handle merge gates for Nosta flows and file reviews using Nosta MCP tools.
---

# Running Nosta flows

## When to use
- Starting a Nosta spec flow from a local spec file containing a `### Machine flow` block.
- Polling or debugging an in-progress, blocked, or failed Nosta flow.
- Acting on a flow waiting at a merge gate (`mergeApproval: "human"`).
- Running a standalone 1-step code review on local files via `nosta_flow_start`.

## Workflow

### Starting a spec flow
1. Verify the local spec file exists and contains a valid `### Machine flow` JSON block.
2. Resolve the 40-character base commit SHA from the target checkout (`git rev-parse HEAD` or the requested base ref).
3. Confirm the HTTPS `ticketUrl` for the work.
4. Call `nosta_flow_start` once with `{ path, baseSha, ticketUrl }`. Record the returned `flowId`.

### Monitoring and inspecting
1. Poll `nosta_flow_status` with `{ flowId }` until flows settle (`idle` with outcome `complete`, `blocked`, `errored`, or `terminated`) or reach a merge gate.
2. On any `blocked`, `errored`, or `terminated` flow, call `nosta_flow_log` with `{ flowId }` to read the ordered step events and report the exact failure reason and findings.
3. For read-only inspection, call only `nosta_flow_status` and `nosta_flow_log` — make no writes.

### Handling a merge gate
1. Stop as soon as a flow waits for human merge approval (`phase: "mergeGate"`).
2. Present the flow ID, PR link, and current status to the user, and ask for an explicit `approve` or `reject`.
3. Never call `nosta_flow_approve` without the user's explicit word in the current session. Never infer approval from an earlier turn or from approval of a spec.
4. Immediately before calling `nosta_flow_approve`, call `nosta_flow_status` again to read the flow's fresh `version` and `attempt` integers.
5. Call `nosta_flow_approve` with `{ flowId, decision, version, attempt }`.

### Standalone file reviews
1. Call `nosta_flow_start` with `{ paths, title }` using absolute paths of 1 to 32 text files (256 KiB max).
2. Poll `nosta_flow_status` with `{ flowId }` until `state` is `idle` (check `outcome` and the review step's verdict/findings).
3. Report each finding with file, line, severity, and concrete fix.

## Safety rules
- Never print or echo `NOSTA_PLUGIN_TOKEN` in chat, logs, or PR bodies.
- Never bypass a merge gate or retry an approval with a stale `version` or `attempt`.
