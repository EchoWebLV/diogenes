#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "missing .env — copy .env.example and put XAI_API_KEY in it"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${XAI_API_KEY:-}" ]]; then
  echo "XAI_API_KEY is empty"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

export XAI_MODEL="${XAI_MODEL:-grok-4.6}"
exec node src/index.js
