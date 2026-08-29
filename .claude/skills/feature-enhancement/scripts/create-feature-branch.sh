#!/usr/bin/env bash
# create-feature-branch.sh — Jira-driven feature branch setup.
#
# Mirrors Step 4 ("Branch setup") of .claude/skills/feature-enhancement/SKILL.md:
# resolve/import the base branch, refuse to touch a dirty working tree, then
# cut feature/<issue-key>[-<slug>] off it.
#
# Usage:
#   .claude/skills/feature-enhancement/scripts/create-feature-branch.sh <JIRA-ID> "<short description>" [base-branch]
#
# Arguments:
#   JIRA-ID           Required. e.g. NTA-23. Matches [A-Za-z]+-[0-9]+.
#   short description Optional. A few words from the story, e.g. "dark mode toggle".
#                      Slugified into the branch name. Pass "" to omit it.
#   base-branch        Optional. Defaults to "develop" (this repo's working
#                      branch — main is reserved for PRs/releases).
#
# Examples:
#   .claude/skills/feature-enhancement/scripts/create-feature-branch.sh NTA-23 "dark mode toggle"
#     -> feature/nta-23-dark-mode-toggle, off develop
#   .claude/skills/feature-enhancement/scripts/create-feature-branch.sh NTA-23 "dark mode toggle" feature/working-app-v2
#     -> feature/nta-23-dark-mode-toggle, off feature/working-app-v2
#   .claude/skills/feature-enhancement/scripts/create-feature-branch.sh NTA-23 ""
#     -> feature/nta-23, off develop

set -euo pipefail

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

if [[ $# -lt 1 || $# -gt 3 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 1
fi

jira_id="$1"
description="${2:-}"
base_branch="${3:-develop}"

if [[ ! "$jira_id" =~ ^[A-Za-z]+-[0-9]+$ ]]; then
  echo "error: '$jira_id' doesn't look like a Jira issue key (expected e.g. NTA-23)" >&2
  exit 1
fi

slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

issue_key_lower="$(slugify "$jira_id")"
slug="$(slugify "$description")"

if [[ -n "$slug" ]]; then
  feature_branch="feature/${issue_key_lower}-${slug}"
else
  feature_branch="feature/${issue_key_lower}"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

# --- Check for uncommitted local changes before touching anything ---------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: you have uncommitted changes. Commit, stash, or discard them" >&2
  echo "       before creating a new feature branch:" >&2
  echo >&2
  git status --short >&2
  exit 1
fi

# --- Resolve/import the base branch ----------------------------------------
echo "Fetching '${base_branch}' from origin..."
if ! git fetch origin "$base_branch"; then
  echo "error: '${base_branch}' doesn't exist on origin either." >&2
  echo "       Pass an existing branch as the 3rd argument, or push it first." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${base_branch}"; then
  echo "Fast-forwarding local '${base_branch}'..."
  git checkout "$base_branch"
  git pull --ff-only origin "$base_branch"
else
  echo "Creating local '${base_branch}' tracking origin/${base_branch}..."
  git checkout -b "$base_branch" "origin/${base_branch}"
fi

# --- Create the feature branch ---------------------------------------------
if git show-ref --verify --quiet "refs/heads/${feature_branch}"; then
  if [[ -t 0 ]]; then
    read -r -p "Branch '${feature_branch}' already exists locally. Check it out (resume) instead of creating it? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      git checkout "$feature_branch"
      echo "Resumed existing branch '${feature_branch}'."
      exit 0
    fi
    echo "error: pick a different description, or delete the existing branch first." >&2
    exit 1
  else
    echo "error: branch '${feature_branch}' already exists locally." >&2
    echo "       Run 'git checkout ${feature_branch}' to resume it, delete it first," >&2
    echo "       or pass a different description to get a different branch name." >&2
    exit 1
  fi
fi

git checkout -b "$feature_branch" "$base_branch"
echo
echo "Created '${feature_branch}' off '${base_branch}'."
