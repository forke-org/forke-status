#!/usr/bin/env bash
# Loads status.json from the data branch into data/status.json.
# If GitHub cannot hand it over, sets skip=true so the run stops quietly instead of
# working from an empty history (which would wipe the saved uptime bars).
mkdir -p data
for wait in 10 20 40 0; do
  if git fetch -q --depth=1 origin data 2>/dev/null; then
    git show FETCH_HEAD:status.json > data/status.json
    exit 0
  fi
  git ls-remote --exit-code origin data >/dev/null 2>&1
  if [ $? -eq 2 ]; then
    echo "No data branch yet; starting fresh."
    exit 0
  fi
  [ "$wait" -gt 0 ] && { echo "Loading status failed, retrying in ${wait}s"; sleep "$wait"; }
done
echo "skip=true" >> "$GITHUB_OUTPUT"
echo "::warning::GitHub would not return the saved status; skipping this run so nothing is overwritten."
