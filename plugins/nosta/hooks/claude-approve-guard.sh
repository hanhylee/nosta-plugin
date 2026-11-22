#!/usr/bin/env bash
set -u

payload="$(cat)"

tool_name=""
if command -v bun >/dev/null 2>&1; then
  tool_name="$(printf '%s' "$payload" | bun -e '
    const text = await Bun.stdin.text();
    try {
      const data = JSON.parse(text);
      const name = typeof data?.tool_name === "string" ? data.tool_name : (typeof data?.toolName === "string" ? data.toolName : "");
      process.stdout.write(name);
    } catch {
      process.stdout.write("__INVALID_JSON__");
    }
  ' 2>/dev/null || printf '__INVALID_JSON__')"
elif command -v node >/dev/null 2>&1; then
  tool_name="$(printf '%s' "$payload" | node -e '
    const fs = require("node:fs");
    try {
      const data = JSON.parse(fs.readFileSync(0, "utf8"));
      const name = typeof data?.tool_name === "string" ? data.tool_name : (typeof data?.toolName === "string" ? data.toolName : "");
      process.stdout.write(name);
    } catch {
      process.stdout.write("__INVALID_JSON__");
    }
  ' 2>/dev/null || printf '__INVALID_JSON__')"
else
  tool_name="__INVALID_JSON__"
fi

if [ "$tool_name" = "__INVALID_JSON__" ] || [[ "$tool_name" == *nosta_flow_approve ]] || [[ "$tool_name" == *nosta_flow_bypass ]]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Confirm flow approval, rejection, or workflow bypass explicitly with the user in this session."}}\n'
  exit 0
fi

exit 0
