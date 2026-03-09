# PGC Backend Analysis

> Deep analysis of the Convex backend — completeness, architecture, and gaps.

---

## 1. Schema (10 Tables)

| Table                           | Indexes | Notes                                                                       |
| ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `members`                       | 6       | Well-indexed for all access patterns (email, clerkId, role, login, account) |
| `seasons`                       | 3       | Year, number, date range                                                    |
| `tours`                         | 2       | By season and name+season compound                                          |
| `tiers`                         | 2       | By season and name+season compound                                          |
| `courses`                       | 2       | By name and external API ID                                                 |
| `tournaments`                   | 6       | Excellent compound indexes (`by_season_status`, `by_season_end_date`)       |
| `tourCards`                     | 7       | Fully indexed for standings/leaderboard queries                             |
| `teams`                         | 6       | Covers tournament lookups, tour card joins, and roster timestamps           |
| `golfers` / `tournamentGolfers` | 3 / 7   | Excellent coverage for live data, scoring, and golfer lookups               |
| `transactions`                  | 6       | Full financial audit trail with type/status/member/season filtering         |
| `pushSubscriptions`             | 2       | Member + endpoint dedup                                                     |
| `auditLogs`                     | 3       | Entity-type + member tracking                                               |

Schema is well-designed with appropriate indexes for all hot paths. Money is correctly stored in cents. Timestamps use `_creationTime` + manual `updatedAt`. No soft deletes.

---

## 2. CRUD Coverage by Entity

| Entity                 | Create                                                                                       | Read                                                                                                | Update                                                    | Delete                                 | Auth                             |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| **Members**            | `createMember`                                                                               | `getMemberById`, `getMembers`, `getMembersByRole`                                                   | `updateMember`                                            | `deleteMember` (orphan protection)     | `requireAdmin` on all writes     |
| **Seasons**            | `createSeason`                                                                               | `getCurrentSeason`, `getSeasonById`, `getSeasonByYear`, `getSeasons`                                | `updateSeason`                                            | `deleteSeason` (orphan protection)     | `requireAdmin` on all writes     |
| **Tours**              | `createTour`                                                                                 | `getTourById`, `getToursBySeasonId`, `getToursByName`                                               | `updateTour`                                              | `deleteTour` (orphan protection)       | `requireAdmin` on all writes     |
| **Tiers**              | `createTier`                                                                                 | `getTierById`, `getTiersBySeasonId`, `getTiersByName`                                               | `updateTier`                                              | `deleteTier` (orphan protection)       | `requireAdmin` on all writes     |
| **Tournaments**        | `createTournament`                                                                           | `getTournamentById`, `getBySeasonId`, `getFocus`, `getNext`, `getLast`, `getPlayoff`, `getPickPool` | `updateTournament`, `updateTournamentInfo`                | `deleteTournament` (orphan protection) | `requireAdmin` on writes         |
| **TourCards**          | `createTourCard`                                                                             | `getById`, `getByTourSeason`, `getBySeason`, `getByMember`, `getByMemberSeason`                     | `updateTourCards`, `changeTourOnTourCard`                 | `deleteTourCard` (w/ fee refund)       | `requireAdmin` on writes         |
| **Teams**              | `createTeam` (upsert)                                                                        | via tournament queries                                                                              | `updateTeam`, `updateTeamRoster`                          | —                                      | Public `mutation`                |
| **Golfers**            | `upsertGolfer`, `upsertGolfers`, `createTournamentGolfers`, `createMissingTournamentGolfers` | `getTournamentGolfersByTournamentId`                                                                | `updateGolfer`, `updateGolfers`, `updateTournamentGolfer` | —                                      | Internal mutations               |
| **Courses**            | via tournament create                                                                        | via tournament reads                                                                                | —                                                         | —                                      | Embedded in tournament logic     |
| **Transactions**       | via `createTourCard`                                                                         | —                                                                                                   | —                                                         | —                                      | Auto-created on tour card events |
| **Push Subscriptions** | —                                                                                            | —                                                                                                   | —                                                         | —                                      | Schema defined, no CRUD          |
| **Audit Logs**         | —                                                                                            | —                                                                                                   | —                                                         | —                                      | Schema defined, no CRUD          |

---

## 3. Automation Layer (Crons)

| Job                         | Schedule         | Purpose                                                                                          |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `live_tournament_sync`      | Every 4 min      | Syncs DataGolf live data → `tournamentGolfers` → `teams` (self-gating when no active tournament) |
| `recompute_standings`       | Daily 4 AM UTC   | Recomputes `tourCards` standings from completed team data                                        |
| `create_groups`             | Mon 12/1/2 PM ET | Pre-tournament golfer grouping with rankings                                                     |
| `update_golfers_world_rank` | Mon 11 AM ET     | Weekly OWGR/country refresh from DataGolf                                                        |

All cron jobs expose `_Public` action variants with `requireAdminAction` for manual admin triggers.

---

## 4. External Integrations

### DataGolf API (`convex/functions/datagolf.ts`)

- `fetchFieldUpdates` — Tournament field/tee time data
- `fetchDataGolfRankings` — World rankings
- `fetchLiveModelPredictions` — In-play predictions and stats
- `fetchHistoricalRoundData` — Round-by-round scoring
- `fetchHistoricalEventDataEvents` — Event-level stats with strokes-gained breakdowns
- Robust retry logic via `fetchWithRetry` (429 handling, exponential backoff, timeouts)

### Brevo Email (`convex/functions/emails.ts`)

- Groups-finalized emails (leaderboard + grouping data)
- Missing team reminders
- Season start emails
- Weekly recap emails
- All have test variants and admin preview queries
- Rate-limited batch sending (15 concurrent, backoff)

### PostHog Analytics (`convex/functions/analytics.ts`)

- Event capture action

### Clerk Auth (`convex/functions/auth.ts`)

- Full identity flow: `getClerkUserIdentity` → `findMemberByClerkId` → `requireViewerMember`
- Auto-provisioning: `connectClerkUserToMember` (creates or links member on first login)
- Role checks: `requireAuth`, `requireAdmin`, `requireAdminAction`, `requireTourCardOwner`

---

## 5. Validation & Error Handling

- All CRUD mutations validate inputs before writing (date ordering, integer cents, unique constraints, array lengths, duplicate detection)
- Delete operations check for dependent records before allowing deletion (no orphans)
- Referenced doc existence is verified before writes (`seasonId`, `tierId`, `courseId`, etc.)
- Dedicated validators in `convex/validators/common.ts` and `convex/validators/datagolf.ts`
- DataGolf response data is validated and normalized before storage

---

## 6. Utility Layer

| File                            | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `convex/utils/misc.ts`          | 40+ utilities for scoring, formatting, leaderboard calculations, playoff logic |
| `convex/utils/datagolf.ts`      | Name normalization, tee time parsing, event matching, rating conversion        |
| `convex/utils/emails.ts`        | Template building, leaderboard rows, Brevo integration                         |
| `convex/utils/golfers.ts`       | Name parsing, ranking, filtering, group assignment                             |
| `convex/utils/batchProcess.ts`  | Generic batch processing with/without delay                                    |
| `convex/utils/externalFetch.ts` | Retry-capable HTTP with rate limit awareness                                   |
| `convex/utils/tourCards.ts`     | Fee transaction verification                                                   |

---

## 7. Architecture Quality

### Strengths

- Clean separation: functions (CRUD + queries) → utils (business logic) → validators (input schemas) → types (TypeScript contracts)
- Consistent CRUD naming convention across all entity modules
- `internalMutation` for admin writes + `requireAdmin` = double protection
- Cron jobs are self-gating (exit early if no active tournament)
- Live sync has change detection (`dataGolfInPlayLastUpdate`, `leaderboardLastUpdatedAt`) to avoid unnecessary writes
- Batch processing utilities prevent Convex timeout issues
- Tournament sync pipeline is well-orchestrated: external fetch → normalize → diff → write

### Live Tournament Sync Pipeline

The most complex piece follows a solid pattern:

1. `runTournamentSync` → finds active tournament
2. `getExternalDataForTournament` → fetches field + live model from DataGolf
3. `getAllDataForTournament` → merges DB state with external data
4. Diffs and updates `tournamentGolfers` and `teams` with position/score changes
5. Handles playoff rounds with alternate golfer substitution

---

## 8. Gaps & Opportunities

| Gap                                            | Severity | Notes                                                                                                                                                                           |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `courses` CRUD module**                   | Low      | Courses are referenced by tournaments but have no standalone create/read/update/delete. Likely seeded via migration or admin tooling.                                           |
| **No `transactions` CRUD module**              | Low      | Transactions are auto-created by `createTourCard` and fee refund logic. No admin query/list endpoint exists yet. Needed for a "view all transactions" admin panel.              |
| **No `pushSubscriptions` CRUD**                | Low      | Schema defined but no functions to subscribe/unsubscribe. Future feature placeholder.                                                                                           |
| **No `auditLogs` write logic**                 | Low      | Schema defined but nothing writes audit log entries yet. Cross-cutting concern to add to mutations.                                                                             |
| **`teams.ts` mutations are public `mutation`** | Medium   | `updateTeamRoster`, `updateTeam`, and `createTeam` are public mutations with no auth checks. Anyone with the Convex deployment URL could call these. Most notable security gap. |
| **`seasons.number` still in schema**           | Trivial  | TODO comment to remove it.                                                                                                                                                      |
| **`types/types.ts` mostly commented out**      | Trivial  | Large blocks of template types are commented. Could be cleaned up or deleted.                                                                                                   |

---

## 9. Verdict

The backend is approximately **90–95% complete** for a production golf league fantasy app. The core domain (seasons → tours → tiers → tournaments → tourCards → teams → golfers) is fully wired with CRUD, validation, live sync, email notifications, and automated standings.

### Actionable items (prioritized)

1. **Security on `teams.ts`** — add auth checks to public team mutations
2. **Courses/Transactions/PushSubscriptions/AuditLogs CRUD** — build when the frontend needs them
3. **Commented-out types cleanup** — cosmetic
