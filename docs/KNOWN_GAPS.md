# Known Gaps and Intent Mismatches

This page is an honest inventory of confirmed differences between intent, documentation, wired product behavior, and implementation. It is not a roadmap or authorization to fix unrelated work. Recheck the cited sources before acting, record the decision that resolves a gap, and remove the entry in the same change.

## Product surfaces

### History is a placeholder

`/history` exists, but `src/routes/history.tsx` renders only “Season history is coming soon.” Historical standings contributions and queries exist elsewhere, so route presence must not be described as a completed archive.

### Account capabilities exceed the rendered account page

`src/hooks/useAccountPage.ts` models settlement submission, while `convex/functions/transactions.ts` exposes `getMyTransactions`; `src/components/facilitators/AccountPage.tsx` currently renders profile, balance, logout, and the notification center, but not settlement allocation or a transaction/history view. Its doc comment also names a nonexistent `membersViews.getMyTournamentHistory` operation.

### Several frontend capabilities are dormant

`ClubhousePulse`, `HomePageListingsContainer`, `LittleFucker`, `ChampionsPopup`, `TournamentPulseStrip`/`useTournamentPulseStrip`, `SecondaryToolbar`, and `useSeasonIdOrCurrent` have implementations, exports, or tests but no active non-test caller. Notification-preference and push enable/disable hooks also have no caller. `detectTeamMoment` is tested but not connected to a publisher. Document these as dormant, not member-facing; the separate `MemberNameWithBadges` component is wired.

### Multi-card backend and home registration UI differ

The backend permits one tour card per tour and multiple cards in a season while charging one member/season fee. The home registration flow resolves a first current card and moves into a registered state, so adding another card is not an obvious wired member flow. Product intent needs confirmation before changing either side.

### Inactive membership is not a full access revocation

`members.isActive` controls active listings and recipient eligibility, but `getCurrentMember` in `convex/utils/auth.ts` does not reject an authenticated inactive member. Do not describe deactivation as account revocation until private/member mutations consistently enforce that state and focused tests define the intended exceptions.

## League intent versus enforcement

### Group-finalization wording and schedule disagree

`src/utils/rules.ts` promises Monday morning. `convex/crons.ts` runs grouping Monday at 17:00 UTC with two hourly retries. The league organizer must confirm the intended member-facing promise; do not relabel UTC scheduling as “morning” without a named timezone.

### WD/DQ copy is broader than current penalty enforcement

The in-app rulebook describes an eight-over treatment around cut day. `convex/functions/cronJobs.ts` synthesizes `course par + 8` only for a published incomplete first or second round for WD/DQ golfers, preserves completed rounds, and excludes terminal golfers on the weekend. The intended post-cut unfinished-round rule needs confirmation.

### First-place rulebook sentence contains a typo

`src/utils/rules.ts` says the tie is decided by the highest combined PGA earnings “or their entire roster.” Backend behavior uses combined actual earnings across the ten rostered golfers and holds completion when values are missing or equal. Correct the member copy only alongside an organizer confirmation that the enforced meaning is intended.

### Playoff detection depends on names

Several backend paths infer playoff events from “playoff” in tier/tournament names. Renaming records can therefore change behavior even though the schema has no explicit playoff-event flag. Preserve the naming invariant until the data model and all consumers migrate intentionally.

### Timeline displays can lag exact write gates

`appState` is periodically/materially refreshed for public UI state, while roster privacy and mutations use server `Date.now()` boundaries. A stale display never grants authority; exact server validation wins. UI work should explain reconnection/stale states rather than copying cached phase state into authorization.

### Duplicate current-year seasons have no explicit winner

`chooseCurrentSeason` in `convex/functions/readModels.ts` takes the first current-year row from an unsorted query, while `convex/functions/seasons.ts` uses the first `by_year` row. Neither chooses the highest season number until the no-current-year fallback. Avoid duplicate `seasons.year` values or define and test an explicit tie-break before relying on them.

### Public season completion can be date-derived

`deriveTimeline` marks the public season phase `completed` when every selected-season tournament is persisted as completed/cancelled **or merely has `endDate < now`**. A stale `upcoming` or `active` status therefore does not keep the phase open, even if final scoring and downstream read models have not finalized. Settlement submission accepts that completed phase (or the season end date), so this display-oriented derivation can also open a financial workflow. Verify official results and standings before processing a request.

### Tournament fallbacks do not consistently exclude cancellations

`deriveTimeline` filters cancelled rows out of pick windows, but its date-active and next-event branches do not. `selectTournamentLeaderboardDefault` also uses status-agnostic date windows, and the wired screen queries treat cached `appState` active/next rows as explicit candidates, bypassing the helper's 72-hour/group-aware handoff. A cancelled future or date-active event can therefore become cached or selected by default; verify status before operator action.

## Integrations and messaging

### Email backend and admin UI coverage differ

`/admin` wires weekly-recap test/bulk and missing-team preview/bulk sends. Groups-finalized and season-opener preview/test/bulk functions exist in `convex/functions/emails.ts` but have no frontend or scheduled caller; the missing-team test action is also backend-only. Missing-team bulk delivery refuses to run until a groups send has set `tournaments.groupsEmailSentAt`, so the shipped UI cannot satisfy its own prerequisite. `email-templates/` also lacks a groups-finalized source file even though `BREVO_GROUPS_FINALIZED_TEMPLATE_ID` drives that workflow and is the weekly-recap fallback.

### ESPN operator resolution is not wired

`espnIdentityAudit` stores unresolved identities and sync can persist safe automatic matches. There is no public resolver mutation or admin UI for an operator-directed resolution despite earlier operations documentation implying one.

### Push delivery ownership checks are incomplete

The delivery workflow rechecks enabled state and preferences, but `convex/functions/notifications.ts` does not currently enforce every notification/subscription/delivery member-ID equality previously claimed by the messaging skill. Treat endpoint reassignment safety as an area requiring a focused implementation review.

### Course timezone-offset units are implicit

`courses.timeZoneOffset` is used as milliseconds when scheduling course-local reminders, but `convex/schema.ts` does not name the unit. Existing values and all consumers must be audited before changing representation.

### Tournament-golfer earnings are not ledger money

The schema comment labels `tournamentGolfers.earnings` as cents, but current live update validation does not maintain it as a financial source. The first-place tiebreak compares raw in-memory DataGolf historical-event earnings. Do not use this field for member balances or imply a currency unit without tracing the provider boundary.

### ESPN scorecards have a multi-course limitation

Penalty-hole synthesis can infer missing hole pars from real cells and one configured course's front/back totals. It cannot independently resolve multi-course events. Preserve partial data rather than fabricating a complete scorecard.

## Financial workflows

### Admin payment recording is not retry-idempotent

`transactions.createPayment` inserts a completed payment, changes `members.account`, audits, and publishes a notification on every call. It has no stable operation key or duplicate check, so retrying after an uncertain client/network response can double-apply money. Inspect the ledger before retrying; add a focused idempotency contract before describing payment retries as safe.

## Architecture and operations

### Development and Vercel runtime targets conflict

`package.json`, `.nvmrc`, and CI require Node 22. `scripts/patch-vercel-function-runtime.mjs` rewrites generated Vercel function metadata to `nodejs20.x`. The repository does not explain the provider constraint, compatibility proof, owner, or removal condition. Treat a patch failure as a deployment failure and resolve the target intentionally rather than deleting the hook.

### Current client bundle exceeds its guard

A Node 22.23.2 production build during the 2026-08-18 documentation audit produced a 540,812-byte main entry against the 537,000-byte limit. Its initial graph was also 199,379 bytes gzip against the 165 KiB limit; `bundle:budget` stops after reporting the first failure. This documentation-only change does not alter bundled source or build configuration. Inspect the entry graph and reduce it in a focused performance change; do not raise budgets to make the gate green.

### Deployment ownership and rollback are undocumented

There is no repository deployment workflow. The exact Vercel preview/production trigger, project mapping, promotion owner, environment matrix, Convex rollback procedure, and production rollback decision are unknown. [Deployment](operations/DEPLOYMENT.md) documents only what the repository proves and requires those facts before an actual release.

### Some tool configuration is stale

`.cta.json` identifies the framework as `react-cra`. `components.json` references `tailwind.config.js` and a legacy alias named "src/lib/utils", while the active stack uses TanStack Start, `tailwind.config.ts`, and the aliases in `tsconfig.json`. Do not use those stale values to place code; repair them only as a scoped tooling change.

### Architectural migration is incomplete

The intended frontend boundary is routes -> components -> hooks -> utilities/types, but some legacy deep component imports, oversized facilitator/component files, and app-owned shapes/calculations remain. `src/lib/` is also legacy. New work follows the current boundary; move touched legacy code only when it stays within scope.

### Transitional storage remains in the schema

Legacy unions/fields remain for migration compatibility, including string-or-number tee times and embedded `tournamentGolfers.espnRounds`. Canonical scorecards live in `tournamentGolferScorecards`; canonical standings live in contributions/rows while tour-card totals are a maintained mirror. Do not remove compatibility fields until production parity and cleanup are explicitly verified.

### CSP is report-only

`vercel.json` sends `Content-Security-Policy-Report-Only`. Enforcement awaits a per-request nonce for framework and Clerk scripts and a verified source list. Do not flip it to enforcement by simply removing inline allowances.

### The PWA is not offline-first

`public/sw.js` handles push display/click events only. It does not install an application shell or cache assets/data for offline use. The manifest makes the site installable, but offline availability is not a current guarantee.

Related: [product](PRODUCT.md), [surfaces](product/SURFACES_AND_STATES.md), [data model](architecture/DATA_MODEL.md), [integrations](architecture/INTEGRATIONS.md), and [deployment](operations/DEPLOYMENT.md).
