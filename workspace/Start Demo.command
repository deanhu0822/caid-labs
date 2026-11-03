#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")"
if ! command -v npm >/dev/null 2>&1 || [[ ! -d node_modules ]]; then
  print 'Open README.md for the one-time Node.js and npm setup.'
  read -k 1 '?Press any key to close. '
  exit 1
fi
workspace_port=$(node --env-file-if-exists=.env.local -e 'process.stdout.write(process.env.CAID_PORT || "5173")')
workspace_url="http://127.0.0.1:$workspace_port"
if curl -fsS "$workspace_url/api/analysis/status" >/dev/null 2>&1; then
  open "$workspace_url/"
  exit 0
fi
npm run build
print 'Starting the CAID workspace. Keep this window open while using it.'
npm start &
workspace_pid=$!
trap 'kill $workspace_pid 2>/dev/null || true' EXIT INT TERM
for attempt in {1..20}; do
  if curl -fsS "$workspace_url/api/analysis/status" >/dev/null 2>&1; then
    open "$workspace_url/"
    break
  fi
  sleep 0.25
done
wait "$workspace_pid"
