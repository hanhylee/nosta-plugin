#!/usr/bin/env bash
set -u

POLICY_JS='
const fs = require("node:fs");
try {
  const data = JSON.parse(fs.readFileSync(0, "utf8"));
  const name =
    typeof data?.tool_name === "string"
      ? data.tool_name
      : typeof data?.toolName === "string"
        ? data.toolName
        : typeof data?.tool?.name === "string"
          ? data.tool.name
          : "";
  if (
    name.endsWith("approve_flow") ||
    name.endsWith("flows_approve") ||
    name.endsWith("bypass_flow")
  ) {
    process.stdout.write("ASK");
  } else if (name.endsWith("toolkits_call")) {
    const input =
      data?.tool_input ??
      data?.toolInput ??
      data?.arguments ??
      data?.args ??
      data?.tool?.input ??
      data?.tool?.arguments ??
      null;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      process.stdout.write("ASK");
    } else {
      const toolkit = typeof input.toolkit === "string" ? input.toolkit.trim() : "";
      const tool = typeof input.tool === "string" ? input.tool.trim() : "";
      process.stdout.write(
        !toolkit || !tool || (toolkit === "flows" && tool === "approve")
          ? "ASK"
          : "ALLOW",
      );
    }
  } else {
    process.stdout.write("ALLOW");
  }
} catch {
  process.stdout.write("ASK");
}
'

if command -v bun >/dev/null 2>&1; then
  bun -e "$POLICY_JS" 2>/dev/null || printf 'ASK'
elif command -v node >/dev/null 2>&1; then
  node -e "$POLICY_JS" 2>/dev/null || printf 'ASK'
else
  printf 'ASK'
fi
