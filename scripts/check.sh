#!/usr/bin/env bash
# Validates and tests every Claude Code mod and plugin in the repo, then the marketplace.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
for dir in claude-code/mods/*/ claude-code/plugins/*/; do
  [ -f "$dir/.claude-plugin/plugin.json" ] || continue
  echo "== $dir"
  claude plugin validate "$dir" || status=1
  if compgen -G "$dir/tests/*.test.ts" > /dev/null || compgen -G "$dir/tests/*.test.tsx" > /dev/null; then
    claude plugin test "$dir" || status=1
  fi
done

echo "== marketplace"
claude plugin validate . || status=1
exit $status
