import { useMemo, useState } from "react";

import { api, useAction, useQuery } from "@/convex";
import type { Id } from "@/convex";

import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { normalizeList } from "@/lib";

import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Renders an admin tool for manually sending the “groups are set” recap email.
 *
 * This page lets an admin:
 * - Select a tournament
 * - Paste a custom write-up blurb
 * - Send a test email to `BREVO_TEST_TO`
 * - Send a season opener test email to `BREVO_TEST_TO`
 * - Send the season opener email to all active members
 * - Send the real email to the computed recipient list (tourCards for that tournament season)
 *
 * Data sources:
 * - `api.functions.tournaments.getTournaments` (tournament selector)
 * - `api.functions.emails.adminGetGroupsEmailPreview` (recipient counts + sent state)
 * - `api.functions.emails.sendGroupsEmailTest` (safe test send)
 * - `api.functions.emails.sendSeasonStartEmailTest` (safe test send)
 * - `api.functions.emails.adminGetSeasonStartEmailPreview` (active member count)
 * - `api.functions.emails.adminSendSeasonStartEmailToActiveMembers` (manual real send)
 * - `api.functions.emails.adminSendGroupsEmailForTournament` (manual real send)
 */
export function AdminEmailsPage() {
  const vm = useAdminEmailsPage();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            Manually send the groups recap email with a custom write-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Tournament</div>
            <select
              value={vm.tournamentId ?? ""}
              onChange={(e) =>
                vm.setTournamentId(
                  (e.target.value || null) as Id<"tournaments"> | null,
                )
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">Select a tournament…</option>
              {vm.tournaments.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {vm.preview ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>
                  Recipient counts are based on tourCards for the tournament's
                  season.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Previous tournament:</span>{" "}
                  {vm.preview.previousTournamentName || "—"}
                </div>
                <div>
                  <span className="font-medium">Champions:</span>{" "}
                  {vm.preview.champions || "—"}
                </div>
                <div>
                  <span className="font-medium">Recipients:</span>{" "}
                  {vm.preview.recipientCount}
                </div>
                <div>
                  <span className="font-medium">Active tourCards:</span>{" "}
                  {vm.preview.activeTourCardCount}
                </div>
                <div>
                  <span className="font-medium">Unique members:</span>{" "}
                  {vm.preview.memberCount}
                </div>
                <div>
                  <span className="font-medium">Already sent:</span>{" "}
                  {vm.preview.groupsEmailSentAt ? "Yes" : "No"}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Custom blurb</div>
            <textarea
              value={vm.customBlurb}
              onChange={(e) => vm.setCustomBlurb(e.target.value)}
              placeholder="Paste your custom write-up here…"
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              rows={8}
            />
            <div className="text-xs text-muted-foreground">
              {vm.customBlurb.trim().length} characters
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!vm.tournamentId || vm.isBusy}
              onClick={() => vm.sendTest()}
            >
              Send test to me
            </Button>

            <Button
              type="button"
              disabled={!vm.tournamentId || vm.isBusy}
              onClick={() => vm.sendReal()}
            >
              Send recap email
            </Button>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vm.force}
                onChange={(e) => vm.setForce(e.target.checked)}
              />
              Force resend
            </label>
          </div>

          {vm.result ? (
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(vm.result, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Season opener</CardTitle>
          <CardDescription>
            Send a safe test of the season opener email template to
            `BREVO_TEST_TO`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typeof vm.openerPreview?.activeMemberCount === "number" ? (
            <div className="text-sm">
              <span className="font-medium">Active members:</span>{" "}
              {vm.openerPreview.activeMemberCount}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Reigning champion</div>
            <input
              value={vm.openerReigningChampion}
              onChange={(e) => vm.setOpenerReigningChampion(e.target.value)}
              placeholder="e.g. Chris H"
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Clubhouse URL</div>
            <input
              value={vm.openerClubhouseUrl}
              onChange={(e) => vm.setOpenerClubhouseUrl(e.target.value)}
              placeholder="https://your-site.com"
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Custom blurb</div>
            <textarea
              value={vm.openerCustomBlurb}
              onChange={(e) => vm.setOpenerCustomBlurb(e.target.value)}
              placeholder="Paste your season opener blurb here…"
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              rows={8}
            />
            <div className="text-xs text-muted-foreground">
              {vm.openerCustomBlurb.trim().length} characters
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={vm.isBusy}
              onClick={() => vm.sendOpenerTest()}
            >
              Send opener test to me
            </Button>

            <Button
              type="button"
              disabled={
                vm.isBusy ||
                !vm.openerConfirm ||
                (vm.openerPreview?.activeMemberCount ?? 1) <= 0
              }
              onClick={() => vm.sendOpenerReal()}
            >
              Send opener email
            </Button>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vm.openerConfirm}
                onChange={(e) => vm.setOpenerConfirm(e.target.checked)}
              />
              Confirm bulk send
            </label>
          </div>

          {vm.openerResult ? (
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(vm.openerResult, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hook backing the admin emails tool.
 *
 * Tracks tournament selection, blurb input, and request state for test/real sends.
 */
function useAdminEmailsPage() {
  const tournamentsResult = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "startDate", sortOrder: "desc" },
    },
  });

  const tournaments = useMemo(() => {
    const list = normalizeList<unknown, "tournaments">(
      tournamentsResult as unknown,
      "tournaments",
    );

    return list
      .map((t) => {
        if (!t || typeof t !== "object") return null;
        const rec = t as Record<string, unknown>;
        const id = rec._id;
        const name = rec.name;
        if (typeof id !== "string" || typeof name !== "string") return null;

        return {
          _id: id as Id<"tournaments">,
          name,
        };
      })
      .filter((t): t is { _id: Id<"tournaments">; name: string } => t !== null);
  }, [tournamentsResult]);

  const [tournamentId, setTournamentId] = useState<Id<"tournaments"> | null>(
    null,
  );
  const [customBlurb, setCustomBlurb] = useState<string>("");
  const [force, setForce] = useState<boolean>(false);
  const [result, setResult] = useState<unknown | null>(null);
  const [openerResult, setOpenerResult] = useState<unknown | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [openerReigningChampion, setOpenerReigningChampion] =
    useState<string>("");
  const [openerClubhouseUrl, setOpenerClubhouseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [openerCustomBlurb, setOpenerCustomBlurb] = useState<string>("");
  const [openerConfirm, setOpenerConfirm] = useState<boolean>(false);

  const openerPreview = useQuery(
    api.functions.emails.adminGetSeasonStartEmailPreview,
    {},
  );

  const normalizedOpenerPreview = useMemo(() => {
    if (!openerPreview || typeof openerPreview !== "object") return null;
    const rec = openerPreview as Record<string, unknown>;
    if (rec.ok !== true) return null;

    const activeMemberCount =
      typeof rec.activeMemberCount === "number" ? rec.activeMemberCount : null;
    if (activeMemberCount === null) return null;

    return { activeMemberCount };
  }, [openerPreview]);

  const preview = useQuery(
    api.functions.emails.adminGetGroupsEmailPreview,
    tournamentId ? { tournamentId } : "skip",
  );

  const normalizedPreview = useMemo(() => {
    if (!preview || typeof preview !== "object") return null;
    const rec = preview as Record<string, unknown>;
    if (rec.ok !== true) return null;

    const previousTournamentName =
      typeof rec.previousTournamentName === "string"
        ? rec.previousTournamentName
        : "";
    const champions = typeof rec.champions === "string" ? rec.champions : "";
    const recipientCount =
      typeof rec.recipientCount === "number" ? rec.recipientCount : 0;
    const activeTourCardCount =
      typeof rec.activeTourCardCount === "number" ? rec.activeTourCardCount : 0;
    const memberCount =
      typeof rec.memberCount === "number" ? rec.memberCount : 0;
    const groupsEmailSentAt =
      typeof rec.groupsEmailSentAt === "number" ? rec.groupsEmailSentAt : null;

    return {
      previousTournamentName,
      champions,
      recipientCount,
      activeTourCardCount,
      memberCount,
      groupsEmailSentAt,
    };
  }, [preview]);

  const sendTestAction = useAction(api.functions.emails.sendGroupsEmailTest);
  const sendRealAction = useAction(
    api.functions.emails.adminSendGroupsEmailForTournament,
  );

  const sendOpenerTestAction = useAction(
    api.functions.emails.sendSeasonStartEmailTest,
  );

  const sendOpenerRealAction = useAction(
    api.functions.emails.adminSendSeasonStartEmailToActiveMembers,
  );

  /** Converts an unknown thrown value into a user-readable error message. */
  function toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }

  async function sendTest() {
    if (!tournamentId) return;

    setIsBusy(true);
    try {
      const res = await sendTestAction({
        tournamentId,
        customBlurb,
      });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, error: toErrorMessage(err) });
    } finally {
      setIsBusy(false);
    }
  }

  async function sendReal() {
    if (!tournamentId) return;

    setIsBusy(true);
    try {
      const res = await sendRealAction({
        tournamentId,
        customBlurb,
        force,
      });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, error: toErrorMessage(err) });
    } finally {
      setIsBusy(false);
    }
  }

  async function sendOpenerTest() {
    setIsBusy(true);
    try {
      const res = await sendOpenerTestAction({
        customBlurb: openerCustomBlurb,
        reigningChampion: openerReigningChampion,
        clubhouseUrl: openerClubhouseUrl,
      });
      setOpenerResult(res);
    } catch (err) {
      setOpenerResult({ ok: false, error: toErrorMessage(err) });
    } finally {
      setIsBusy(false);
    }
  }

  async function sendOpenerReal() {
    setIsBusy(true);
    try {
      const res = await sendOpenerRealAction({
        customBlurb: openerCustomBlurb,
        reigningChampion: openerReigningChampion,
        clubhouseUrl: openerClubhouseUrl,
      });
      setOpenerResult(res);
    } catch (err) {
      setOpenerResult({ ok: false, error: toErrorMessage(err) });
    } finally {
      setIsBusy(false);
    }
  }

  return {
    tournaments,
    tournamentId,
    setTournamentId,
    customBlurb,
    setCustomBlurb,
    force,
    setForce,
    preview: normalizedPreview,
    isBusy,
    result,
    openerResult,
    sendTest,
    sendReal,
    openerReigningChampion,
    setOpenerReigningChampion,
    openerClubhouseUrl,
    setOpenerClubhouseUrl,
    openerCustomBlurb,
    setOpenerCustomBlurb,
    sendOpenerTest,
    openerPreview: normalizedOpenerPreview,
    openerConfirm,
    setOpenerConfirm,
    sendOpenerReal,
  };
}
