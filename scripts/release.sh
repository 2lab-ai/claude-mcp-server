#!/usr/bin/env bash
# One-command release helper for claude-mcp-server.
# - Bumps patch version by default (or use: scripts/release.sh X.Y.Z)
# - Syncs package.json, package-lock.json
# - Commits, tags, pushes, runs npm publish (uses OTP if NPM_OTP is set)
# Prereqs: git clean tree, npm login, 2FA token (set NPM_OTP)

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")

REQUESTED_VERSION="${1:-}"
LAST_COMMIT_SUMMARY=$(git log -1 --pretty=%B | head -n1)
LAST_RELEASE_VERSION=""
if [[ "$LAST_COMMIT_SUMMARY" =~ ^Release[[:space:]]v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  LAST_RELEASE_VERSION="${BASH_REMATCH[1]}"
fi

REUSE_EXISTING_RELEASE=0
NEW_VERSION=""

if [[ -z "$REQUESTED_VERSION" && -n "$LAST_RELEASE_VERSION" && "$LAST_RELEASE_VERSION" == "$CURRENT_VERSION" ]]; then
  REUSE_EXISTING_RELEASE=1
  NEW_VERSION="$CURRENT_VERSION"
  echo "Latest commit already bumped to v$NEW_VERSION; retrying publish without changing version."
fi

if [[ $REUSE_EXISTING_RELEASE -eq 0 ]]; then
  if [[ -n "$REQUESTED_VERSION" ]]; then
    NEW_VERSION="$REQUESTED_VERSION"
  else
    IFS=. read -r MAJ MIN PATCH <<<"$CURRENT_VERSION"
    PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJ.$MIN.$PATCH"
  fi

  if git tag -l "v$NEW_VERSION" >/dev/null 2>&1 && git tag -l "v$NEW_VERSION" | grep -q .; then
    echo "Tag v$NEW_VERSION already exists" >&2
    exit 1
  fi
fi

echo "Version: $CURRENT_VERSION -> $NEW_VERSION"

if [[ $REUSE_EXISTING_RELEASE -eq 0 ]]; then
  npm version "$NEW_VERSION" --no-git-tag-version
  git add package.json package-lock.json
  git commit -m "Release v$NEW_VERSION"
  git tag "v$NEW_VERSION"
else
  if ! git tag -l "v$NEW_VERSION" | grep -q .; then
    git tag "v$NEW_VERSION"
  fi
fi

git push
git push origin "v$NEW_VERSION"

OTP_ARG=""
if [[ -n "${NPM_OTP:-}" ]]; then
  OTP_ARG="--otp=$NPM_OTP"
fi

PUBLISH_LOG=$(mktemp)
TEMP_NPMRC=$(mktemp)

if [[ -z "${NPM_TOKEN:-}" ]]; then
  if ! npm whoami >/dev/null 2>&1; then
    echo "No NPM_TOKEN and not logged in; running npm login --auth-type=web once..."
    npm login --auth-type=web
  fi
fi

if [[ -n "${NPM_TOKEN:-}" ]]; then
  {
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}"
    echo "registry=https://registry.npmjs.org/"
  } >"$TEMP_NPMRC"
  export NPM_CONFIG_USERCONFIG="$TEMP_NPMRC"
  echo "Using NPM_TOKEN for auth via temp npmrc."
fi

echo "Publishing to npm..."
if npm publish --access public $OTP_ARG >"$PUBLISH_LOG" 2>&1; then
  cat "$PUBLISH_LOG"
else
  if grep -qi "Please try logging in again" "$PUBLISH_LOG"; then
    echo "npm auth expired or revoked. Running npm login then retrying publish..."
    cat "$PUBLISH_LOG"
    npm login
    npm publish --access public $OTP_ARG
  elif grep -qi "EOTP" "$PUBLISH_LOG" || grep -qi "one-time password" "$PUBLISH_LOG"; then
    cat "$PUBLISH_LOG"
    if [[ -n "${NPM_TOKEN:-}" ]]; then
      echo "npm publish requires an OTP even with NPM_TOKEN; aborting." >&2
      exit 1
    fi
    if [[ -n "${NPM_OTP:-}" ]]; then
      echo "Retrying npm publish with provided NPM_OTP..."
      npm publish --access public --otp="$NPM_OTP"
    else
      echo "npm publish requires an OTP. Set NPM_OTP=<code> or provide NPM_TOKEN and rerun." >&2
      exit 1
    fi
  else
    cat "$PUBLISH_LOG" >&2
    exit 1
  fi
fi
rm -f "$PUBLISH_LOG"
rm -f "$TEMP_NPMRC"

echo "Released v$NEW_VERSION"
