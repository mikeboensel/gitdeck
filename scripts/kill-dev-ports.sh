#!/usr/bin/env bash
set -euo pipefail

# Free the project's declared dev ports. Ports come from package.json -> config.ports
# (single source of truth) so this never drifts from the real configuration.

cd "$(dirname "$0")/.."

ports=$(node -e "const p=require('./package.json').config.ports; console.log(Object.values(p).join(' '))")

for port in $ports; do
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing port ${port} (PIDs: ${pids})"
    # shellcheck disable=SC2086 # word-splitting intended: kill accepts multiple PIDs
    kill -9 ${pids} 2>/dev/null || true
  else
    echo "Port ${port} already free"
  fi
done
