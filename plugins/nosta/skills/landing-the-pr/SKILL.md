---
name: landing-the-pr
description: Triage PR review comments and CI failures, resolve merge conflicts safely with diff3, verify merge readiness, and land PRs only on explicit owner confirmation.
---

# Landing the PR

## When to use
- Managing an open PR after push: review comments, red CI jobs, merge conflicts, merging, and post-merge teardown.

## Workflow

### 1. Triage review comments and CI
1. Read all open review threads and CI check logs (`gh pr view`, `gh pr checks`, `gh run view --log-failed`).
2. Decide every review note before editing:
   - Apply valid fixes across the whole branch diff (fix the class of defect, not just one line).
   - Decline out-of-spec feature creep with a concise reason.
   - Escalate disagreements to the owner as lettered options (A/B/C) with trade-offs; do not silently ignore or silently comply.
3. For a red CI job, distinguish regressions introduced by the PR from pre-existing base failures or transient infra flakes; fix PR-caused failures, re-run lint/typecheck, push, and update the PR description if behavior changed.
4. Never call a PR green without checking actual CI status.

### 2. Resolve merge conflicts safely
1. Merge the base into the PR branch (`git fetch origin && git merge --no-commit --no-ff origin/<base>`). Never force-rebase an open PR unless the owner asks.
2. Inspect conflicts with `diff3` markers (`git checkout --conflict=diff3 -- <files>`) and review base commits touching those files (`git log --oneline HEAD..origin/<base> -- <files>`).
3. Resolve hunk by hunk — never run `git checkout --ours` or `--theirs` on whole files.
4. Verify zero conflict markers remain, run repo lint/typecheck, commit the merge with a one-line summary per conflicting file, and push.

### 3. Merge and teardown
1. **Never merge without the owner's explicit confirmation naming the PR.** Approval of code changes is not approval to merge.
2. Immediately before merging, verify PR state (`OPEN`, not draft, `MERGEABLE`, required checks green). Never bypass branch protection with admin flags.
3. Check for open PRs stacked on this branch before deleting the remote branch; if any exist, merge while keeping the branch, retarget stacked PRs to the base, then delete the branch.
4. After merge, sync local base (`git fetch origin`), remove temporary worktrees created for the PR, and report the PR number, merge commit SHA, and link.
