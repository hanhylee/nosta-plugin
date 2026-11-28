---

name: improve-flow
description: Analyze real Nosta flow run history with get_flow_history to diagnose failing steps, close evidence gaps, and remove unnecessary HITL pauses.
---

# Improving a Nosta Flow

Use this skill after one or more runs of a workflow to tighten reliability, evidence coverage, and autonomy based on measured run history.

## Improvement Loop

1. **Pull measured run history:**
   - Call `get_flow_history` with `{ definition: "<verb>", limit: 20 }` (and optional `workspace`).
   - Inspect `completeCount`, `failedCount`, `missingEvidenceCount`, `failingSteps` (failures + `medianMs`), `approvalCount`, and `topFailingFlowIds`.
2. **Inspect concrete failures:**
   - Call `get_flow` and `flows_list_events` on the top failing flow IDs to find root causes (flaky checks, missing references/skills, overly broad or missing tools, or unclear prompts).
3. **Refine the YAML definition:**
   - Tighten step prompts, add missing `references` or `skills`, add deterministic `checks` to eliminate `missingEvidenceCount`, and remove `approval` gates that no longer need human sign-off.
4. **Re-validate & verify:**
   - Run `validate_flow` on the updated `.nosta/workflows/<verb>.yaml` before starting the next run, then re-check `get_flow_history` after the run completes.
