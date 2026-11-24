# Nosta Plugin

Official Nosta MCP tools, prompts, engineering workflow skills, and merge-gate approval guardrails for Claude Code and Muse.

## Quick Start Guide

### 1. Get a plugin token

Sign in at [app.nosta.dev](https://app.nosta.dev), open **Settings → API keys**, and create a plugin token (`NOSTA_PLUGIN_TOKEN`).

### 2. Set environment variables

Add these to `~/.zshrc` or `~/.bashrc` (the plugin stores no secrets or model keys):

```bash
export NOSTA_BACKEND_URL="https://app.nosta.dev"
export NOSTA_PLUGIN_TOKEN="<your-plugin-token>"
```

Leave `NOSTA_BACKEND_URL` unset if you are running a local `celld` backend (`http://127.0.0.1:18086`).

### 3. Install

**One-command installer (OpenCode, Codex, Cursor, Windsurf, Claude Code):**

```bash
npx -y @nostadev/mcp install opencode   # or: codex, cursor, windsurf, claude (--project for workspace-local)
```

**Claude Code native plugin (MCP + skills + hooks):**

```bash
/plugin install nosta --marketplace hanhylee/nosta-plugin
```

Or register the marketplace first:

```bash
claude plugin marketplace add hanhylee/nosta-plugin
claude plugin install nosta@nosta-plugin
```

**OpenCode (`opencode.json` or `~/.config/opencode/opencode.json`):**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nosta": {
      "type": "local",
      "command": ["npx", "-y", "@nostadev/mcp"],
      "enabled": true,
      "environment": {
        "NOSTA_BACKEND_URL": "https://app.nosta.dev",
        "NOSTA_PLUGIN_TOKEN": "<your-plugin-token>"
      }
    }
  }
}
```

OpenCode also reads the bundled `SKILL.md` files from `plugins/nosta/skills/` when copied into `.opencode/skills/` or `~/.config/opencode/skills/`.

**Codex:**

```bash
codex mcp add nosta -- npx -y @nostadev/mcp
```

**Cursor, Windsurf, T3 Code (`mcpServers` JSON):**

```json
{
  "mcpServers": {
    "nosta": {
      "command": "npx",
      "args": ["-y", "@nostadev/mcp"]
    }
  }
}
```

### 4. Run your first flow

- **Quick file review**: run the `review_files` prompt or ask your agent to call `nosta_flow_start` with `{ paths: ["/abs/path/to/file.ts"], title: "Quick review" }`.
- **Spec flow**: run the `start_flow` prompt (or call `nosta_flow_start` with `{ path, baseSha, ticketUrl }`) on a spec containing a `### Machine flow` block.
- **Inspect**: poll `nosta_flow_status` and `nosta_flow_log` (or run `review_flow`), or open [app.nosta.dev/flows](https://app.nosta.dev/flows).
- **Merge gate**: flows pause at human approval gates; a `PreToolUse` hook requires your explicit confirmation before `nosta_flow_approve` runs.

## What's Included

- **MCP tools**: `nosta_flow_start`, `nosta_flow_status`, `nosta_flow_log`, `nosta_flow_advance`, `nosta_flow_approve`, `nosta_flow_bypass`
- **MCP prompts**: `start_flow`, `review_flow`, `approve_flow`, `review_files`
- **Bundled skills**: `running-nosta-flows`, `speccing-a-ticket`, `building-a-node`, `closing-a-node`, `shipping-a-flow`, `reviewing-code-quality`, `writing-pr-descriptions`, `landing-the-pr`
- **Hooks**: `PreToolUse` approval guard on `nosta_flow_approve` and fail-open `SessionStart` backend/skill check

## Environment

| Variable | Required | Description |
|---|---|---|
| `NOSTA_BACKEND_URL` | Hosted mode | Nosta URL (`https://app.nosta.dev`). Defaults to `http://127.0.0.1:18086`. |
| `NOSTA_PLUGIN_TOKEN` | Yes (hosted) | Bearer token from **Settings → API keys**. |
| `NOSTA_PLUGIN_SKILLS` | Optional | Claude Code bundled skills: `all` (default), `flow-only`, or `off`. |
| `NOSTA_PLUGIN_PROMPTS` | Optional | Set to `off` (`0` or `false`) to expose raw MCP tools only. |

## Links

- Console: https://app.nosta.dev
- Docs: https://docs.nosta.dev
- Site: https://nosta.dev
