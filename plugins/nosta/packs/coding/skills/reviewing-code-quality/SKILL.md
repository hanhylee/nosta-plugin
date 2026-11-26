---

name: reviewing-code-quality
description: Run and triage a strict, fresh-context code review for correctness, design simplicity, duplicated utilities, caller impact, and safe error handling.
---

# Reviewing code quality

## When to use

- Reviewing a node diff before pushing, reviewing fix commits, or running a standalone quality review.

## Caller workflow

1. Never review code you wrote in the same session.
2. Run deterministic checks first (repo lint, typecheck, formatter) and fix all tool errors before requesting a review.
3. Start a fresh review via `start_flow` (passing `paths`, `repoRoot`, and `branch` so `parentId` auto-links from `~/.nosta/flows/index.json`) and poll `get_flow` until complete, or launch a fresh read-only reviewer with no argument defending the design and record its result via `sync_flow({ review: { model, verdict, findings, summary } })`.
4. Triage every finding before editing:
   - Fix valid correctness, security, and maintainability findings yourself as `fix(<scope>): ...` commits.
   - Fix the finding inside the owning function/module rather than adding a parallel wrapper.
   - Search the rest of the branch diff for the same class of defect and fix all occurrences together.
   - Decline findings that demand out-of-spec feature creep (unrequested limits, modes, settings, or displays) with a clear one-line reason.
   - Escalate only findings where you disagree with a material design trade-off.
5. Cap at 2 review passes per node (run a second pass only if the first found high-severity issues or more than five medium issues).

## Reviewer checklist (when acting as a read-only reviewer)

1. Read the repo's `AGENTS.md` and coding standards before reading the diff.
2. Read surrounding callers and consumers beyond the diff — especially every reader of any field the diff stops writing or guards.
3. Look first for simplifications that delete complexity, and hunt duplicated helpers or patterns the repo already implements.
4. Flag raw internal error text, stack traces, or secrets exposed to end users.
5. Flag swallowed errors or failure paths that leave no observable log/error signal.
6. Quote the exact `file:line` snippet, classify severity (high / medium / low), and give a concrete fix for every finding. Edit no files.
