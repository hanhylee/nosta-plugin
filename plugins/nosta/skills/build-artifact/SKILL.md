---

name: build-artifact
description: Build and publish cohesive, Nosta-styled HTML artifacts (specs, architecture diagrams, diagnostics pages, and interactive charts) via guide_artifact and publish_artifact.
---

# Building Nosta Artifacts

Use the Nosta MCP artifact builder whenever you produce a standalone spec, RFC, architecture diagram, diagnostics report, or data visualization for a human reviewer.

## Mandatory Two-Step Loop

1. **Load design modules first:** Call `guide_artifact` with only the modules needed for the page (`spec`, `diagram`, `diagnostics`, `chart`, `interactive`).
2. **Publish fragments inside Nosta's shell:** Call `publish_artifact` with `guideRead: true`, `slot` (`alignment`, `spec`, `evidence`, `artifact` for the Artifacts drawer only, or a custom tab id from `flow.tabs`), inner HTML/SVG fragments per tab, a style preset, and any required `libs` (`echarts`, `mermaid`, `lucide`, `highlight`). When a Flow is bound (via `flowId` or `~/.nosta/flows/index.json`), `publish_artifact` automatically syncs the artifact into that Flow object under the requested slot.

Never hand-roll `<!doctype html>`, `<html>`, or `<head>` wrappers inside tab fragments — the MCP server injects Nosta's native monochrome warm-neutral tokens, typography (`Inter` + `JetBrains Mono`), theme sync, and tab-hash persistence automatically.

## Pick the Right Style Preset

| Preset                        | Use for                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `nosta-editorial` _(default)_ | Specs, RFCs, alignment docs, design reviews, research reports        |
| `nosta-diagnostic`            | Traces, test runs, perf profiles, incident reports, eval comparisons |
| `nosta-blueprint`             | System architecture, C4 diagrams, Crow's Foot ERDs, state machines   |

## Craft & Anti-Slop Rules

- **Lead with the answer:** Put a one-sentence executive callout (`.callout`) or compact monochrome `.kpi-grid` at the top of the first tab.
- **Keep surfaces monochrome neutral:** All `.card` and `.kpi` blocks stay neutral (`--surface` + `--line`). Use semantic classes (`.c-sage` pass, `.c-amber` warn, `.c-terracotta` fail) strictly on small status badges, trace borders, and progress bars — never pastel-filled cards or raw hex colors.
- **Choose the right visual:** Inline SVG (`.svg-diagram`, `viewBox="0 0 680 H"`) for custom diagrams/timelines; Mermaid (`libs: ["mermaid"]`) for C4, ERDs, and state machines (hard ≤ 4 horizontal columns, ≤ 3 participants for `sequenceDiagram`; prefer `TD` — anything wider is rejected at publish time, `LR` auto-stacks to `TD` on mobile, and every diagram gets a zoom/expand toolbar); Apache ECharts (`libs: ["echarts"]`) for trends, distributions, heatmaps, and flame/timeline charts.
- **Keep evidence concrete:** Link primary sources, record measured durations in `tabular-nums`, and put newest/summary tabs first.
