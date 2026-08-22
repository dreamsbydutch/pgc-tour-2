# Product Surfaces and States

## Purpose and current status

PGC is a mobile-first web/PWA clubhouse with complete desktop layouts. Its public surfaces make the league easy to follow; authenticated actions handle registration, picks, friends, profile, account, and administration. The product goal is a fast, personal, obvious experience that remains truthful when auth, Convex connectivity, provider data, or scheduled work is incomplete.

“Implemented” on this page means reachable from the current route/render tree. A query, hook, component, or test can exist without being a shipped surface; those cases are listed explicitly.

## Source paths

- Root shell/providers/navigation: `src/routes/__root.tsx`, `src/components/facilitators/Providers.tsx`, `src/components/facilitators/NavigationContainer.tsx`
- Routes and URL contracts: `src/routes/*.tsx`
- Screen facilitators: `src/components/facilitators/*.tsx`
- Screen workflows/view models: `src/hooks/*.ts`, `src/convex/ViewerBootstrapProvider.tsx`
- Navigation constants: `src/utils/constants.ts`, `src/utils/navigation.ts`
- Frontend-owned contracts: `src/types/*.ts`
- Public/viewer screen reads: `convex/functions/home.ts`, `convex/functions/tournaments.ts`, `convex/functions/seasons.ts`, `convex/functions/readModels.ts`
- PWA assets/push worker: `public/manifest.json`, `public/sw.js`

## Surface catalog

| Route         | Access                               | URL/search contract                                     | Wired content and major states                                                                                                                                                                                                 |
| ------------- | ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`           | Public; viewer-aware                 | No search state                                         | Clubhouse schedule, countdown, tour-card form, account alert, role badge; loading, connection failure/retry, no season, ready, completed-season fallback, live/stale freshness                                                 |
| `/tournament` | Public; writes require member        | `tournamentId`, `tourId`, `variant=regular\|playoff`    | Canonical event/tour URL; upcoming field/groups/picks; active/completed PGA and PGC leaderboards, scorecards, course stats; loading, not found, stale freshness, partial data                                                  |
| `/standings`  | Public; friend writes require member | `season`, `tour`                                        | Season/tour/playoff views, points/payout detail, badges, friends filter, expandable history; loading, no season/tours error, ready                                                                                             |
| `/rulebook`   | Public                               | No search state                                         | Static organizer rule sections plus persisted schedule and tier distributions; loading and ready                                                                                                                               |
| `/account`    | Clerk sign-in required               | Hashes may appear in links but no route search contract | Profile names, cents balance, logout, mobile notification center; signed-out gate and signed-in content                                                                                                                        |
| `/admin`      | Admin required                       | Task anchors may appear in links                        | Admin hub, event setup, live scoring, member/payment tools, weekly-recap and missing-pick email operations, settlement processing, diagnostics; signed-out, role loading, forbidden, ready, confirmation, busy/success/failure |
| `/history`    | Public                               | No search state                                         | Placeholder only: “Season history is coming soon.”                                                                                                                                                                             |

Unknown routes render the root 404 with a link home. Main navigation exposes Home, Leaderboard, Standings, and Rulebook; the account/avatar and admin clubhouse badge provide contextual access to private surfaces. Mobile navigation is fixed at the bottom and desktop navigation at the top.

## Identities and state flow

```text
root configuration
  -> Clerk loading / signed out / signed in
  -> Convex JWT loading / authenticated
  -> viewer member provisioning/bootstrap
  -> public, member, moderator, or admin presentation

no season -> registration -> in season -> completed
upcoming tournament -> picks open -> live -> completed
                       \-> cancelled/unavailable
```

Clerk state controls sign-in presentation. Convex member/role/ownership controls application actions. A signed-in Clerk user can briefly have `bootstrap.member === null` while provisioning; pages must not guess a role or fabricate member-only actions during that interval.

## Cross-cutting UI invariants and boundaries

- Required browser configuration is checked before providers mount. Missing `VITE_CONVEX_URL` or `VITE_CLERK_PUBLISHABLE_KEY` renders an actionable diagnostic.
- First connection has loading and terminal retry UI where implemented. After a successful connection, disconnection retains saved reads and labels them stale on home/tournament instead of presenting them as live.
- Cached `appState` is for navigation/display. Exact registration, pick, start/privacy, and settlement boundaries are rechecked by the server.
- Public screens can render while signed out. Member actions appear only with a resolved viewer; admin content waits for a resolved admin role.
- Loading, empty, unavailable, forbidden, and failed states must remain distinct. “No rows” must not stand in for a query still loading.
- Upcoming, active, completed, cancelled, regular-season, Gold, and Silver competitions are distinct states. The browser never turns a provisional live standings projection into an official row.
- Tournament data can be missing, stale, partial, duplicated, or provider-unmatched. Scorecards and course stats degrade independently from authoritative leaderboard totals.
- Mutations show busy/success/error state and prevent accidental duplicate submission where implemented. Sensitive admin actions use previews/confirmation and server-side idempotency or leases.
- The manifest supplies install metadata. `/sw.js` handles push only after a client registers it; the current app has no general offline worker or offline-write queue.

## URL, navigation, and deep links

- Route validators trim accepted string IDs and discard invalid variant values. Standings also removes unknown search keys and replaces the URL with its canonical `season`/`tour` state.
- Tournament selection replaces an incomplete/stale URL with canonical tournament, tour/division, and variant state once the shell resolves.
- An invalid/unavailable tournament shows “Tournament not found” and offers “Open current tournament.”
- Notification/email destinations use route-level deep links such as `/tournament?tournamentId=...`, `/account`, or `/admin#payout-requests`. Notification hrefs are normalized to same-origin relative paths.
- A new navigable selector must round-trip through URL state so refresh, sharing, browser back/forward, and notification links preserve context.

## Wired, partial, and dormant capabilities

| Capability                            | Current status             | Evidence                                                                                              |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Viewer notification inbox             | Wired                      | `NotificationCenter` is rendered by navigation and mobile account                                     |
| Push enrollment and category settings | Backend/hook only          | `useNotificationPreferences` has no component caller                                                  |
| Member settlement request             | Hook/backend only          | `useAccountPage` exposes allocation/actions; `AccountPage` does not render them                       |
| Member transaction list               | Backend only               | `transactions.getMyTransactions` has no frontend caller                                               |
| Per-card tournament history           | Wired inside standings     | `useStandingsHistory` loads expanded rows                                                             |
| Standalone season history             | Placeholder                | `/history` has no history query/component                                                             |
| Clubhouse Pulse                       | Tested but unwired         | `home.getViewerClubhousePulse`, `useClubhousePulse`, and `ClubhousePulse` have no render caller       |
| Live tournament pulse strip           | Tested but unwired         | `TournamentPulseStrip` and `useTournamentPulseStrip` have only definitions, barrel exports, and tests |
| Major-champion name badges            | Wired                      | `MemberNameWithBadges` renders in navigation, registration, standings, and leaderboards               |
| Champions summary popup               | Exported but unwired       | `ChampionsPopup` has no render caller                                                                 |
| Secondary/tertiary fixed toolbar      | Exported but unwired       | `SecondaryToolbar` has no component caller                                                            |
| Optional/current season resolver      | Exported but unwired       | `useSeasonIdOrCurrent` has no hook or component caller                                                |
| `HomePageListingsContainer`           | Unwired legacy display     | No production render caller                                                                           |
| `LittleFucker` compact badge display  | Unwired legacy display     | No production render caller                                                                           |
| Weekly recap email                    | Wired admin UI             | `useAdminDashboard` calls its test and bulk actions                                                   |
| Missing-team reminder email           | Wired admin preview/bulk   | `useAdminDashboard` calls its preview and bulk action; its separate test action is backend-only       |
| Groups-finalized email                | Backend only               | Preview/test/bulk actions exist, but no frontend or scheduled caller                                  |
| Season-opener email                   | Backend only               | Preview/test/bulk actions exist, but no frontend or scheduled caller                                  |
| Team-moment alerts                    | Detector only              | `detectTeamMoment` is tested but never published                                                      |
| Course hole statistics                | Wired on tournament header | `TournamentHeaderDetails` calls `useTournamentCourseStats`                                            |

Use this table when documenting or deleting “dead” features: confirm the route-to-component call chain, not merely an exported symbol.

## Writes and downstream effects

Public browsing is read-only. Member UI can provision/sync the viewer, update names/friends, register/change a tour card, save a roster, mark inbox items read, and—once a settings surface is wired—manage push preferences/subscriptions. Admin UI can run explicit league, weekly-recap/missing-pick messaging, member, payment, settlement, diagnostic, and repair workflows. Groups-finalized and season-opener email actions exist at the backend boundary but are not reachable through the shipped UI.

Every UI write must defer business validation to Convex and then reflect canonical results. League-affecting changes can update teams, standings, badges, notifications, and account state; financial/admin actions also require auditability. A component-level optimistic state must not conceal a rejected server boundary.

## Failure and recovery

- Home exposes a manual retry after repeated failure before the first Convex connection.
- Standings exposes a specific unavailable state; tournament exposes loading/not-found and stale-data states; notification center exposes loading/empty.
- Rulebook currently has loading/ready only, so query/configuration failure does not have a dedicated explanatory surface.
- Admin workflows report per-operation state and keep destructive/irreversible actions behind confirmation.
- On reconnect, prefer canonical query refresh over replaying browser assumptions. Do not use a page refresh to bypass a closed pick window or busy lease.

When adding a surface, cover mobile and desktop plus signed-out/in, loading, empty, unavailable, forbidden, stale/partial, success, and error states that apply. Also verify direct URL entry, back/forward, notification links, and the reverse path for reversible actions.

## Authorization and privacy

Routes and visual gates are not security boundaries. Viewer/private/admin Convex operations must authenticate and authorize on the server. Public DTOs expose display-safe league identity only; account, email, friends, transactions, subscriptions, operational diagnostics, and pre-start opponent rosters stay private.

Analytics is mounted at the provider shell and sends sanitized explicit page-view/events only when configured. Do not attach secrets, emails, provider payloads, or roster-private data to analytics or error UI.

## Focused tests

- `src/components/facilitators/StandingsView.test.tsx`: loading/error/ready standings composition
- `src/components/displays/PGALeaderboard.test.tsx`, `src/components/displays/PGCLeaderboard.test.ts`: leaderboard states
- `src/components/displays/LeaderboardHeader.test.tsx`: header/course-stat behavior
- `src/components/displays/admin/AdminHub.test.tsx`, `AdminOperationUi.test.tsx`, `SettlementHub.test.tsx`: admin states and confirmations
- `src/components/displays/ClubhousePulse.test.tsx`, `src/utils/clubhousePulse.test.ts`: dormant pulse behavior, not evidence of wiring
- `src/utils/tournamentLeaderboard.test.ts`, `tournamentLeaderboardStatus.test.ts`: selector/status view rules
- `src/utils/analytics.test.ts`: sanitized analytics behavior
- `convex/hardening.test.ts`: backend privacy/auth boundaries behind these surfaces

## Reconciliation notes

- The account heading promises history, but the current page has none; its docblock names a nonexistent `membersViews.getMyTournamentHistory` operation.
- The architecture overview's description of `/history` as prior results exceeds the placeholder implementation.
- Rulebook copy is organizer intent plus live schedule/tier tables; it does not automatically follow scoring/backend changes.
- Existing tests for Clubhouse Pulse and push preferences do not make those features reachable.
- Barrel exports do not make `ChampionsPopup`, `TournamentPulseStrip`, `SecondaryToolbar`, or `useSeasonIdOrCurrent` reachable; each currently lacks a non-test caller.
- Weekly recap and missing-team email are wired in `/admin`; groups-finalized and season-opener email APIs are not. The missing-team workflow also refuses to send until the backend-only groups workflow has set `groupsEmailSentAt`.
- Some screen read models coexist with broad compatibility queries. New UI should use the bounded screen-oriented path and record the actual caller before removing a legacy operation.

## Related links

- [League structure](../domain/LEAGUE_STRUCTURE.md)
- [Members and access](../domain/MEMBERS_AND_ACCESS.md)
- [Tournament lifecycle](../domain/TOURNAMENT_LIFECYCLE.md)
- [Frontend architecture](../architecture/FRONTEND.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Local development](../operations/LOCAL_DEVELOPMENT.md)
- [Quality and testing](../operations/QUALITY_AND_TESTING.md)
