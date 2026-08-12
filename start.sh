#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "missing .env — copy .env.example"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ ! -d node_modules ]]; then
  npm install
fi

LIVE=0
if [[ "${1:-}" == "--live" || "${AGENT_ENABLED:-0}" == "1" ]]; then
  LIVE=1
fi

if [[ "$LIVE" == "1" && -z "${XAI_API_KEY:-}" ]]; then
  echo "XAI_API_KEY is empty (needed for --live)"
  exit 1
fi

export XAI_MODEL="${XAI_MODEL:-grok-4.6}"
if [[ "$LIVE" == "1" ]]; then
  echo "starting groklius LIVE — this spends"
  exec node src/index.js --live
fi

echo "starting groklius rack only — no model spend"
exec node src/index.js
