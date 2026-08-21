#!/usr/bin/env bash
# deploy-branch: main
set -euo pipefail

echo "::deploy:target=pages:start"
if [[ "${DEPLOY_DRY_RUN:-}" = 1 ]]; then
  echo "would: git push origin main"
else
  git push origin main
fi
# GitLab Pages deploys via the `pages` job in .gitlab-ci.yml on push to main.
# No watch — the router skips workflow-watch for GitLab hosts.
echo "::deploy:target=pages:url=https://michaellambgelo.gitlab.io/jxnfilmclub-trivia/"
echo "::deploy:target=pages:end:status=ok"
