#!/usr/bin/env bash
# create-pr.sh — opens a GitHub PR for the current feature branch via `gh`.
#
# Used by Step 9 ("Wrap up") of .claude/skills/feature-enhancement/SKILL.md
# when the user asks for a PR to be opened for the branch Step 4 created —
# opening one is always offered, never done unasked, per that step.
#
# Usage:
#   create-pr.sh <JIRA-ID> "<PR title>" [base-branch] [<<'EOF' ... EOF]
#
# Arguments:
#   JIRA-ID     Required. e.g. NTA-9. Used to build the PR title prefix
#               and the Jira link in the default body.
#   PR title    Required. Short plain-language description, e.g.
#               "Registry plugin lifecycle". The actual PR title becomes
#               "<JIRA-ID>: <PR title>".
#   base-branch Optional. Defaults to "develop" (this repo's working
#               branch — main is reserved for releases).
#
# Body: piped in via stdin (a heredoc, matching how the skill already
# builds PR bodies), e.g.:
#
#   .claude/skills/feature-enhancement/scripts/create-pr.sh NTA-9 "Registry plugin lifecycle" <<'EOF'
#   ## Jira
#   [NTA-9](https://sandeep12biswas.atlassian.net/browse/NTA-9)
#
#   ## Summary
#   ...
#   EOF
#
# If stdin isn't piped (e.g. run interactively with nothing redirected in),
# a minimal default body (just the Jira link) is used instead of blocking
# on input.
#
# The current branch is used as the PR head — refuses to run from
# develop/main, since a PR should come from a feature branch (Step 4).

set -euo pipefail

usage() {
  sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'
}

if [[ $# -lt 2 || $# -gt 3 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 1
fi

jira_id="$1"
pr_title_suffix="$2"
base_branch="${3:-develop}"
jira_base_url="https://sandeep12biswas.atlassian.net/browse"

if [[ ! "$jira_id" =~ ^[A-Za-z]+-[0-9]+$ ]]; then
  echo "error: '$jira_id' doesn't look like a Jira issue key (expected e.g. NTA-9)" >&2
  exit 1
fi
jira_id_upper="$(echo "$jira_id" | tr '[:lower:]' '[:upper:]')"

# --- Resolve a working `gh` binary --------------------------------------
# The `gh` on PATH can be a snap launcher that silently no-ops in a
# sandboxed environment (exits 0, prints nothing, doesn't actually run gh).
# Detect that and fall back to the real binary git itself already uses
# for GitHub auth (via credential.https://github.com.helper).
resolve_gh() {
  if command -v gh >/dev/null 2>&1; then
    local version
    version="$(gh --version 2>/dev/null || true)"
    if [[ -n "$version" ]]; then
      echo "gh"
      return
    fi
  fi

  local helper
  helper="$(git config --get 'credential.https://github.com.helper' 2>/dev/null || true)"
  if [[ "$helper" =~ ^\![[:space:]]*(.+)[[:space:]]+auth[[:space:]]+git-credential[[:space:]]*$ ]]; then
    local candidate="${BASH_REMATCH[1]}"
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  fi

  echo "error: no working 'gh' binary found (the one on PATH produced no output" >&2
  echo "       and no usable fallback was found via git's credential helper config)." >&2
  exit 1
}

GH="$(resolve_gh)"

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "error: '$GH' is not authenticated. Run '$GH auth login' first." >&2
  exit 1
fi

# --- Resolve head branch --------------------------------------------------
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

head_branch="$(git branch --show-current)"
if [[ -z "$head_branch" ]]; then
  echo "error: not on a branch (detached HEAD) — checkout the feature branch first." >&2
  exit 1
fi
if [[ "$head_branch" == "$base_branch" || "$head_branch" == "main" ]]; then
  echo "error: refusing to open a PR from '${head_branch}' — checkout the feature" >&2
  echo "       branch this story's work is on (see: scripts/create-feature-branch.sh)." >&2
  exit 1
fi

# --- Body: from stdin if piped, otherwise a minimal default --------------
if [[ -t 0 ]]; then
  body="Jira: [${jira_id_upper}](${jira_base_url}/${jira_id_upper})"
else
  body="$(cat)"
fi

title="${jira_id_upper}: ${pr_title_suffix}"

echo "Opening PR: '${head_branch}' -> '${base_branch}'..."
"$GH" pr create \
  --base "$base_branch" \
  --head "$head_branch" \
  --title "$title" \
  --body "$body"
