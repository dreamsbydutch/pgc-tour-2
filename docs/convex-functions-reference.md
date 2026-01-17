# Convex Functions Reference

A practical guide to all backend functions in the PGC app.

## Quick Reference

Functions are organized by domain and follow a consistent CRUD pattern:

- `createXxx` - Create new records (mutation)
- `getXxx` - Retrieve records with filtering/sorting (query)
- `updateXxx` - Modify existing records (mutation)
- `deleteXxx` - Remove records (mutation)
- `xxxPage` - Paginated queries for large datasets (query)

**Function Path**: `api.functions.{module}.{functionName}`
**Example**: `api.functions.members.getMembers`

---

## Core Domain Functions

### 👥 Members (`api.functions.members.*`)

Member management with Clerk authentication integration.

| Function                          | Type     | Purpose                              | Key Features                                                                                                                                    |
| --------------------------------- | -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMembers`                   | mutation | Create new member                    | • Auto-generates display name<br>• Sets initial account balance<br>• Links to Clerk user<br>• Validates email format                            |
| `getMembers`                      | query    | Get members with filtering           | • Filter by clerkId, email, role<br>• Enhanced responses include friends<br>• Sort by name, creation date, balance<br>• Bulk operations support |
| `getMembersPage`                  | query    | Paginated member list                | • Cursor-based pagination<br>• Full-text search across names<br>• Role-based filtering<br>• Sort by multiple fields                             |
| `updateMembers`                   | mutation | Update member data                   | • Partial updates supported<br>• Role changes require admin<br>• Account balance modifications<br>• Friend list management                      |
| `deleteMembers`                   | mutation | Delete member                        | • Hard delete only<br>• Transfers account balance<br>• Removes from friend lists<br>• Cascade deletes tour cards                                |
| `ensureMemberForCurrentClerkUser` | mutation | Auto-create member for Clerk user    | • First-time login helper<br>• Extracts data from Clerk<br>• Sets default values                                                                |
| `adminLinkMemberToClerkUser`      | mutation | Admin: Link existing member to Clerk | • Admin-only operation<br>• Links existing member profile                                                                                       |
| `adminCreateMemberForClerkUser`   | mutation | Admin: Create member for Clerk user  | • Admin-only operation<br>• Custom role assignment                                                                                              |
| `listMembersForClerkLinking`      | query    | Admin: List unlinked members         | • Shows members without clerkId<br>• For admin linking UI                                                                                       |

**Common Options**:

- `returnEnhanced: boolean` - Include computed fields and related data
- `includeStatistics: boolean` - Add performance metrics
- `skipValidation: boolean` - Bypass validation for migrations

---

### 🏆 Tournaments (`api.functions.tournaments.*`)

Tournament lifecycle management with live scoring support.

| Function                   | Type     | Purpose                        | Key Features                                                                                                                       |
| -------------------------- | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createTournaments`        | mutation | Create tournament              | • Links to season, tier, course<br>• Auto-calculates status from dates<br>• Sets up live scoring fields<br>• Validates date ranges |
| `getTournaments`           | query    | Get tournaments with filtering | • Filter by season, status, dates<br>• Enhanced includes teams/golfers<br>• Sort by date, name, status<br>• Live scoring data      |
| `getAllTournaments`        | query    | Simple tournament list         | • Lightweight for dropdowns<br>• Basic fields only<br>• Fast performance                                                           |
| `getTournamentWithDetails` | query    | **Convenience Query**          | • Single query for tournament page<br>• Includes teams, golfers, course<br>• Optimized for UI performance                          |
| `updateTournaments`        | mutation | Update tournament              | • Status transitions<br>• Live scoring updates<br>• Date modifications<br>• Course changes                                         |
| `deleteTournaments`        | mutation | Delete tournament              | • Soft delete (status → cancelled)<br>• Hard delete option<br>• Cascade deletes teams<br>• Preserves historical data               |

**Tournament Status Flow**: `upcoming` → `active` → `completed` (or `cancelled`)

**Live Scoring Fields**:

- `livePlay: boolean` - Tournament accepting live updates
- `currentRound: number` - Current round (1-4)
- `lastUpdated: number` - Last scoring update timestamp

---

### 🎯 Teams (`api.functions.teams.*`)

Fantasy team entries and tournament participation.

| Function                 | Type     | Purpose                       | Key Features                                                                                                                      |
| ------------------------ | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createTeams`            | mutation | Create team entry             | • Links to tournament + tour card<br>• Validates golfer selections<br>• Calculates team composition<br>• Entry deadline checks    |
| `getTeams`               | query    | Get teams with filtering      | • Filter by tournament, member<br>• Enhanced includes golfer details<br>• Sort by score, creation date<br>• Performance analytics |
| `getTournamentTeams`     | query    | Teams for specific tournament | • Optimized for leaderboard<br>• Includes live scoring<br>• Rank calculations                                                     |
| `getTournamentTeamsPage` | query    | Paginated tournament teams    | • Cursor-based pagination<br>• Search by team name<br>• Sort by performance                                                       |
| `getTeamsPage`           | query    | Paginated all teams           | • Admin view of all teams<br>• Multi-tournament filtering<br>• Member lookup                                                      |
| `getSeasonStandings`     | query    | **Convenience Query**         | • Season-wide rankings<br>• Points calculations<br>• Tour-specific standings                                                      |
| `updateTeams`            | mutation | Update team                   | • Golfer substitutions<br>• Live score updates<br>• Performance recalculation                                                     |
| `deleteTeams`            | mutation | Delete team                   | • Before tournament starts<br>• Refunds entry fees<br>• Removes from leaderboard                                                  |

**Team Composition**:

- `golferIds: number[]` - Selected golfers (external API IDs)
- `score: number` - Calculated team score
- `earnings: number` - Prize money in cents

---

### 🏌️ Golfers (`api.functions.golfers.*`)

Professional golfer data with DataGolf integration.

| Function                          | Type     | Purpose                    | Key Features                                                                                                  |
| --------------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `createGolfers`                   | mutation | Create golfer profile      | • Links to external API<br>• Normalizes name format<br>• Country/amateur status<br>• Duplicate prevention     |
| `getGolfers`                      | query    | Get golfers with filtering | • Filter by country, amateur status<br>• Search by name<br>• Enhanced includes stats<br>• Performance history |
| `getGolfersPage`                  | query    | Paginated golfer list      | • Full-text search<br>• Country filtering<br>• Sort by ranking, name<br>• Admin data management               |
| `getTournamentLeaderboardGolfers` | query    | **Convenience Query**      | • Tournament-specific leaderboard<br>• Live scoring integration<br>• Performance calculations                 |
| `updateGolfers`                   | mutation | Update golfer data         | • Sync with external API<br>• Performance updates<br>• Profile corrections                                    |
| `deleteGolfers`                   | mutation | Delete golfer              | • Remove unused profiles<br>• Preserve historical data<br>• Cascade team adjustments                          |
| `bulkInsertGolfers`               | mutation | Bulk create golfers        | • Mass data import<br>• Duplicate handling<br>• Performance optimized                                         |
| `bulkPatchGolfers`                | mutation | Bulk update golfers        | • Batch sync operations<br>• Performance metrics<br>• Error handling                                          |
| `upsertGolfers`                   | mutation | Create or update golfer    | • Migration helper<br>• Handles duplicates<br>• oldId mapping                                                 |
| `adminNormalizeGolferNames`       | mutation | Admin: Fix name formatting | • Bulk name corrections<br>• Standardized format<br>• Duplicate detection                                     |
| `adminDedupeGolfersByName`        | mutation | Admin: Remove duplicates   | • Merge duplicate profiles<br>• Preserve relationships<br>• Data cleanup                                      |
| `listGolfersForSync`              | query    | List golfers for sync      | • DataGolf integration<br>• Sync status tracking<br>• Batch operations                                        |

**Golfer Data**:

- `apiId: number` - External API identifier
- `name: string` - Normalized display name
- `country?: string` - Player nationality
- `amateur: 0 | 1` - Professional status

---

### 🏟️ Seasons (`api.functions.seasons.*`)

Season organization and year management.

| Function           | Type     | Purpose                    | Key Features                                                                                                     |
| ------------------ | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createSeasons`    | mutation | Create new season          | • Year + number system<br>• Auto-generates name<br>• Default to active status<br>• Validates uniqueness          |
| `getSeasons`       | query    | Get seasons with filtering | • Filter by year, status<br>• Enhanced includes tournaments<br>• Sort by year, creation<br>• Statistics included |
| `getCurrentSeason` | query    | **Convenience Query**      | • Single current season<br>• Server-side logic<br>• Consistent definition                                        |
| `updateSeasons`    | mutation | Update season              | • Name changes<br>• Status transitions<br>• Archive old seasons                                                  |
| `deleteSeasons`    | mutation | Delete season              | • Hard delete only<br>• Migrates data to other season<br>• Cascade handling                                      |

**Season Naming**: `"2026 Season 1"`, `"2026 Season 2"`

---

### 🎪 Tours (`api.functions.tours.*`)

Tour organization within seasons with buy-in management.

| Function      | Type     | Purpose                  | Key Features                                                                                             |
| ------------- | -------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `createTours` | mutation | Create tour              | • Links to season<br>• Buy-in amount (cents)<br>• Playoff spots<br>• Auto-create tour cards option       |
| `getTours`    | query    | Get tours with filtering | • Filter by season<br>• Enhanced includes cards/stats<br>• Sort by name, buy-in<br>• Performance metrics |
| `updateTours` | mutation | Update tour              | • Buy-in changes<br>• Playoff adjustments<br>• Name modifications                                        |
| `deleteTours` | mutation | Delete tour              | • Hard delete only<br>• Transfers tour cards<br>• Financial adjustments                                  |

**Tour Structure**:

- `buyIn: number` - Entry cost in cents
- `playoffSpots: number` - Players advancing to playoffs
- Auto-creates tour cards for existing members

---

### 🎫 Tour Cards (`api.functions.tourCards.*`)

Member participation in tours with financial tracking.

| Function          | Type     | Purpose                       | Key Features                                                                                                             |
| ----------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `createTourCards` | mutation | Create tour card              | • Links member to tour<br>• Deducts buy-in from account<br>• Initial 0 points/earnings<br>• Duplicate prevention         |
| `getTourCards`    | query    | Get tour cards with filtering | • Filter by tour, member, season<br>• Enhanced includes member data<br>• Sort by points, earnings<br>• Performance stats |
| `updateTourCards` | mutation | Update tour card              | • Points adjustments<br>• Earnings updates<br>• Performance tracking                                                     |
| `deleteTourCards` | mutation | Delete tour card              | • Refund buy-in<br>• Remove from tour<br>• Clean up related data                                                         |

**Financial Tracking**:

- `points: number` - Season points earned
- `earnings: number` - Prize money in cents
- Buy-in automatically deducted on creation

---

### 🏅 Tiers (`api.functions.tiers.*`)

Prize structure and payout configuration.

| Function      | Type     | Purpose                  | Key Features                                                                                                |
| ------------- | -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `createTiers` | mutation | Create prize tier        | • Links to season<br>• Payout structure (cents)<br>• Points distribution<br>• Validates arrays match        |
| `getTiers`    | query    | Get tiers with filtering | • Filter by season<br>• Enhanced includes tournaments<br>• Sort by name, total payout<br>• Usage statistics |
| `updateTiers` | mutation | Update tier              | • Payout adjustments<br>• Points modifications<br>• Structure changes                                       |
| `deleteTiers` | mutation | Delete tier              | • Hard delete only<br>• Reassign tournaments<br>• Financial recalculations                                  |

**Tier Structure**:

- `payouts: number[]` - Prize money by position (cents)
- `points: number[]` - Points by position
- Arrays must be same length

---

### 🏌️‍♂️ Tournament Golfers (`api.functions.tournamentGolfers.*`)

Golfer performance in specific tournaments.

| Function                         | Type     | Purpose                     | Key Features                                                                          |
| -------------------------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `createTournamentGolfers`        | mutation | Add golfer to tournament    | • Links golfer + tournament<br>• Initial performance data<br>• Live scoring setup     |
| `getTournamentGolferRecords`     | query    | Get tournament performances | • Filter by tournament/golfer<br>• Sort by score, position<br>• Live updates included |
| `getTournamentGolferRecordsPage` | query    | Paginated performances      | • Large tournament support<br>• Search by golfer name<br>• Performance filtering      |
| `updateTournamentGolfers`        | mutation | Update performance          | • Live score updates<br>• Position changes<br>• Round-by-round data                   |
| `deleteTournamentGolfers`        | mutation | Remove from tournament      | • Clean up unused entries<br>• Preserve historical data                               |

**Performance Data**:

- `totalScore: number` - Tournament total
- `position: number` - Leaderboard position
- `rounds: number[]` - Individual round scores

---

## Support Functions

### ⚙️ Settings (`api.functions.settings.*`)

Application configuration management.

| Function         | Purpose             | Features                                                       |
| ---------------- | ------------------- | -------------------------------------------------------------- |
| `createSettings` | Store config values | • Key-value pairs<br>• JSON serialization<br>• Type validation |
| `getSettings`    | Retrieve config     | • Single or bulk lookup<br>• Default values<br>• Type casting  |
| `updateSettings` | Modify config       | • Partial updates<br>• Validation<br>• Change tracking         |
| `deleteSettings` | Remove config       | • Clean up unused settings                                     |

---

### 💰 Transactions (`api.functions.transactions.*`)

Financial ledger and account management.

| Function              | Purpose                   | Features                                                                           |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `createTransactions`  | Record financial activity | • Member account changes<br>• Transaction types<br>• Balance tracking              |
| `getTransactions`     | Transaction history       | • Filter by member, type, date<br>• Sort by amount, date<br>• Balance calculations |
| `getTransactionsPage` | Paginated history         | • Large dataset support<br>• Search capabilities<br>• Export functionality         |
| `updateTransactions`  | Modify transaction        | • Corrections only<br>• Audit trail                                                |
| `deleteTransactions`  | Remove transaction        | • Reverses balance changes<br>• Admin only                                         |

**Transaction Types**: `buy_in`, `payout`, `transfer`, `adjustment`

---

### 🏌️‍♀️ Courses (`api.functions.courses.*`)

Golf course data management.

| Function               | Purpose               | Features                                                                |
| ---------------------- | --------------------- | ----------------------------------------------------------------------- |
| `createCourses`        | Add course data       | • Links to external API<br>• Location data<br>• Par information         |
| `getCourses`           | Course lookup         | • Search by name, location<br>• API integration<br>• Tournament history |
| `getCourseByApiId`     | Lookup by external ID | • API synchronization<br>• Fast lookups                                 |
| `getCoursesByLocation` | Location-based search | • Geographic filtering<br>• Regional tournaments                        |
| `updateCourses`        | Update course data    | • Sync with external APIs<br>• Correct information                      |
| `deleteCourses`        | Remove unused courses | • Clean up data                                                         |

---

### 🔔 Push Subscriptions (`api.functions.pushSubscriptions.*`)

Web push notification management.

| Function                  | Purpose             | Features                                                               |
| ------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `createPushSubscriptions` | Register device     | • Web push endpoints<br>• Member association<br>• Duplicate prevention |
| `getPushSubscriptions`    | Subscription lookup | • Active subscriptions<br>• Member filtering<br>• Bulk operations      |
| `updatePushSubscriptions` | Modify subscription | • Update endpoints<br>• Status changes                                 |
| `deletePushSubscriptions` | Unregister device   | • Clean unsubscription                                                 |

---

### 📊 Audit Logs (`api.functions.auditLogs.*`)

Change tracking and compliance.

| Function           | Purpose             | Features                                                                      |
| ------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `createAuditLogs`  | Record changes      | • Who changed what<br>• Before/after values<br>• Metadata capture             |
| `getAuditLogs`     | Audit trail lookup  | • Filter by entity, action, user<br>• Date range queries<br>• Change analysis |
| `getAuditLogsPage` | Paginated audit log | • Large dataset support<br>• Search capabilities<br>• Compliance reporting    |

**Automatically logged**: All admin mutations across members, tournaments, seasons, tours, tiers

---

## External Integration Functions

### 🌐 DataGolf API (`api.functions.datagolf.*`)

Professional golf data integration.

| Function                         | Purpose                      | API Endpoint                  |
| -------------------------------- | ---------------------------- | ----------------------------- |
| `fetchPlayerList`                | Get all professional golfers | `/get-player-list`            |
| `fetchTourSchedule`              | Tournament schedules         | `/get-schedule`               |
| `fetchFieldUpdates`              | Tournament field changes     | `/field-updates`              |
| `fetchDataGolfRankings`          | Player rankings              | `/get-dg-rankings`            |
| `fetchPreTournamentPredictions`  | Betting odds/predictions     | `/pre-tournament-predictions` |
| `fetchPlayerSkillDecompositions` | Skill breakdowns             | `/skill-decompositions`       |
| `fetchSkillRatings`              | Player skill ratings         | `/skill-ratings`              |
| `fetchApproachSkill`             | Approach game stats          | `/approach-skill`             |
| `fetchLiveModelPredictions`      | Live tournament predictions  | `/live-model-predictions`     |
| `fetchLiveTournamentStats`       | Live tournament stats        | `/live-tournament-stats`      |
| `fetchLiveHoleStats`             | Live hole-by-hole stats      | `/live-hole-stats`            |
| `fetchHistoricalEventList`       | Past tournament data         | `/historical-event-list`      |
| `fetchHistoricalRoundData`       | Historical round scores      | `/historical-raw-data`        |

**All DataGolf functions**:

- Include comprehensive filtering and sorting options
- Have built-in retry logic and timeout handling
- Validate API responses
- Support data manipulation and processing

---

### 👤 Clerk Integration (`api.functions.clerk.*`)

User authentication and management.

| Function         | Purpose             | Features                                                                                    |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `listClerkUsers` | Get Clerk user data | • Admin user management<br>• Member linking<br>• Bulk operations<br>• Email synchronization |

---

### 🔄 Golfer Sync (`api.functions.golfersSync.*`)

DataGolf to Convex golfer synchronization.

| Function                  | Purpose               | Features                                                                                         |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `syncGolfersFromDataGolf` | Import/update golfers | • Bulk import from DataGolf<br>• Duplicate handling<br>• Progress reporting<br>• Dry run support |

---

## Compatibility Functions

### 🔧 Legacy Support (`api.functions.*`)

Backward compatibility for older client versions.

| Function    | Purpose              | Migration Path                                               |
| ----------- | -------------------- | ------------------------------------------------------------ |
| `getMember` | Single member lookup | Use `api.functions.members.getMembers` with `clerkId` filter |

---

## Common Patterns

### CRUD Options

Most functions accept an `options` object with these common fields:

```typescript
{
  // Response Enhancement
  returnEnhanced?: boolean        // Include computed fields and related data
  includeStatistics?: boolean     // Add performance metrics (expensive)

  // Validation
  skipValidation?: boolean        // Bypass validation for migrations

  // Filtering
  limit?: number                  // Result limit
  offset?: number                 // Result offset (for pagination)

  // Sorting
  sortBy?: string                 // Field to sort by
  sortOrder?: "asc" | "desc"      // Sort direction
}
```

### Enhanced Responses

When `returnEnhanced: true`, functions typically add:

- **Formatted fields**: `formattedAccount` (dollars), `formattedDates`
- **Related data**: Member → friends, Tournament → teams/golfers
- **Computed values**: Scores, rankings, statistics
- **Display helpers**: Status badges, progress indicators

### Error Handling

All functions return structured error responses:

```typescript
{
  ok: boolean
  error?: string
  details?: string[]
  data?: any
}
```

### Performance Notes

- **Convenience queries** (marked above) are optimized for hot UI paths
- **Page queries** use cursor-based pagination for large datasets
- **Enhanced responses** include expensive joins - use sparingly
- **Bulk operations** are optimized for admin tasks and migrations

---

## Development Tips

1. **Use convenience queries** for main UI screens (tournament details, standings, leaderboard)
2. **Paginate large datasets** with `getXxxPage` functions
3. **Enable enhanced responses** only when you need the extra data
4. **Check function signatures** in TypeScript for exact parameter types
5. **Monitor audit logs** for debugging admin operations
6. **Use bulk operations** for data imports and migrations
