---

name: speccing-a-ticket
description: Ground a ticket or feature idea in code, align on scope and decisions one at a time, and write a Nosta-ready flow spec before writing code.
---

# Speccing a ticket

## When to use

- Before writing feature or bug-fix code for a ticket, architecture change, or UI change.
- When turning a problem statement into a spec with a `### Machine flow` for `start_flow`.

## Workflow

### 1. Ground in code first

1. Write no production code, scaffold, or implementation before explicit owner approval ("Go") on the spec.
2. Read the repository's `AGENTS.md` (or contributing guide) and existing architecture docs first.
3. Read the ticket and the real call sites, types, and pathways in the codebase. Prove every claim from code, logs, or a local run — never ask the owner a question the codebase can answer.
4. Search for existing utilities, endpoints, or libraries in the repo that already solve part of the problem before proposing new abstractions.
5. For bug fixes, identify the observed root cause and targeted fix before designing an end state.

### 2. Align on scope and decisions

1. Summarize the problem (with observed evidence), the full scope of affected components, and any new domain names.
2. Confirm the problem picture with the owner before debating solutions.
3. Settle open design decisions one at a time with 2–3 lettered options and concrete trade-offs. Never defer an open decision to implementation.
4. Spike unknowns in a throwaway git worktree before proposing an option that depends on unverified behavior.

### 3. Shape the flow and write the spec

1. Cut the work into small, independent nodes:
   - Each node delivers one complete behavior with its own tests and non-test verification.
   - Target <=100 added lines of code per node (200 max); never split a node into "code" vs "tests".
   - Keep a flow to at most 3 nodes; split larger work into sequential tickets/flows.
2. Write the spec with:
   - `## Problem`: concrete defects and evidence.
   - `## Design`: end state, file tree (new/modified/deleted), class/interface shapes, and sequence flow.
   - `## Proof`: boundary/behavior tests and real non-test verification steps.
   - `### Machine flow`: valid JSON naming the target repo, base branch, run config (`mergeApproval: "human"` by default), and each node's behavior, files, blockers, and proof.
3. Leave no `TBD`, `TODO`, or vague requirements.
4. When working on a bound local flow, publish alignment/decision HTML with `slot: "alignment"` and spec HTML with `slot: "spec"` via `publish_artifact` (which auto-syncs into the bound Flow object) or `sync_flow` so the Flow page's **Alignment** and **Spec** tabs populate before asking for Go.
5. Present the spec to the owner and wait for an explicit Go before creating branches or running `start_flow`.
