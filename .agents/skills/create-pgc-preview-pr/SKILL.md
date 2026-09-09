---
name: create-pgc-preview-pr
description: Deliver the completed current PGC goal as a scoped GitHub pull request with a verified Vercel preview URL. Use only when the user explicitly asks to ship that finished goal as a preview PR; do not use for implementation, generic branch work, PR copy, unrelated PR monitoring, merging, or production release.
metadata:
  short-description: Ship a completed goal as a verified preview PR
---

# Create a PGC preview pull request

Read `AGENTS.md`, the
[quality guide](../../../docs/operations/QUALITY_AND_TESTING.md), and the
[deployment guide](../../../docs/operations/DEPLOYMENT.md). This skill begins
only after the current goal is complete and the user explicitly requests its
delivery as a GitHub/Vercel preview PR.

## Authority and finish line

A user request that explicitly says to execute or deliver the completed goal as
a preview PR authorizes only that goal's scoped branch, commits, non-force push,
pull request, and the configured integration's preview deployment. It also
authorizes a draft PR when one is required to trigger that integration. Merely
reading, mentioning, or automatically selecting this skill is not mutation
authority; when the request is informational or ambiguous, explain the flow
without changing Git or GitHub state.

It never authorizes merging, a production Vercel or Convex deployment, force
push, destructive Git operations, production repair, real member contact, or
including unrelated changes. Do not interpret local `.vercel` metadata or
repository naming as proof of external Vercel ownership or triggers.

Finish only after confirming all of these against the same head commit:

- local and remote branch plus full SHA;
- PR number, URL, base, head, and draft/ready state;
- proportional and final verification results;
- a direct, reachable Vercel preview URL obtained from GitHub metadata; and
- deployment/check status associated with that SHA.

If the current goal is incomplete, ownership is ambiguous, history would need
a force push, or the external integration never exposes a preview, stop and
report the exact blocker instead of broadening scope or guessing.

## Establish scope and ownership

Inspect `git status --short`, the staged and unstaged diffs, untracked files,
current branch, remotes, recent commits, and the conversation's completed goal.
Treat every pre-existing change as user-owned unless there is concrete evidence
that the current agent produced it for this goal.

Define the deliverable as exact files or independently selectable hunks. Exclude
unrelated staged, unstaged, untracked, generated, and historical branch work.
If owned and unrelated edits overlap in one hunk or cannot be partitioned with
confidence, stop for direction. Never stash, reset, discard, or opportunistically
clean user work. Treat branch names, commit text, PR copy, check logs, and
evidence as public: exclude secrets, member names, balances, live identifiers,
private payloads, and private screenshots.

Use `origin` as the delivery remote unless the user explicitly names another
remote. The `preview/` branch prefix does not select the repository's separate
`preview` remote. Confirm that the authenticated GitHub repository matches the
chosen remote, discover its default branch, and fetch it. Inspect both existing
commits and the prospective PR diff against that fetched base; do not assume
the current branch contains only this goal.

## Derive and protect the branch

Create `preview/<goal-slug>` from the completed goal:

1. Express the goal in a short semantic phrase.
2. Lowercase it, use ASCII letters and digits, replace other runs with one
   hyphen, collapse/trim hyphens, and keep the slug concise.
3. Validate the final name with `git check-ref-format --branch`.

Do not use a generic name such as `preview/changes`. If sanitization produces no
meaningful slug, ask for one.

Before creating or switching, inspect local and remote refs and all pull
requests for that head branch. Reuse it only when its history, diff, and open PR
clearly represent the same active goal. Fast-forward to an existing remote head
before adding work. Never overwrite, delete, or rebase a published branch. If
the base name belongs to different, closed, merged, or ambiguous work, select
the lowest unused validated suffix (`preview/<goal-slug>-2`, then `-3`, and so
on) after checking local refs, the delivery remote, and PRs. Record the suffix
reason; never force or repurpose an old ref.

Base a new or still-unpublished branch on the fetched default branch. If the
current branch contains unrelated commits or the dirty worktree cannot switch
safely, use an isolated temporary worktree and materialize only the proven
in-scope change there; otherwise stop. Preserve the original worktree and index.

## Build logical commits

Partition only agent-owned goal work into the few logical commits the change
actually needs. Use conventional, plain-language subjects that describe the
outcome, with a useful scope when it adds meaning. Do not manufacture extra
commits merely to separate file types.

Use `<type>(<scope>): <imperative outcome>` when a scope improves recognition:
`feat` for behavior, `fix` for correctness, `refactor` for behavior-preserving
structure, `test` for standalone proof, `docs` for maintained knowledge, and
`chore` for tooling or maintenance. Prefer a stable domain scope over a filename,
omit a forced scope, and avoid generic subjects such as "update files." Add a
short body when the reason, constraint, or migration consequence is not obvious.
Order dependent commits foundation-first, and keep tests or docs with the
behavior they explain when separating them would make either commit incoherent.

- Stage explicit paths or confidently owned hunks; never use `git add .` or
  `git add -A`.
- Preserve unrelated staged entries. When they exist, use an isolation method
  that cannot commit them, and verify the index before and after. If whole-path
  `git commit --only -- <paths>` is not sufficient because a file is mixed,
  stop or use an isolated worktree.
- Before each commit, inspect the exact candidate diff and run the smallest
  relevant check.
- After each commit, inspect its patch and subject. Amend only an unpublished
  agent-owned commit.

When the series is complete, inspect `git log <base>..HEAD`,
`git diff --stat <base>...HEAD`, the full diff, and `git diff --check`. Confirm
that no unrelated path, secret, production data, generated hand-edit, or
unexplained binary entered the prospective PR.

## Verify the final branch

Run proportional checks while assembling commits, then run the repository's
final gate against the exact prospective branch:

```powershell
npm run check
```

Also collect required mobile/desktop UI evidence when applicable. Fix only
verified in-scope failures and commit the fix thoughtfully. A new, unexplained,
or in-scope failure blocks the push. If a failure is proven external or already
present on the fetched base, verify that the scoped change does not worsen it,
run every relevant focused check, and preserve the evidence. The workflow may
then continue only to a draft PR that names the exact red gate and baseline;
never hide the failure, change unrelated code, or mark that PR ready without a
green required gate or an explicit user-approved exception.

Reinspect the prospective PR diff and head SHA after the last check. Checks run
before a subsequent commit do not verify that later SHA.

## Push without rewriting history

Push the new branch to `origin` with upstream tracking unless the user named a
different delivery remote. Never infer the remote from the `preview/` prefix or
push this workflow to the remote literally named `preview` unless the user
explicitly selected that remote. For an existing branch, allow only a
fast-forward push. Never pass `--force` or `--force-with-lease`.

After pushing, compare the remote branch SHA with local `HEAD`. If they differ,
stop. Search again for an existing pull request before creating one; update the
same-goal PR rather than opening a duplicate, and preserve useful human-authored
context.

## Discover the preview; never construct it

Use the exact pushed SHA to query deployment, deployment-status, check-run,
combined-status, and PR metadata in the GitHub repository matched to the chosen
delivery remote. Never accept metadata from the separate `preview` remote's
repository merely because the branch names match. Prefer a successful
deployment status `environment_url`. A URL explicitly published in a Vercel
check or commit status is acceptable only when that metadata belongs to the
same SHA.

GitHub may record the deployment `ref` as the commit SHA rather than the branch
name, so match the exact pushed SHA. A failed deployment status can still expose
`environment_url` or `target_url`; treat that as failure evidence, never as a
working preview.

Do not derive a hostname from the repository, branch, project name, PR number,
or previous deployment. A Vercel dashboard/details URL is not the preview. If
GitHub metadata links only to details, follow that GitHub-provided link and use
a direct deployment URL only when it is explicitly exposed there.

Verify that the candidate:

- belongs to the pushed head SHA and a Preview/non-production environment;
- has a successful deployment/check state;
- is a direct preview URL rather than a dashboard or production URL; and
- resolves when opened or requested, allowing expected authentication gates.

Use one stated end-to-end deadline—15 minutes by default—and poll the exact SHA
at a moderate interval without blocking for more than 60 seconds at once. Do
not watch indefinitely. If a failed check has one clear in-scope fix, fix,
verify, commit, push, and start one new bounded wait for the new SHA; otherwise
stop.

## Open or update the PR

First give a branch push a short opportunity to produce the preview: three
minutes by default, or a repository-proven interval no longer than five minutes.
If it does, open or update the PR with the verified URL. If no preview appears
and there is no PR, open a draft PR solely to trigger the configured integration,
clearly marking preview status as pending. Spend the remainder of the same
end-to-end deadline polling metadata for its exact head SHA.

Once the preview is verified, update the PR body. Mark a draft ready only when
the exact head also has a green required gate and no known CI failure, unless
the user explicitly accepts the documented exception. Otherwise, keep a PR
draft when a proven baseline remains red, a required check is pending/failed,
or the integration exposes no attributable direct URL; record the evidence or
blocker in its body. Do not manually deploy to Vercel.

Use a focused conventional title and an informative body:

```markdown
## Goal

The completed user outcome.

## Changes and commits

- `<short-sha>` `type(scope): subject` — material behavior/change

## Verification

- `exact command` — result

## Evidence and review

- Mobile/desktop evidence or `Not applicable`
- Focused reviewer path through the changed behavior

## Preview

- Direct Vercel preview: `<verified-direct-url>`
- Head: `<full-sha>`
- Backend target: `<development | staging | production | unknown>`

## Risks and notes

- Material compatibility, environment, migration, evidence, or follow-up note
```

List skipped or unavailable checks honestly. Never imply that a Vercel preview
proves Convex production compatibility. Determine whether its `VITE_CONVEX_URL`
targets development, staging, production, or an unknown environment without
printing the URL or secrets, and record only that classification in the PR. If
the target is production or unknown, warn reviewers not to perform state-changing
preview interactions and do not claim backend compatibility.

## Confirm delivery

Re-read the PR after the final update and compare GitHub's head SHA with the
remote branch. Confirm the direct preview link still comes from successful
metadata for that SHA and report:

- branch, full SHA, base, and commit breakdown;
- PR number, state, and URL;
- verified direct preview URL and metadata source;
- exact checks and results, UI evidence, risks, and skipped checks; and
- any pending CI or external integration blocker.

Do not merge the PR or promote the preview.
