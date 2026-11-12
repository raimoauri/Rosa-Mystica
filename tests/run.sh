#!/bin/bash
# Every test drives the real page in a browser and prints "ok "/"FAIL " lines.
# A file that prints neither did not pass — it crashed; that is reported, not swallowed.
cd "$(dirname "$0")"
tot=0; bad=0
node check.js >/dev/null && node --check _snippet.js || { echo "SYNTAX ERROR"; exit 1; }
for t in v*.js; do
  o=$(timeout 300 node "$t" 2>&1)
  f=$(printf '%s\n' "$o" | grep -c '^FAIL ')
  n=$(printf '%s\n' "$o" | grep -cE '^(ok|FAIL) ')
  tot=$((tot+n)); bad=$((bad+f))
  if [ "$n" -eq 0 ]; then st="CRASHED — look at it"; else
    st=$([ "$f" -gt 0 ] && echo "$f FAILED" || echo 'all ok'); fi
  printf '%-22s %3d checks  %s\n' "$t" "$n" "$st"
  [ "$f" -gt 0 ] && printf '%s\n' "$o" | grep '^FAIL ' | sed 's/^/      /'
done
echo "-----"; echo "$tot checks, $bad failures"
