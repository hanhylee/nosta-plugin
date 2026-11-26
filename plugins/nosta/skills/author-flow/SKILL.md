---

name: author-flow
description: Turn a repeatable task into a validated, verb-named Nosta YAML workflow under .nosta/workflows/ with explicit primitives, local guards, and mandatory evidence.
---

# Authoring a Nosta Flow

Use this skill when a user wants to capture a repeatable task as a durable Nosta YAML workflow in `.nosta/workflows/<verb>.yaml`.

## Naming & Placement

- Name every flow with a leading lowercase verb (`explore`, `align`, `spec`, `debug`, `implement`, `review`, `ship`, `land_pr`) — no redundant `nosta` prefixes.
- Save repo workflows to `.nosta/workflows/<name>.yaml`. Repo files override any opt-in starter pack template of the same name.

## Authoring Loop

1. **Choose the step kind:**
   - `kind: agent` — unbound local harness step (runs in the user's environment; never declare sandbox-boundary fields `hosts`, `secrets`, `mcpServers`, `vmProfileId`).
   - `kind: restricted_agent` — bounded step (`runtime: vm | cloud_session | durable`) declaring only the `skills`, `references`, `tools`, `hooks`, `secrets`, `hosts`, and `mcpServers` it needs.
   - `kind: command` / `kind: wait` — deterministic checks and human approval/signal gates.
2. **Require verifiable evidence:**
   - Declare top-level `evidence: { required: true, checks: [...], artifacts: [...] }` (or step-level `checks`/`outputs`) so every run produces machine-verifiable proof.
3. **Declare local guards (optional):**
   - Put `guards: { approvalNodes, allowBeforeApproval, gateBeforeApproval, prGateAfter }` directly in the YAML — never create a separate `.nosta/workflow.json`.
4. **Validate before starting:**
   - Always call `validate_flow` with `{ path: ".nosta/workflows/<name>.yaml", repoRoot }` and fix every error (missing skill/reference paths, missing secrets, invalid verb name, missing evidence) before calling `start_flow`.
