# DataGolf API (Convex actions)

This project exposes the DataGolf API through Convex **actions** under `api.functions.datagolf.*`.

- Official docs: https://datagolf.com/api-access
- Base URL: `https://feeds.datagolf.com`
- Auth: set `DATAGOLF_API_KEY` in your Convex env.
- All endpoints below are Convex **actions** (use `ctx.runAction(...)` server-side, or `useAction(...)` client-side).

## Conventions

- `options.format` maps to DataGolf `file_format` (`json` or `csv`). We strongly recommend `json`.
- `options.oddsFormat` maps to DataGolf `odds_format` (`percent`, `american`, `decimal`, `fraction`).
  - Note: DataGolf returns **numbers** for `percent`/`decimal` (commonly), but returns **strings** for `american`/`fraction` in many endpoints. Our types reflect this as `number | string` where needed.
- Some DataGolf IDs (like `event_id`) may arrive as a string even if they look numeric. Types allow `string | number`.

## Type source

All response/input types live in `convex/types/datagolf.ts`.

## Endpoint map

### General use

- `fetchPlayerList(options)` → `GET /get-player-list`
  - DataGolf: `/get-player-list?file_format=...`
  - Response type: `Player[]`

- `fetchTourSchedule(options)` → `GET /get-schedule`
  - DataGolf: `/get-schedule?tour=pga&season=...&upcoming_only=yes|no&file_format=...`
  - Response type: `TourScheduleResponse`

- `fetchFieldUpdates(options)` → `GET /field-updates`
  - DataGolf: `/field-updates?tour=pga&file_format=...`
  - Response type: `FieldUpdatesResponse`

### Model predictions

- `fetchDataGolfRankings(options)` → `GET /preds/get-dg-rankings`
  - DataGolf: `/preds/get-dg-rankings?file_format=...`
  - Response type: `DataGolfRankingsResponse`

- `fetchPreTournamentPredictions(options)` → `GET /preds/pre-tournament`
  - DataGolf: `/preds/pre-tournament?tour=pga&add_position=...&dead_heat=yes|no&odds_format=...&file_format=...`
  - Response type: `PreTournamentPredictionsResponse`
  - Extra behavior: for sorting/filtering by win probability across odds formats, we compute implied probability from `win`.

- `fetchPreTournamentPredictionsArchive(options)` → `GET /preds/pre-tournament-archive`
  - DataGolf: `/preds/pre-tournament-archive?event_id=...&year=...&odds_format=...&file_format=...`
  - Response type: `PreTournamentPredictionsArchiveResponse`

- `fetchPlayerSkillDecompositions(options)` → `GET /preds/player-decompositions`
  - DataGolf: `/preds/player-decompositions?tour=pga&file_format=...`
  - Response type: `SkillDecompositionsResponse`

- `fetchSkillRatings(options)` → `GET /preds/skill-ratings`
  - DataGolf: `/preds/skill-ratings?display=value|rank&file_format=...`
  - Response type: `SkillRatingsResponse`

- `fetchApproachSkill(options)` → `GET /preds/approach-skill`
  - DataGolf: `/preds/approach-skill?period=l24|l12|ytd&file_format=...`
  - Response type: `ApproachSkillResponse`

- `fetchFantasyProjectionDefaults(options)` → `GET /preds/fantasy-projection-defaults`
  - DataGolf: `/preds/fantasy-projection-defaults?tour=pga&site=...&slate=...&file_format=...`
  - Response type: `FantasyProjectionResponse`

### Live model

- `fetchLiveModelPredictions(options)` → `GET /preds/in-play`
  - DataGolf: `/preds/in-play?tour=pga&dead_heat=yes|no&odds_format=...&file_format=...`
  - Response type: `LiveModelPredictionsResponse`

- `fetchLiveTournamentStats(options)` → `GET /preds/live-tournament-stats`
  - DataGolf: `/preds/live-tournament-stats?stats=...&round=...&display=...&file_format=...`
  - Response type: `LiveTournamentStatsResponse`

- `fetchLiveHoleStats(options)` → `GET /preds/live-hole-stats`
  - DataGolf: `/preds/live-hole-stats?tour=pga&file_format=...`
  - Response type: `LiveHoleStatsResponse`

- `fetchLiveStrokesGained(options)` → `GET /preds/live-strokes-gained` (deprecated by DataGolf)
  - DataGolf: `/preds/live-strokes-gained?sg=raw|relative&file_format=...`
  - Response type: `LiveStrokesGainedResponse`

### Historical raw data

- `fetchHistoricalEventList(options)` → `GET /historical-raw-data/event-list`
  - DataGolf: `/historical-raw-data/event-list?tour=pga&file_format=...`
  - Response type: `HistoricalEvent[]`

- `fetchHistoricalRoundData(options)` → `GET /historical-raw-data/rounds`
  - DataGolf: `/historical-raw-data/rounds?tour=pga&event_id=...&year=...&file_format=...`
  - Response type: `HistoricalRoundDataResponse`

### Betting tools

- `fetchBettingToolsOutrights(options)` → `GET /betting-tools/outrights`
  - DataGolf: `/betting-tools/outrights?tour=pga&market=...&odds_format=...&file_format=...`
  - Response type: `BettingToolOutrightsResponse`

- `fetchBettingToolsMatchups(options)` → `GET /betting-tools/matchups`
  - DataGolf: `/betting-tools/matchups?tour=pga&market=...&odds_format=...&file_format=...`
  - Response type: `BettingToolMatchupsResponse`

- `fetchBettingToolsMatchupsAllPairings(options)` → `GET /betting-tools/matchups-all-pairings`
  - DataGolf: `/betting-tools/matchups-all-pairings?tour=pga&odds_format=...&file_format=...`
  - Response type: `BettingToolAllPairingsResponse`

### Historical odds

- `fetchHistoricalOddsEventList(options)` → `GET /historical-odds/event-list`
  - DataGolf: `/historical-odds/event-list?tour=pga&file_format=...`
  - Response type: `HistoricalOddsEventListResponse`

- `fetchHistoricalOddsOutrights(options)` → `GET /historical-odds/outrights`
  - DataGolf: `/historical-odds/outrights?tour=pga&event_id=...&year=...&market=...&book=...&odds_format=...&file_format=...`
  - Response type: `HistoricalOddsOutrightsResponse`

- `fetchHistoricalOddsMatchups(options)` → `GET /historical-odds/matchups`
  - DataGolf: `/historical-odds/matchups?tour=pga&event_id=...&year=...&book=...&odds_format=...&file_format=...`
  - Response type: `HistoricalOddsMatchupsResponse`

### Historical DFS

- `fetchHistoricalDfsEventList(options)` → `GET /historical-dfs-data/event-list`
  - DataGolf: `/historical-dfs-data/event-list?file_format=...`
  - Response type: `HistoricalDfsEventListResponse`

- `fetchHistoricalDfsPoints(options)` → `GET /historical-dfs-data/points`
  - DataGolf: `/historical-dfs-data/points?tour=pga&site=...&event_id=...&year=...&file_format=...`
  - Response type: `HistoricalDfsPointsResponse`

## Usage examples

### Client (React)

```ts
import { api } from "@/../convex/_generated/api";
import { useAction } from "convex/react";

const fetchSchedule = useAction(api.functions.datagolf.fetchTourSchedule);

const schedule = await fetchSchedule({
  options: { tour: "pga", season: 2026, upcomingOnly: true, format: "json" },
});
```

### Server-side (another Convex function)

```ts
const schedule = await ctx.runAction(api.functions.datagolf.fetchTourSchedule, {
  options: { tour: "pga", season: 2026, upcomingOnly: true },
});
```
