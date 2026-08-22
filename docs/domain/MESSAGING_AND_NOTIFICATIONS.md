# Messaging and Notifications

## Purpose and current status

PGC has three related channels: an in-app notification inbox, opt-in web push delivery, and Brevo template email. Domain workflows publish durable notification events with per-member inbox rows; eligible push subscriptions receive leased/retried deliveries. Email actions have separate recipient queries, dispatch leases, cooldowns, and sent markers.

The notification center is wired in desktop navigation and mobile account UI. The push/preferences hook and backend are implemented, but no component currently calls `useNotificationPreferences`, so members cannot enable/disable push or edit categories through shipped UI. Existing subscriptions can still be delivered.

## Source paths

- Notification schema/categories: `convex/schema.ts`, `convex/types/notifications.ts`
- Publish helpers and moment detection: `convex/utils/notifications.ts`
- Inbox, preferences, subscriptions, publishers, delivery queue: `convex/functions/notifications.ts`
- Web-push action: `convex/functions/pushDelivery.ts`
- Service worker: `public/sw.js`
- Frontend hooks/UI: `src/hooks/useNotifications.ts`, `src/components/displays/NotificationCenter.tsx`, `src/components/facilitators/NavigationContainer.tsx`
- Email actions/helpers: `convex/functions/emails.ts`, `convex/utils/emails.ts`, `convex/types/emails.ts`
- Maintained email source files: `email-templates/` (Brevo-hosted templates are selected by server environment IDs; these files are not loaded at runtime)
- Scheduled notification publishers/repair: `convex/crons.ts`

## Identities and state flow

Categories are `leagueUpdates`, `pickReminders`, `finalResults`, `teamMoments`, `financial`, and `milestones`. Preferences default to true when no row exists.

```text
domain occurrence + dedupe key
  -> one notification event
  -> one unread inbox notification per unique member
  -> zero or more push deliveries per enabled subscription
       pending -> processing (leased) -> sent
              -> pending retry -> failed
              -> skipped
  -> inbox row unread -> read
```

Current publishers include weekly recap, due-pick reminder, final result, winner milestone, payment recorded, settlement submitted, settlement item completed, and settlement cancelled. `detectTeamMoment` is implemented and tested, but no scoring path publishes its result.

Email has a separate lifecycle:

```text
preview/recipient query -> acquire server lease -> Brevo batch send
                        -> sent marker/notification -> cooldown guard
```

The email implementations are not equally wired:

| Workflow         | Backend capability                                                       | Shipped trigger                                                                                  | Maintained source file and template selection                                                                               |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Weekly recap     | Admin test and bulk actions                                              | `/admin` exposes the recipient preview, test send, and confirmed bulk send                       | `email-templates/weekly-recap.html`; `BREVO_WEEKLY_RECAP_TEMPLATE_ID`, falling back to `BREVO_GROUPS_FINALIZED_TEMPLATE_ID` |
| Missing team     | Admin preview, test, and bulk actions; bulk requires `groupsEmailSentAt` | `/admin` exposes preview and confirmed bulk send; the dedicated test action has no frontend call | `email-templates/missing-team-reminder.html`; `BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID`                                     |
| Groups finalized | Admin preview, test, and bulk actions plus an internal bulk action       | No frontend or scheduled caller                                                                  | `BREVO_GROUPS_FINALIZED_TEMPLATE_ID`; there is no groups-finalized HTML source file under `email-templates/`                |
| Season opener    | Admin preview, test, and bulk actions                                    | No frontend or scheduled caller                                                                  | `email-templates/season-opener.html`; `BREVO_SEASON_START_TEMPLATE_ID`                                                      |

The scheduled 7 p.m. pick reminder described below is an in-app/push publisher. It is separate from the manually triggered missing-team Brevo email.

## Enforced invariants, units, and boundaries

- `notificationEvents.dedupeKey` makes publication idempotent. Duplicate publication returns the existing event without adding inbox rows or deliveries.
- Duplicate recipients are collapsed by member ID. Titles are limited to 120 characters, bodies to 500, and hrefs to 500.
- Notification hrefs must be same-origin relative paths beginning with one `/`; invalid or protocol-relative values become `/`.
- Inbox notifications are created regardless of category preference. Preferences currently gate push delivery, not the durable in-app inbox.
- Inbox reads return 50 newest rows and count up to 100 unread; “mark all” updates at most 500 unread rows.
- A push endpoint must be HTTPS. Registering it for a member removes any rows for the same endpoint owned by someone else, then upserts the caller's subscription.
- Publication fans out to at most 20 enabled subscriptions per member.
- Delivery claims take at most 50 due rows and lease them for five minutes. Attempts are bounded at three; retriable failures use exponential minute delays. A ten-minute repair cron returns expired processing leases to pending.
- HTTP 404/410 deletes the expired subscription and fails that delivery. Success resets subscription failure state.
- Pick reminders publish at 7 p.m. course-local time on the day before the event and only for members missing a team. `courses.timeZoneOffset` is interpreted as milliseconds.
- Email dispatch leases last five minutes. Test sends cool down for 30 seconds and bulk sends for five minutes.

Web push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Brevo sends require the server-side Brevo configuration documented by operations; none of these values belongs in a `VITE_` variable.

## UI and public behavior

Signed-in users see a bell, unread badge capped visually at `99+`, loading/empty inbox states, relative timestamps, per-item read-on-navigation, and “mark all read.” Notification links can deep-link to tournament, account, or admin surfaces.

`useNotificationPreferences` handles support detection, permission, service-worker registration, subscription upsert/removal, device states, and per-category changes. This is dormant until a settings component renders it. As a result, documentation must not promise a member-facing push settings screen today.

The service worker shows a PGC-branded notification and focuses/navigates an existing window or opens a new one. In-app notification rows remain useful when push is unsupported, blocked, unconfigured, or disabled.

The shipped admin surface exposes weekly-recap test/bulk controls and missing-team preview/bulk controls. Groups-finalized and season-opener functions are backend-only today, and the missing-team test action is also not exposed. No cron invokes those email functions. Successful groups and missing-team bulk sends persist tournament markers so the same message is not casually repeated.

## Writes and downstream effects

- Publishing inserts event/inbox/delivery rows and schedules immediate delivery when needed.
- Read operations patch only `readAt`; preference updates upsert one member row.
- Registration stores endpoint encryption keys/user agent; unregistration deletes the caller's matching endpoints.
- Final-result publication happens only after tournament completion. Financial publication follows audited ledger/settlement writes.
- Successful weekly recap email also publishes the related in-app update. Groups/reminder sends update tournament sent markers.

Notification publication should follow the canonical domain transaction. It must not make a scoring or financial write appear successful if the domain write failed.

## Failure and recovery

When VAPID is absent, the delivery action exits without claiming rows; pending deliveries remain for later repair. Provider/network 429 and 5xx responses retry, while permanent errors fail. Expired leases are recovered automatically, and a full 50-row claim schedules another immediate batch.

Email dispatch guards prevent concurrent equivalent sends and return an explicit retry time during a lease/cooldown. If a send succeeds but guard completion fails, the helper logs the bookkeeping failure rather than encouraging a duplicate external send.

Before replaying either channel, inspect the event dedupe key, sent marker, delivery attempts/status, subscription validity, and email guard. Never clear a guard or marker merely to make an admin button available.

## Authorization and privacy

- Inbox, preferences, read state, and subscription mutations resolve the current member and enforce ownership.
- Notification publishers, queue claiming/finalization, and repair are internal. Email test/bulk actions resolve admin identity on the server.
- Push endpoints and encryption keys, email addresses, preferences, delivery errors, and settlement-linked events are private operational data.
- Known hardening gap: `claimPendingDeliveries` verifies that referenced rows exist, the subscription is enabled, and the category is allowed, but does not verify `notification.memberId === delivery.memberId` and `subscription.memberId === delivery.memberId`. Until fixed and tested, do not claim queue rows are ownership-consistent by construction.

## Focused tests

- `convex/notifications.test.ts`: deduplication, defaults/preferences, inbox ownership, timing, team-moment detection, and delivery behavior
- `convex/emailsReminder.test.ts`: missing-team recipient safety and timing
- `convex/utils/emails.test.ts`: formatting, link construction, previews, and batch behavior
- `convex/hardening.test.ts`: email admin authorization, identity handling, bounds, and lease/cooldown controls
- `convex/settlements.test.ts`: financial notification triggers

## Reconciliation notes

- Notification settings/push enrollment are backend-and-hook complete but not wired to a component.
- `teamMoments` exists as a category and detector but has no publisher.
- Preferences suppress push only; inbox rows are still created. UI copy should reflect that distinction.
- `/admin` does not expose every email API: only weekly recap and missing-team bulk workflows are wired. Groups-finalized and season-opener workflows have no frontend or scheduled caller.
- `email-templates/` contains weekly recap, missing-team reminder, and season-opener sources but no groups-finalized source, even though groups delivery and the weekly fallback depend on `BREVO_GROUPS_FINALIZED_TEMPLATE_ID`.
- Operations documentation must include all three VAPID variables; older setup docs omitted them.
- The queue ownership equality checks described above are an implementation gap and should not be papered over as an invariant.

## Related links

- [Members and access](./MEMBERS_AND_ACCESS.md)
- [Tournament lifecycle](./TOURNAMENT_LIFECYCLE.md)
- [Finance and settlements](./FINANCE_AND_SETTLEMENTS.md)
- [Product surfaces and states](../product/SURFACES_AND_STATES.md)
- [Integrations](../architecture/INTEGRATIONS.md)
- [Admin and automation](../operations/ADMIN_AND_AUTOMATION.md)
- [Security, performance, and incidents](../operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md)
