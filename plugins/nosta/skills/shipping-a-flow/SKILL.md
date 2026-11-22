---
name: shipping-a-flow
description: Prepare a finished flow for human ship approval — simulate branch stack clashes, assemble full diff and evidence, open ready PRs on explicit ship, and handle owner walkthroughs.
---

# Shipping a flow

## When to use
- All nodes of a flow are closed and ready for owner review and PR creation.
- Planning merge order across two or more parallel branches from the same base.
- Walking through a branch diff with the owner and applying requested edits.

## Workflow

### 1. Check parallel branch order (when shipping multiple branches)
1. Never claim parallel branches can merge in "any order" without simulating them.
2. Simulate each pair against the base with `git merge-tree --write-tree <tipA> <tipB>` (zero working-tree mutations).
3. For any conflict, list the clashing files, put the foundational branch underneath, and order the branch with the smallest conflict surface last.

### 2. Prepare the ship summary
1. Verify every node is closed, tests/lint/typecheck pass on the tip, and no high-severity review findings remain open.
2. Draft the PR title and body using `writing-pr-descriptions`, including real non-test evidence (command output, trace, or screenshot) and any schema/data changes.
3. Open the ship-ready chat reply with the clickable flow page link (`flowUrl` returned by `nosta_flow_status` / `nosta_flow_start`) and, when a local film exists for the ship gate, embed it directly in chat (`![film](/abs/path/to/film.mp4)`); keep film evidence on the Flow page's **Artifacts** tab rather than passing it through the MCP API. Follow with the full diff summary, PR draft, and evidence, then stop and wait for an explicit "ship" before opening ready pull requests.

### 3. Open ready PRs on explicit ship
1. Only after the owner says "ship", open the pull request(s) as ready (`gh pr create` or `gh pr ready`).
2. Monitor the PR's CI checks and hand off to `landing-the-pr` for review triage and merge.

### 4. Walking through code with the owner
1. When the owner is reading the diff and asking questions, edit and explain only — do not launch unasked reviews, broad test suites, or refactors.
2. Answer questions directly from the code (file and function) and apply requested edits in the same turn as commits at the tip of the branch.
3. Mention any separate defect you notice in one line without fixing it unasked.
