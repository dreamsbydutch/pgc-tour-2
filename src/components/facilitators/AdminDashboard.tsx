import { useAdminDashboard } from "@/hooks";

export function AdminDashboard() {
  const {
    tournaments,
    sortedTournaments,
    members,
    seasons,
    outputs,
    repairTournamentId,
    setRepairTournamentId,
    tournamentId,
    setTournamentId,
    teamsJson,
    setTeamsJson,
    importOutput,
    weeklyRecapBody,
    setWeeklyRecapBody,
    paymentMemberId,
    setPaymentMemberId,
    paymentSeasonId,
    setPaymentSeasonId,
    paymentAmountDollars,
    setPaymentAmountDollars,
    recomputeSeasonId,
    setRecomputeSeasonId,
    jobs,
    runImport,
  } = useAdminDashboard();

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage league data and operational jobs.
        </p>
      </div>
      <div className="space-y-2">
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.createGroups}
          type="button"
        >
          Run Create Groups
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.createGroups ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => jobs.liveSync()}
            type="button"
          >
            Run Live Sync
          </button>
          <button
            className="rounded bg-secondary px-4 py-2 text-secondary-foreground"
            onClick={() => jobs.liveSync(true)}
            type="button"
          >
            Force Live Sync
          </button>
        </div>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.liveSync ?? ""}
        />
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.liveSyncForce ?? ""}
        />
      </div>

      <div className="space-y-2">
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.updateWorldRank}
          type="button"
        >
          Update World Ranks
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.updateWorldRank ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Weekly Recap Email</div>
        <textarea
          className="h-40 w-full rounded border p-2 text-sm"
          value={weeklyRecapBody}
          onChange={(event) => setWeeklyRecapBody(event.target.value)}
          placeholder="Email body"
        />
        <div className="flex gap-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={jobs.weeklyRecapTest}
            type="button"
          >
            Send Test (to me)
          </button>
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={jobs.weeklyRecapSendAll}
            type="button"
          >
            Send To Everyone
          </button>
        </div>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.weeklyRecapTest ?? ""}
        />
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.weeklyRecapSendAll ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Create Payment Transaction</div>
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={paymentMemberId}
          onChange={(event) => setPaymentMemberId(event.target.value)}
          disabled={!members}
        >
          <option value="">
            {members ? "Select a member" : "Loading members..."}
          </option>
          {(members ?? []).map((m) => (
            <option key={m._id} value={m._id}>
              {(m.fullName ?? m.email) as string}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={paymentSeasonId}
          onChange={(event) => setPaymentSeasonId(event.target.value)}
          disabled={!seasons}
        >
          <option value="">
            {seasons ? "Select a season" : "Loading seasons..."}
          </option>
          {(seasons ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {`${s.year} (Season ${s.number})`}
            </option>
          ))}
        </select>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          value={paymentAmountDollars}
          onChange={(event) => setPaymentAmountDollars(event.target.value)}
          placeholder="Amount (dollars), e.g. 100 or 100.50"
          inputMode="decimal"
        />
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.createPayment}
          type="button"
          disabled={
            paymentMemberId.trim().length === 0 ||
            paymentSeasonId.trim().length === 0 ||
            paymentAmountDollars.trim().length === 0
          }
        >
          Create Payment
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.createPayment ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Recompute Standings</div>
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={recomputeSeasonId}
          onChange={(event) => setRecomputeSeasonId(event.target.value)}
          disabled={!seasons}
        >
          <option value="">
            {seasons ? "Current season (default)" : "Loading seasons..."}
          </option>
          {(seasons ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {`${s.year} (Season ${s.number})`}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.recomputeStandings}
          type="button"
        >
          Recompute Standings
        </button>
        <button
          className="ml-2 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.backfillStandings}
          type="button"
          disabled={recomputeSeasonId.trim().length === 0}
        >
          Backfill Standings Read Model
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.recomputeStandings ?? ""}
        />
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.backfillStandings ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">
          Repair Tournament Scores + Standings
        </div>
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={repairTournamentId}
          onChange={(event) => setRepairTournamentId(event.target.value)}
          disabled={!tournaments}
        >
          <option value="">
            {tournaments ? "Select a tournament" : "Loading tournaments..."}
          </option>
          {sortedTournaments.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={jobs.repairTournament}
          type="button"
          disabled={repairTournamentId.trim().length === 0}
        >
          Repair Selected Tournament
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={outputs.repairTournament ?? ""}
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Import Teams (JSON)</div>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          value={tournamentId}
          onChange={(event) => setTournamentId(event.target.value)}
          placeholder="Tournament Id"
        />
        <textarea
          className="h-48 w-full rounded border p-2 text-xs"
          value={teamsJson}
          onChange={(event) => setTeamsJson(event.target.value)}
          placeholder='[{"golferIds":[...],"score":-9.2,...}]'
        />
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={runImport}
          type="button"
          disabled={
            tournamentId.trim().length === 0 || teamsJson.trim().length === 0
          }
        >
          Import Teams
        </button>
        <textarea
          className="h-28 w-full rounded border p-2 text-xs"
          readOnly
          value={importOutput}
        />
      </div>
    </div>
  );
}
