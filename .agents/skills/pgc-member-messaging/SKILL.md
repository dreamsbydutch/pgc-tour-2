---
name: pgc-member-messaging
description: Explain, diagnose, test, or change PGC in-app notifications, web push, Brevo email, preferences, reminders, deduplication, leases, retries, recipient and link safety, or messaging audits. Use for message publication and delivery; underlying financial, roster, or tournament-state writes use their domain skills.
metadata:
  short-description: Maintain PGC member messaging
---

# PGC member messaging

Read [messaging and notifications](../../../docs/domain/MESSAGING_AND_NOTIFICATIONS.md) and the [admin automation runbook](../../../docs/operations/ADMIN_AND_AUTOMATION.md).

## Scope and handoffs

Own in-app notification publication, optional web-push attempts, Brevo email, member preferences, reminders, dedupe, dispatch leases, retries, links, channel eligibility, delivery targeting, recipient safety, and messaging audits.

The owning domain decides which members a domain event addresses; messaging decides which eligible channels may deliver it and how those attempts are targeted safely.

Use `$pgc-tournament-lifecycle` for event timing/status and the relevant domain skill for the write that creates a messaging event. A notification is a consequence, not the source of truth.

## Preserve delivery safety

- Keep in-app inbox rows, push attempts, and email dispatch as distinct lanes.
- Use stable domain event and recipient dedupe keys; derive recipients from indexed server data, not client-supplied identity.
- Normalize app links and keep titles/bodies within established boundaries.
- Recheck current preference and eligible delivery state where the implementation supports it, and preserve lease-token ownership when finalizing work.
- Do not assume or promise a claim-time member-ownership reconciliation that current code does not enforce. Trace subscription, delivery, and endpoint relationships before changing or documenting reassignment behavior.
- Classify retryable, expired-subscription, skipped, and terminal failures explicitly; keep jobs bounded and recover expired leases.
- Keep VAPID and Brevo credentials server-only. Missing configuration must fail or skip truthfully without corrupting domain state.
- Never send a real league email or push notification without explicit authorization. Use configured test-recipient actions before bulk email.

## Trace and verify

Trace domain event to `convex/functions/notifications.ts`, `convex/functions/pushDelivery.ts` or `convex/functions/emails.ts`, preferences/subscriptions, delivery result, audit, and member UI. Shared logic lives in `convex/utils/notifications.ts` and email utilities/templates.

Test event/recipient dedupe, preference changes, endpoint reassignment behavior actually enforced by code, malformed links, reminder boundaries, lease conflicts/expiry, retry classification/cap, missing configuration, email cooldowns, admin authorization, test routing, and duplicate prevention.
