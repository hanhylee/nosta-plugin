---
name: writing-pr-descriptions
description: Write clear, evidence-backed pull request titles and bodies with diagrams, changed-file trees, data changes, non-test proof, and merge risk.
---

# Writing pull request descriptions

## When to use
- Drafting a new PR title/body or updating an open PR body after new commits are pushed.

## Workflow
1. Read the ticket, the full branch diff, and the repo's PR template or recent merged PRs; follow the repo's template where one exists.
2. Write the title as `<type>(<scope>): <plain description of what changes>` (one type per PR).
3. Open with what a user/caller did, what happened, the root cause, and what this PR changes. For `fix` PRs, lead with a concise `## Diagnosis` (symptom, root cause, short call trace).
4. Keep bullets to one line and one fact. Describe the final state only — omit intermediate review history, internal pipeline IDs, and test counts (CI reports tests).
5. For code changes, include concise Mermaid diagrams under the summary:
   - a `classDiagram` of added/changed modules, classes, and signatures;
   - a `sequenceDiagram` of a real call path with `alt` branches for decided cases.
   (Use a `flowchart` only for pipelines or multi-step workflows.)
6. Include a short folder tree of changed files (`+` added, `~` modified, `-` deleted) and verify every file sits in the right directory.
7. If the PR adds, alters, or drops any database table, view, or column, include `## Data changes` (what it holds, migration path, size/impact, rollback).
8. Under `## Evidence`, provide real non-test proof observed in this session (command output, API response, trace, or screenshot/recording) — never treat a unit test count as sufficient proof on its own.
9. Include `## Merge risk` naming affected surfaces, risk level (`Low` / `Medium` / `High`), and the rollback step.
10. Keep the body synced after fix pushes. Never mark a PR ready or merge it without the owner's explicit word.
