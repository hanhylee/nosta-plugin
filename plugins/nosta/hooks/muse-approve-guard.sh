#!/usr/bin/env bash
set -u

payload="$(cat)"

tool_name=""
if command -v bun >/dev/null 2>&1; then
  tool_name="$(printf '%s' "$payload" | bun -e '
    const text = await Bun.stdin.text();
    try {
      const data = JSON.parse(text);
      const name = typeof data?.tool_name === "string" ? data.tool_name : (typeof data?.toolName === "string" ? data.toolName : (typeof data?.tool?.name === "string" ? data.tool.name : ""));
      process.stdout.write(name);
    } catch {
      process.stdout.write("__INVALID_JSON__");
    }
  ' 2>/dev/null || printf '__INVALID_JSON__')"
else
  tool_name="$(printf '%s' "$payload" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
fi

if [ "$tool_name" = "__INVALID_JSON__" ] || [[ "$tool_name" == *nosta_flow_approve ]]; then
  printf '{"decision":"ask","reason":"Confirm flow merge-gate approval or rejection explicitly with the user in this session."}\n'
  exit 0
fi

exit 0
