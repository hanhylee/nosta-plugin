# Nosta Plugin

Official Nosta MCP tools, prompts, engineering workflow skills, and merge-gate approval guardrails.

## Install in Claude Code

```bash
/plugin install nosta --marketplace hanhylee/nosta-plugin
```

Or register the marketplace first:

```bash
claude plugin marketplace add hanhylee/nosta-plugin
claude plugin install nosta@nosta-plugin
```

## Standalone MCP (Cursor, Codex, T3 Code, Windsurf)

```bash
npx -y @nostadev/mcp
```

## Environment

- `NOSTA_BACKEND_URL`: your Nosta URL (for example `https://app.nosta.dev`; defaults to `http://127.0.0.1:18086`).
- `NOSTA_PLUGIN_TOKEN`: bearer token for the Nosta backend.
- `NOSTA_PLUGIN_SKILLS`: `all` (default), `flow-only`, or `off`.
- `NOSTA_PLUGIN_PROMPTS`: set to `off` to disable MCP prompts.
