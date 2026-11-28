#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
decision="$(bash "$SCRIPT_DIR/approve-guard-decision.sh" 2>/dev/null || printf 'ASK')"

if [ "$decision" != "ALLOW" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Confirm flow approval, rejection, or workflow bypass explicitly with the user in this session."}}\n'
  exit 0
fi

exit 0
