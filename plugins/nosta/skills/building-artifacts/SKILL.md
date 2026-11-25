---
name: building-artifacts
description: Build and publish cohesive, Nosta-styled HTML artifacts (specs, architecture diagrams, diagnostics pages, and interactive charts) via nosta_artifact_guide and nosta_artifact_publish.
---

# Building Nosta Artifacts

Use the Nosta MCP artifact builder whenever you produce a standalone spec, RFC, architecture diagram, diagnostics report, or data visualization for a human reviewer.

## Mandatory Two-Step Loop

1. **Load design modules first:** Call `nosta_artifact_guide` with only the modules needed for the page (`spec`, `diagram`, `diagnostics`, `chart`, `interactive`).
2. **Publish fragments inside Nosta's shell:** Call `nosta_artifact_publish` with `guideRead: true`, inner HTML/SVG fragments per tab, a style preset, and any required `libs` (`echarts`, `mermaid`, `lucide`, `highlight`).

Never hand-roll `<!doctype html>`, `<html>`, or `<head>` wrappers inside tab fragments — the MCP server injects Nosta's warm editorial tokens, typography (`Newsreader` + `Inter` + `JetBrains Mono`), auto dark/light toggle, and tab-hash persistence automatically.

## Pick the Right Style Preset

| Preset | Use for |
|---|---|
| `nosta-editorial` *(default)* | Specs, RFCs, design reviews, research reports |
| `nosta-diagnostic` | Traces, test runs, perf profiles, incident reports, eval comparisons |
| `nosta-blueprint` | System architecture, C4 diagrams, Crow's Foot ERDs, state machines |

## Craft & Anti-Slop Rules

- **Lead with the answer:** Put a one-sentence executive callout (`.callout.c-ochre`) or compact `.kpi-grid` at the top of the first tab.
- **Color encodes meaning only:** Use `.c-stone` for structure and at most 2-3 semantic ramps (`.c-ochre`, `.c-sage`, `.c-amber`, `.c-terracotta`, `.c-slate`). Never hardcode raw hex colors for text or surfaces.
- **Choose the right visual:** Inline SVG (`.svg-diagram`, `viewBox="0 0 680 H"`) for custom diagrams/timelines; Mermaid (`libs: ["mermaid"]`) for C4, ERDs, and state machines (hard ≤ 4 horizontal columns, ≤ 3 participants for `sequenceDiagram`; prefer `TD` — anything wider is rejected at publish time, `LR` auto-stacks to `TD` on mobile, and every diagram gets a zoom/expand toolbar); Apache ECharts (`libs: ["echarts"]`) for trends, distributions, heatmaps, and flame/timeline charts.
- **Keep evidence concrete:** Link primary sources, record measured durations in `tabular-nums`, and put newest/summary tabs first.
