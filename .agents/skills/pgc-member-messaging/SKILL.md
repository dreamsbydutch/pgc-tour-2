---
name: pgc-member-messaging
description: Explain, diagnose, test, or change PGC in-app notifications, web push delivery, Brevo email, member preferences, reminders, deduplication, leases, retries, recipient safety, or messaging audits.
---

# PGC member messaging

Read `docs/DEVELOPMENT_AND_OPERATIONS.md` before changing or sending messages. Do not send a real league email or push notification unless explicitly authorized.

## Keep delivery lanes distinct

- In-app notifications are durable member inbox rows.
- Web push is an optional delivery attempt for an in-app notification.
- Brevo email is a separate operational channel with its own recipients, templates, dispatch guards, and sent markers.

Current categories are league updates, pick reminders, final results, team moments, financial, and milestones. Missing preference rows default on. Publishing creates the in-app notification regardless of push preference; the preference controls push delivery creation and is checked again when claiming work.

## Publish safely

- Use one stable domain `dedupeKey` per event, not a random timestamp unless distinct repeats are intentional.
- Deduplicate recipients by member ID. Normalize links to a single-root relative path; truncate titles/bodies at the established boundary.
- Build recipients from indexed domain records and exclude inactive/ineligible members. Never trust client-supplied recipient identity.
- Register push endpoints to the current authenticated member; one browser endpoint belongs to its latest signed-in member.
- Schedule pick reminders for 7 p.m. course-local time the day before play. Final results publish only after authoritative completion.

## Deliver and recover push

Claim at most 50 due deliveries with a five-minute lease. Recheck notification, subscription, enabled state, and current preference before delivery. The notification, queued delivery, and subscription must still belong to the same intended member; endpoint reassignment never transfers notification content. Mark any ineligible row `skipped` before incrementing attempts or making an HTTP request. Finalize attempted work only when the lease token still owns the row.

- Success: mark sent and reset subscription failures.
- HTTP 404/410: treat the subscription as expired and delete it.
- HTTP 429/5xx: retry with exponential minute backoff while attempts remain.
- Other failures or the third failed attempt: mark failed.
- Repair expired processing leases back to pending and reschedule due work.

Keep VAPID keys server-only; missing configuration should skip delivery without corrupting notification state.

## Send email safely

Require admin authorization for public send/test actions. Use `BREVO_TEST_TO` and test actions before any bulk send. Acquire a server-side dispatch lease/cooldown keyed to the message operation; ignore completion from an expired owner. Validate template IDs, recipient data, and `APP_BASE_URL`, and persist domain sent markers only after the intended send succeeds.

Primary code is `convex/functions/notifications.ts`, `pushDelivery.ts`, `emails.ts`, `convex/utils/notifications.ts`, email templates, and `convex/notifications.test.ts`/`hardening.test.ts`.

Test event/recipient dedupe, preference changes after enqueue, endpoint reassignment, malformed links, exact reminder timing, lease conflicts/expiry, retry classification and cap, missing VAPID, email cooldowns, admin authorization, safe test recipient routing, and no duplicate domain sends.
