#!/usr/bin/env bash
set -u

skills_mode="$(printf '%s' "${NOSTA_PLUGIN_SKILLS:-all}" | tr '[:upper:]' '[:lower:]')"
backend_url="${NOSTA_BACKEND_URL:-}"
plugin_token="${NOSTA_PLUGIN_TOKEN:-}"

context_parts=()

if [ "$skills_mode" = "off" ] || [ "$skills_mode" = "none" ]; then
  context_parts+=("Nosta plugin skills are disabled by NOSTA_PLUGIN_SKILLS=${skills_mode}; ignore bundled nosta:* skills and defer to workspace skills.")
elif [ "$skills_mode" = "flow-only" ]; then
  context_parts+=("Nosta plugin skill mode is flow-only (NOSTA_PLUGIN_SKILLS=flow-only); use nosta:use-flow only and ignore other bundled nosta:* skills in favor of workspace skills.")
fi

if [ -d ".nosta/workflows" ]; then
  wf_list="$(ls -1 .nosta/workflows/*.yaml 2>/dev/null | xargs -I{} basename {} .yaml | paste -sd ',' - || true)"
  if [ -n "$wf_list" ]; then
    context_parts+=("Repo YAML workflows available: ${wf_list}.")
  fi
fi

if [ -n "$backend_url" ] || [ -n "$plugin_token" ]; then
  base_url="${backend_url:-http://127.0.0.1:18086}"
  base_url="${base_url%/}"
  reachable=0

  if command -v curl >/dev/null 2>&1; then
    health_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "${base_url}/health" 2>/dev/null || printf '000')"
    if [ "$health_code" = "200" ]; then
      reachable=1
    elif [ -n "$plugin_token" ] && [ "$health_code" = "404" ]; then
      api_code="$(printf 'header = "Authorization: Bearer %s"\n' "$plugin_token" | curl -sS -o /dev/null -w '%{http_code}' --max-time 2 -K - "${base_url}/api/toolkits/flows/list?limit=1" 2>/dev/null || printf '000')"
      if [ "$api_code" = "200" ]; then
        reachable=1
      fi
    fi
  fi

  if [ "$reachable" -eq 1 ]; then
    context_parts+=("Nosta backend is reachable.")
  else
    context_parts+=("Nosta backend is unreachable; verify NOSTA_BACKEND_URL and NOSTA_PLUGIN_TOKEN before starting flows.")
  fi
fi

if [ "${#context_parts[@]}" -eq 0 ]; then
  exit 0
fi

joined=""
for part in "${context_parts[@]}"; do
  if [ -n "$joined" ]; then
    joined="${joined} ${part}"
  else
    joined="${part}"
  fi
done

escaped="${joined//\\/\\\\}"
escaped="${escaped//\"/\\\"}"

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$escaped"
exit 0
