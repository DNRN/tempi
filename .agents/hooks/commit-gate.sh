#!/usr/bin/env bash
# commit-gate.sh - PreToolUse gate that nudges code review AND documentation
# checks before `git commit`. One gate, one combined ask, independent waivers.
#
# Modes:
#   (stdin JSON)      plugin mode: Claude Code PreToolUse hook. Decide whether
#                     the attempted Bash command (a git commit) may proceed.
#                     Denies with a reason listing the pending check(s) and
#                     telling the agent to ask the user before committing.
#                     Allows when git's pre-commit hook runs the project's copy
#                     of this gate, so the user is asked once (docs/adr/0014).
#   --pre-commit      git hook mode: run by git's pre-commit hook in every
#                     harness and terminal. Checks the staged diff (git has
#                     already staged `commit -a` into its index), prints the
#                     same reason on stderr, and exits 1. See docs/adr/0013.
#   --stamp-review [--all] [dir]  record the reviewed diff in .git/review-stamp
#   --stamp-docs   [--all] [dir]  record the documentation-checked code diff in
#                                 .git/doc-stamp
#   --all hashes the worktree diff (`git diff HEAD`), matching `git commit -a`;
#   the default hashes the staged diff.
#
# Checks:
#   review  pending when the diff is non-empty and its hash (full or code-only)
#           is not stamped. Code-only hash: doc edits after a review do not
#           invalidate it; any code change does. Doc-only diffs have no
#           code-only hash, so each one is reviewed on its own.
#   docs    pending when the diff changes code without touching any doc, the
#           repo tracks at least one doc, and the code-diff hash is not
#           stamped. A commit that edits docs is evidence docs were considered.
#   adr     (--pre-commit only) a staged change to an Accepted ADR,
#           docs/adr/NNNN-*.md, outside its `## Status` section, or its
#           deletion or rename. No stamp: write a superseding ADR, or
#           --no-verify. See docs/adr/0015.
#
# What counts as a doc: git pathspecs in .commit-gate-docs at the repository
# root, one per line (`docs/`, `README.md`, `*.rst`, long-form magic such as
# `:(glob)docs/**`); blank lines and `#` comments ignored. Without the file:
# `*.md`. Everything else is code. See docs/adr/0004.
#
# Commit detection lives in parse-commit.py (chains, cd, git -C, git global
# options, combined short flags, sh -c, heredocs).
#
# Messages name the skills and the stamp command as installed: the project's
# copies (.agents/skills/<name>, .agents/hooks/commit-gate.sh) when present,
# the plugin's otherwise.
#
# Design: fail-open. Any unexpected state (no stdin, no python3, not a repo,
# parse error, git error) allows the commit. This is a nudge, not enforcement:
# `--no-verify` always bypasses. See docs/adr/0002, 0003, 0004, and 0013.
set -u

SCRIPT_PATH="$0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

hash_of() { { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1; }

# load_docs <toplevel>: set DOCS (pathspecs that count as docs) and CODE_ONLY
# (diff arguments excluding them) from <toplevel>/.commit-gate-docs. Stamping
# and checking both call this, so their code-only hashes always agree.
load_docs() {
  local line
  DOCS=()
  if [ -f "$1/.commit-gate-docs" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"
      case "$line" in ''|'#'*) continue ;; esac
      DOCS+=("$line")
    done < "$1/.commit-gate-docs"
  fi
  [ "${#DOCS[@]}" -gt 0 ] || DOCS=('*.md')
  CODE_ONLY=(-- .)
  for line in "${DOCS[@]}"; do
    case "$line" in
      ':('*) CODE_ONLY+=(":(exclude,${line#:(}") ;;
      *) CODE_ONLY+=(":(exclude)$line") ;;
    esac
  done
}

# diff_hashes <toplevel> <diff-kind>: print the full-diff hash, then the
# code-only hash when the code-only diff is non-empty. An empty code-only diff
# hashes to one constant shared by every doc-only change; stamping it would
# approve all future doc-only diffs.
diff_hashes() {
  local top="$1" kind="$2" rc
  git -C "$top" diff "$kind" 2>/dev/null | hash_of
  git -C "$top" diff "$kind" --quiet "${CODE_ONLY[@]}" 2>/dev/null
  rc=$?
  if [ "$rc" -eq 1 ]; then
    git -C "$top" diff "$kind" "${CODE_ONLY[@]}" 2>/dev/null | hash_of
  fi
}

stamp_mode() { # $1=flag $2=stamp-name, remaining: [--all] [dir]
  local flag="$1" name="$2" kind=--cached dir="$PWD" top git_dir
  shift 2
  if [ "${1:-}" = --all ]; then kind=HEAD; flag="$flag --all"; shift; fi
  [ $# -gt 0 ] && dir="$1"
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || exit 0
  git_dir="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
  load_docs "$top"
  diff_hashes "$top" "$kind" > "$git_dir/$name"
  echo "stamped $flag in $git_dir/$name"
  exit 0
}

case "${1:-}" in
  --stamp-review) shift; stamp_mode --stamp-review review-stamp "$@" ;;
  --stamp-docs)   shift; stamp_mode --stamp-docs   doc-stamp    "$@" ;;
esac

# pending_checks <top> <git-dir> <diff-kind>: set review_pending and
# docs_pending (yes/no). Returns 1 when there is nothing to check: an empty
# diff (allow-empty commits, merge continuations, nothing staged) or any git
# error (e.g. `commit -a` before the first commit), so callers fail open.
pending_checks() {
  local top="$1" git_dir="$2" kind="$3" full_hash code_hash docs_touched
  load_docs "$top"
  git -C "$top" diff "$kind" --quiet 2>/dev/null
  [ $? -eq 1 ] || return 1

  { IFS= read -r full_hash; IFS= read -r code_hash || code_hash=""; } <<EOF
$(diff_hashes "$top" "$kind")
EOF
  [ "${#full_hash}" -ge 8 ] || return 1  # hash failed -> fail open

  docs_touched=no
  if [ -n "$(git -C "$top" diff "$kind" --name-only -- "${DOCS[@]}" 2>/dev/null)" ]; then
    docs_touched=yes
  fi

  # Review: pending unless the full or the code-only hash is stamped.
  review_pending=yes
  if stamped "$git_dir" review-stamp "$full_hash" || { [ -n "$code_hash" ] && stamped "$git_dir" review-stamp "$code_hash"; }; then
    review_pending=no
  fi

  # Docs: pending when code changed, no doc did, the repo has docs, and the
  # code-only hash is not stamped.
  docs_pending=no
  if [ -n "$code_hash" ] && [ "$docs_touched" = no ]; then
    if git -C "$top" ls-files -- "${DOCS[@]}" 2>/dev/null | grep -q .; then
      docs_pending=yes
      stamped "$git_dir" doc-stamp "$code_hash" && docs_pending=no
    fi
  fi
  return 0
}

stamped() { [ -f "$1/$2" ] && grep -qxF -e "$3" "$1/$2" 2>/dev/null; }

# skill_ref <top> <name>: how to invoke a skill, as installed.
skill_ref() {
  if [ -d "$1/.agents/skills/$2" ]; then
    printf 'the %s skill' "$2"
  else
    printf '/afk:%s' "$2"
  fi
}

# deny_reason <top> <diff-kind>: the denial text for the pending checks.
deny_reason() {
  local top="$1" kind="$2" target stamp_all scope script pending="" actions=""
  if [ "$kind" = HEAD ]; then
    target=" worktree"; stamp_all=" --all"; scope="git commit -a: staged and unstaged changes"
  else
    target=""; stamp_all=""; scope="staged changes"
  fi
  script="$SCRIPT_PATH"
  [ -f "$top/.agents/hooks/commit-gate.sh" ] && script="$top/.agents/hooks/commit-gate.sh"
  script="$(printf '%q' "$script")"
  top="$(printf '%q' "$top")"

  [ "$review_pending" = yes ] && pending="${pending}code review (unreviewed changes); "
  [ "$docs_pending" = yes ] && pending="${pending}documentation (code changes with no documentation updates); "
  pending="${pending%; }"

  [ "$review_pending" = yes ] && actions="${actions}run $(skill_ref "$1" code-review)${target}, then stamp: bash $script --stamp-review${stamp_all} $top. "
  [ "$docs_pending" = yes ] && actions="${actions}run $(skill_ref "$1" doc-sync)${target}, then stamp: bash $script --stamp-docs${stamp_all} $top. "

  printf '%s' "Pending before commit ($scope): $pending. Ask the user: 'Run code review / documentation check before committing?' If agreed: $actions For waived checks, rerun the commit with --no-verify."
}

# git_hook_installed <top>: true when git's pre-commit hook runs the project's
# copy of this gate (it names agents/hooks/commit-gate.sh, ADR 0014) and that
# copy exists. The plugin mode then allows: the git hook asks instead, once.
git_hook_installed() {
  local hook
  [ -f "$1/.agents/hooks/commit-gate.sh" ] || return 1
  hook="$(git -C "$1" rev-parse --git-path hooks/pre-commit 2>/dev/null)" || return 1
  case "$hook" in /*|[A-Za-z]:*) ;; *) hook="$1/$hook" ;; esac
  [ -f "$hook" ] && [ -x "$hook" ] && grep -qF 'agents/hooks/commit-gate.sh' "$hook" 2>/dev/null
}

# without_status: an ADR on stdin, carriage returns and the `## Status`
# section (its heading up to the next `## ` heading) removed.
without_status() {
  tr -d '\r' | awk '/^## /{ skip = ($0 ~ /^## Status[[:space:]]*$/) } !skip'
}

# accepted: true when the ADR on stdin has a `## Status` section whose first
# non-blank line starts with `Accepted`. Any other shape is not Accepted, so
# the check fails open on formats it doesn't know.
accepted() {
  tr -d '\r' | awk '
    /^## / { if (in_status) exit; in_status = ($0 ~ /^## Status[[:space:]]*$/); next }
    in_status && NF { found = ($0 ~ /^Accepted/); exit }
    END { exit !found }'
}

# adr_violations <top>: print each staged change to an Accepted ADR that ADR
# 0015 denies, one per line ("<path> (edited|deleted|renamed)"). Prints
# nothing on any git error (no HEAD yet, not a repo): fail open.
adr_violations() {
  local top="$1" st path old
  git -C "$top" diff --cached -z --name-status -M HEAD -- 'docs/adr/' 2>/dev/null |
    while IFS= read -r -d '' st; do
      case "$st" in
        R*|C*) IFS= read -r -d '' old || break; IFS= read -r -d '' path || break ;;
        *) IFS= read -r -d '' old || break; path="$old" ;;
      esac
      case "$st" in M|D|R*) ;; *) continue ;; esac
      case "${old##*/}" in [0-9][0-9][0-9][0-9]-*.md) ;; *) continue ;; esac
      [ "${old%/*}" = docs/adr ] || continue
      git -C "$top" show "HEAD:$old" 2>/dev/null | accepted || continue
      case "$st" in
        D) echo "$old (deleted)" ;;
        R*) echo "$old (renamed to $path)" ;;
        M)
          if [ "$(git -C "$top" show "HEAD:$old" 2>/dev/null | without_status | hash_of)" != \
               "$(git -C "$top" show ":$old" 2>/dev/null | without_status | hash_of)" ]; then
            echo "$old (edited outside Status)"
          fi ;;
      esac
    done
}

# --- git hook mode ----------------------------------------------------------
if [ "${1:-}" = --pre-commit ]; then
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
  git_dir="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
  adrs="$(adr_violations "$top")"
  adr_reason=""
  if [ -n "$adrs" ]; then
    adr_reason="Accepted ADRs are immutable (docs/adr/0015): ${adrs//$'\n'/; }. Only an ADR's Status section may change after it is Accepted. Revert these changes, write a superseding ADR with the adr-planning skill, and change only the old ADR's Status (Superseded by NNNN). If the user says to commit them anyway, rerun the commit with --no-verify."
  fi
  review_pending=no; docs_pending=no
  pending_checks "$top" "$git_dir" --cached || { review_pending=no; docs_pending=no; }
  if [ "$review_pending" = no ] && [ "$docs_pending" = no ]; then
    [ -n "$adr_reason" ] || exit 0
    echo "commit-gate: $adr_reason" >&2
    exit 1
  fi
  # The hook can't see `-a`: git commits from its own index file then. Name
  # the staged stamp when the user's index (what --stamp-review hashes) holds
  # this diff, the --all stamp otherwise; it matches under `commit -a`.
  kind=--cached
  if [ "$(git -C "$top" diff --cached 2>/dev/null | hash_of)" != \
       "$(GIT_INDEX_FILE="$git_dir/index" git -C "$top" diff --cached 2>/dev/null | hash_of)" ]; then
    kind=HEAD
  fi
  echo "commit-gate: $(deny_reason "$top" "$kind")" >&2
  [ -z "$adr_reason" ] || echo "commit-gate: $adr_reason" >&2
  exit 1
fi

# --- plugin mode ------------------------------------------------------------
input="$(cat 2>/dev/null)" || exit 0
[ -n "$input" ] || exit 0
# The hook runs on every Bash call. A command that runs `git commit` contains
# the word, so anything else exits here without spawning python3.
case "$input" in *commit*) ;; *) exit 0 ;; esac
# JSON and command parsing via python3 only (single code path). No python3 ->
# the gate cannot run -> fail open; a missing parser must not wedge commits.
command -v python3 >/dev/null 2>&1 || exit 0

# Only gate commit commands; everything else (and explicit bypasses) passes.
parsed="$(printf '%s' "$input" | python3 "$SCRIPT_DIR/parse-commit.py" 2>/dev/null)" || exit 0
{ IFS= read -r dir && IFS= read -r diff_kind; } <<EOF || exit 0
$parsed
EOF

top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || exit 0
git_dir="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
git_hook_installed "$top" && exit 0
pending_checks "$top" "$git_dir" "$diff_kind" || exit 0
[ "$review_pending" = yes ] || [ "$docs_pending" = yes ] || exit 0

python3 -c '
import json, sys
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
    "permissionDecision": "deny", "permissionDecisionReason": sys.argv[1]}}))' "$(deny_reason "$top" "$diff_kind")" 2>/dev/null
exit 0
