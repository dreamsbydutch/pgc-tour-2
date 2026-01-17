# LeaderboardView parity checklist (old vs current)

This doc is a UI parity/spec checklist for recreating the **old** `LeaderboardView/` UI in the **current app** (TanStack Start + shadcn/ui), and calls out deltas vs the existing Convex-backed leaderboard under `src/components/leaderboard/*`.

## Scope

- Old source: `LeaderboardView/*` (legacy, standalone)
- New parity target: `src/components/leaderboardView/*` (pure UI components; parity-oriented)
- Current/legacy in-app leaderboard: `src/components/leaderboard/*` (Convex-backed, different layout)

## What “parity” means

Parity is defined as:

- Matching the old layout (grid header + rows), interactive behavior (row expand/collapse), and core visual cues.
- Data loading/error states can differ cosmetically, but must preserve comparable meaning.
- Backend wiring can change as long as the UI behavior/visual structure remains.

---

## A. Layout parity (must match)

### A1. Header row grid

- [x] Header row uses legacy grid structure: `grid-cols-10` mobile and `sm:grid-cols-33` desktop.
- [x] Header labels match:
  - Left: Rank / Name / Score
  - Right: Today / Thru
  - Desktop additional: R1 / R2 / R3 / R4
- [x] Tournament-complete header branch swaps right-side labels appropriately.

**Notes**

- Implemented in `src/components/leaderboardView/components/UIComponents.tsx` (`LeaderboardHeaderRow`).

### A2. Row layout

- [x] Rows render as a single grid row matching the header columns.
- [x] Position shows tie prefix `T` when present.
- [x] Score uses to-par formatting (e.g. `-10`, `E`, `+3`).
- [x] PGA rows show today/thru OR tee time based on status.
- [x] PGC rows show team totals aligned with old.

---

## B. Interaction parity (must match)

### B1. Expand/collapse

- [x] Clicking a row toggles expanded state.
- [x] Expanded panel appears under the row.
- [x] Pre-tournament mode disables expand/collapse.

### B2. Expanded content

- [x] PGA expanded panel shows golfer stats grid (usage / make cut / top 10 / win / world rank) + additional info.
- [x] PGC expanded panel shows team golfers table, aligned to old behavior.

---

## C. Visual cues parity (should match)

### C1. Cut / WD / DQ styling

- [x] Players/teams marked as `CUT`, `WD`, `DQ` render muted/greyed.
- [~] Cut-line separators/borders are approximated; confirm exact old behavior.

### C2. “User” and “Friend” highlights

- [x] User team highlighted (PGC) via viewer tourCardId match.
- [x] Friend teams highlighted (PGC) via viewer friend list.
- [x] User golfers highlighted (PGA) via viewer’s team golfer apiIds.

**Note**: Convex schema supports `members.friends` as either member IDs or strings; parity implementation treats it as a list of strings and best-effort matches against tour card IDs and/or Clerk IDs.

### C3. Position change indicator

- [x] Position change indicator appears in the same “Rank” column.
- [~] Iconography/colors may differ slightly (lucide vs custom), but directionality and meaning must match.

---

## D. Tour toggles parity (must match)

### D1. Toggle contents

- [x] Toggle row exists above the header.
- [x] Includes tour toggles (season tours) + `PGA`.
- [x] Playoff tournaments show `Gold`/`Silver` toggles + `PGA`.

### D2. Persistence

- [x] Active toggle is persisted via URL search param `tourId` on `/tournament`.
- [~] Optional localStorage fallback from legacy can be added if desired (not required for functional parity).

---

## E. Loading/error parity (acceptable differences)

- [x] Loading state: centered spinner card.
- [x] Error state: visible message.

---

## F. Deltas vs current in-app leaderboard (`src/components/leaderboard/*`)

The existing in-app leaderboard differs materially from the old UI:

- Layout: card-based grids vs single grid-row table-like layout.
- Interactions: lacks the old row dropdown panel parity.
- Columns: does not match old R1–R4 desktop columns and Today/Thru semantics.
- Behavior: often limits PGA display to top N; parity target should not.

---

## G. Wiring status (as of 2026-01-11)

- [x] Pure parity UI exists: `src/components/leaderboardView/*`.
- [x] Convex payload exists: `convex/functions/tournaments.ts` → `getTournamentLeaderboardView`.
- [x] Tournament route integration: `/tournament` now renders the new parity UI under `LeaderboardHeader`.
- [x] URL-persisted tour selection: `/tournament?tourId=...`.

---

## H. Remaining parity work (follow-ups)

- [ ] Confirm exact cut-line separators/borders and replicate precisely.
- [ ] Confirm tournament-complete header/value substitutions (points/earnings semantics vs old).
- [ ] Add any missing playoff-specific presentation details (if old had distinct labeling/ordering).
