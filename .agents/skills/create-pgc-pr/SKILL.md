---
name: create-pgc-pr
description: Create, prepare, update, or babysit focused PGC Tour pull requests. Use for branch preparation, scoped commits, rebasing, verification, evidence, GitHub PR titles and bodies, CI checks, or review comments in this repository.
---

# Create a PGC pull request

Read `AGENTS.md` first. Create one reviewable PR without absorbing unrelated work.

## Respect authority

- “Create/open a PR” authorizes the scoped branch, commit, push, and PR.
- “Prepare/draft/write a PR” authorizes only the proposed title and body unless the user also requests Git operations.
- Never merge, deploy, force-push, discard changes, or mutate production without separate authorization.
- Preserve unrelated staged, unstaged, and untracked work. Never use `git add .` or `git add -A` in a dirty tree.

## Prepare the change

1. Inspect `git status --short`, current branch, remotes, full staged/unstaged diffs, and recent history.
2. Identify the exact files and commits belonging to one concern. Stop if overlapping ownership cannot be determined safely.
3. Read the applicable maintained guide: league, architecture, or operations.
4. Review for secrets, production data, generated-file edits, missing tests/docs, and every applicable surface in `AGENTS.md`.
5. For UI changes, collect mobile and desktop before/after images; use a short recording for motion or timing. Ask before browser automation.

## Verify and commit

- Run the smallest focused tests, lint, formatting, typecheck, Convex IO, build, or bundle checks that prove the changed boundary. Run the full repository gate only when `AGENTS.md` or the user calls for it.
- Record commands and outcomes honestly; explain skipped checks and environment failures.
- Run `git diff --check`, inspect the final diff, stage explicit paths, and inspect the staged diff.
- Use a conventional, plain-language commit title consistent with repository history.

Before opening, fetch and rebase the clean scoped branch onto current `origin/main`. Resolve only understood conflicts and rerun affected checks. Ask before `--force-with-lease`; never use plain `--force`.

## Open the PR

Check whether the branch already has a PR. Use a conventional title, preferably under 72 characters. Keep the body concise:

```markdown
## Problem

What was wrong or missing.

## Solution

How the focused change fixes it and any material trade-off.

## Verification

- `command` — result

## Evidence

Before/after images or recording when applicable.
```

Push with upstream tracking, open against `main`, then confirm the base, head, title, body, and URL. Report the URL, branch, included concern, verification, evidence, and blockers. Do not merge.

When explicitly babysitting, inspect only checks and comments newer than the latest push; verify findings against source, fix real issues with focused tests, explain false positives, and stop when the latest commit is green with no actionable comments.
