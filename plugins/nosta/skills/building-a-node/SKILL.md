---
name: building-a-node
description: Build one approved spec node in an isolated git worktree using skeleton-first commits, small behavior-scoped diffs, and behavior tests.
---

# Building a node

## When to use
- Implementing a node from an approved spec.
- Setting up a clean worktree, writing contract/skeleton commits, or splitting a node that exceeds size limits.

## Workflow

### 1. Prepare an isolated worktree
1. Never edit on the base branch. Fetch the latest base (`git fetch origin`) and create a dedicated worktree (`git worktree add <worktree-path> -b <branch> origin/<base>`).
2. Install dependencies and run the repo's typecheck and relevant baseline tests. Report any pre-existing base failures before making edits.
3. Never reuse or wipe a worktree you did not create.

### 2. Build skeleton first
1. Create the new files, public signatures, types, routes, and failing behavior tests named by the node spec first, leaving implementation bodies minimal.
2. Commit the skeleton cleanly (`contract(<scope>): skeleton`) so the interface shape is clear before filling bodies.
3. Search the repo for existing helpers before writing new utilities; prefer additive changes in new files/functions over editing unrelated code.

### 3. Implement and test
1. Write each test beside its behavior and verify it fails before the fix/implementation makes it pass.
2. Test observable behavior at the boundary (route, tool call, CLI, or UI flow) using existing fixtures — never weaken assertions to reach green.
3. Keep each node at <=100 added lines of code (200 cap, excluding docs/generated files/deletions). Check size with `git diff --stat origin/<base>...HEAD`.
4. Commit logical checkpoints by explicit file path only after touched tests, lint, and typecheck pass.
5. Stop and return to `speccing-a-ticket` if the owner introduces a new requirement or architectural change mid-build.

### 4. Split if a node grows past the cap
1. Cut unnecessary complexity first before splitting.
2. Split strictly by independent behavior (one tool, one endpoint, one action) — never into "implementation" and "tests" or a piece that cannot be verified on its own.
3. Close each completed node with `closing-a-node` before starting the next node.
