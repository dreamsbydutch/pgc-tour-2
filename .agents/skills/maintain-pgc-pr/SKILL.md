---
name: maintain-pgc-pr
description: Inspect, explain, update, or babysit an already-existing PGC GitHub pull request, including PR title or body, CI/check failures, Vercel status, review comments, and explicitly requested follow-up fixes. Use for PR status, failed checks, review feedback, or copy maintenance; do not use to create the initial branch, commits, push, preview deployment, or pull request.
metadata:
  short-description: Maintain and babysit an existing PGC pull request
---

# Maintain an existing PGC pull request

Read `AGENTS.md`, the
[quality guide](../../../docs/operations/QUALITY_AND_TESTING.md), and the wiki
pages for the PR's affected domains. Keep every conclusion tied to the PR's
current head commit.

## Stay inside the existing PR

This skill begins only after a PGC pull request exists. Resolve the exact
repository and PR from a supplied URL or number. Inferring it from the current
branch is acceptable only when the branch maps unambiguously to one PR in the
authenticated repository.

If no matching PR exists, stop. Do not create its branch, initial commits,
initial push, preview deployment, or pull request; completed-goal delivery
belongs to `$create-pgc-preview-pr`.

Authority is request-specific:

- Inspecting, explaining, or babysitting authorizes read-only GitHub and local
  source inspection. It does not authorize fixes, check reruns, comments, or
  metadata changes.
- Updating a title/body or other PR metadata requires an explicit request for
  that mutation. Change only the requested fields and preserve useful
  human-authored context.
- Editing code, committing, or pushing follow-up fixes requires an explicit
  request to apply those fixes to the existing PR. A request to assess a
  failure or review comment is not permission to implement it.
- Replying to or resolving review threads, dismissing reviews, adding
  reviewers/labels, changing draft state, closing, reopening, or rerunning jobs
  each requires explicit authorization.

Never merge, force-push, rewrite published commits, deploy manually, mutate
production, discard work, or contact members. Do not broaden a requested fix
to unrelated cleanup.

## Pin the PR and head

Inspect the PR's repository, number, URL, open/draft state, base branch, head
repository and branch, full head SHA, title/body, commits, changed files,
checks, deployments, reviews, review threads, and issue comments. Confirm that
GitHub authentication can read the correct repository; do not infer repository
identity solely from the local folder or a remote named `preview`.

Use the full head SHA as the join key. Ignore stale checks, deployments, and
line comments that belong only to an older commit unless their underlying
finding still applies. Re-read the PR whenever its head changes. Treat a
closed or merged PR as read-only history unless the user explicitly requests a
supported metadata action; never reopen it implicitly.

Before source changes, also inspect `git status --short`, remotes, local and
remote refs, and the complete PR diff against its base. Existing staged,
unstaged, and untracked work belongs to the user.

## Assess checks and review feedback

For the latest SHA:

1. Classify required and optional checks as pending, successful, skipped,
   cancelled, or failed. Open the relevant job/check details for failures;
   status labels alone are not a diagnosis.
2. Attribute each failure to the PR, a confirmed pre-existing baseline,
   infrastructure, credentials/configuration, or insufficient evidence. Do
   not call a failure flaky without a clean retry or equivalent proof.
3. For Vercel, accept a preview URL or state only from deployment/check/status
   metadata attributable to this SHA. A URL attached to a failed deployment is
   failure evidence, not a verified preview. Never construct a URL from naming
   conventions.
4. Separate review feedback into actionable, already addressed, stale/outdated,
   resolved, question-only, and unsupported. Inspect the referenced diff and
   current source before agreeing with a comment.
5. Note whether new commits invalidate earlier approvals or evidence. Do not
   report the PR green while required checks are pending or actionable review
   feedback remains.

For a babysit request, monitor the latest head rather than a captured old SHA.
Poll at a moderate interval, yield updates during long waits, and stop when the
requested terminal condition is met, the user-specified deadline expires, or a
blocker needs new authority. Monitoring alone never authorizes a fix.

## Update PR copy safely

When explicitly requested, draft the smallest coherent title/body change. A
useful body normally preserves these facts where applicable:

- the problem or goal and focused solution;
- logical commits or material changes;
- exact verification results and skipped checks;
- direct preview URL plus head SHA when already verified; and
- risks, operational notes, evidence, or known blockers.

Do not claim checks, evidence, or preview verification that the current SHA has
not earned. Apply the edit to the existing PR, then read it back and confirm
the PR number, title/body, base, head, and URL. Do not silently change labels,
reviewers, milestone, draft state, or branch.

## Apply explicitly requested follow-up fixes

Work from the existing PR's exact remote head without rewriting it. Prefer an
isolated worktree when the shared worktree is dirty, on another concern, or
cannot switch safely. Confirm that the head repository is writable before
editing; forked or protected branches may require direction.

- Reproduce or verify the reported issue first. Fix only findings supported by
  the current source, logs, or tests; explain false positives instead of
  changing code to satisfy them.
- Read the owning domain skill and wiki page before changing behavior.
- Preserve unrelated work and stage explicit paths or independently owned
  hunks. Never use `git add .` or `git add -A` in a dirty tree.
- Run the narrow checks that prove each fix, then all additional checks required
  by `AGENTS.md` for the affected boundary. Run `git diff --check` and inspect
  the complete new patch.
- Add conventional, plain-language follow-up commits. Do not amend, squash,
  rebase, or otherwise rewrite commits already published on the PR.
- Fetch the remote head again immediately before pushing. If it advanced, stop
  and reconcile without overwriting another contributor. Push only a
  fast-forward update to the PR's existing head branch; never force-push.

After a push, confirm that GitHub's PR head matches the local full SHA and
reassess checks, deployments, and comments for that SHA. Do not reply to or
resolve review threads merely because a fix was pushed unless the user asked
for those external communications.

## Report current truth

End with the PR number and URL, state, `base <- head`, full head SHA, latest
required/optional check results, attributable preview status, and actionable
review feedback. List any metadata edits or follow-up commits, the exact
verification run, and remaining blockers or permissions needed. Never merge or
promote the preview.
