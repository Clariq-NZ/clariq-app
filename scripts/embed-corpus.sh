#!/usr/bin/env bash
# Runs the embed_chunks edge function repeatedly until every chunk has a vector.
# Usage:  EMBED_TOKEN=... ./scripts/embed-corpus.sh   (same value as the EMBED_TOKEN secret)
set -uo pipefail
PROJECT=oksxzvomjjsjhjqifqhk
URL="https://${PROJECT}.supabase.co/functions/v1/embed_chunks?batch=${BATCH:-5}"
: "${EMBED_TOKEN:?Set EMBED_TOKEN in the environment first}"
while true; do
  out=$(curl -s -X POST "$URL" -H "x-embed-token: ${EMBED_TOKEN}")
  echo "$out"
  remaining=$(echo "$out" | sed -n 's/.*"remaining":\([0-9]*\).*/\1/p')
  if [[ -z "$remaining" ]]; then
    # Resource limit or transient error: back off and carry on; progress is kept in the database.
    echo "Retrying in 3s"; sleep 3; continue
  fi
  [[ "$remaining" == "0" ]] && { echo "All chunks embedded."; break; }
done
