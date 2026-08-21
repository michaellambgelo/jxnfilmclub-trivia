#!/usr/bin/env bash
# deploy-branch: main
set -euo pipefail

echo "::deploy:target=worker:start"
if [[ "${DEPLOY_DRY_RUN:-}" = 1 ]]; then
  echo "would: git push origin main"
else
  git push origin main
fi
# Cloudflare Workers builds on push to main via the GitHub integration: it runs
# `npm run build`, then `npx wrangler deploy`, which reads wrangler.jsonc and
# uploads dist/ as static assets. No watch line — the build runs in Cloudflare,
# not GitHub Actions, so there is no workflow for `gh run watch` to follow.
echo "::deploy:target=worker:url=https://jxnfilmclub-trivia.michaellamb.workers.dev"
echo "::deploy:target=worker:end:status=ok"
