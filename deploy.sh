#!/usr/bin/env bash
# Dali Party — one-command deploy: commit local changes + push to GitHub.
# The VPS auto-pulls within ~1 minute (systemd timer dali-deploy.timer).
cd "$(dirname "$0")" || exit 1
msg="${*:-update}"
echo "=== Pushing to GitHub: \"$msg\" ==="
git add -A
git commit -m "$msg" || echo "(nothing new to commit)"
if git push origin main; then
  echo "=== Done! Server auto-updates within ~1 min → https://dalipart.tranhdali.vn ==="
else
  echo "*** PUSH FAILED — check network / GitHub auth ***" >&2
  exit 1
fi
