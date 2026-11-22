---
name: closing-a-node
description: Verify a finished node with affected tests, lint/typecheck, a fresh Nosta code review, fix commits, and a clean branch push.
---

# Closing a node

## When to use
- Wrapping up a completed node before moving to the next node or shipping the flow.

## Workflow
1. Run the repository's lint, format check, and typecheck commands from `AGENTS.md`.
2. Run the affected test suite for the files changed in this node. Confirm any new regression test fails on the base commit and passes on `HEAD`.
3. Never review code you wrote in the same session. Run a fresh code review on the changed files using `nosta_flow_start` (with `paths`) and `nosta_flow_status` (or a fresh read-only reviewer subagent) following `reviewing-code-quality`.
4. Fix every valid finding as a focused `fix(<scope>): ...` commit on the branch, and search the rest of the node diff for the same class of defect. Re-run lint, typecheck, and affected tests after fixes.
5. If the base branch has advanced, fetch and merge `origin/<base>` cleanly (`git fetch origin && git merge --no-ff origin/<base>`), resolve any conflicts, and re-verify lint/typecheck.
6. Push the branch (`git push -u origin HEAD`). Do not open a ready PR or merge without the owner's explicit word.
7. Summarize in one concise block: branch name, diff size, checks run, review result, and any remaining uncommitted files.
