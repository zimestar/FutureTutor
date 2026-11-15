# Lifecycle reminders — activation runbook

Status today: **fully disabled.** Nothing in this document has been done. Every step below is a human decision and a human action in the Resend and Railway dashboards — no step is performed automatically.

## Why this exists

Before LIFECYCLE-ACTIVATION-1, activation was all-or-nothing: setting `LIFECYCLE_REMINDERS_CRON_SECRET` and a schedule would have emailed every eligible real user (9 at the last dry run) on the first tick, with no way to test on your own account first. Activation now requires two independent keys:

| Variable | Purpose |
|---|---|
| `LIFECYCLE_REMINDERS_CRON_SECRET` | Authenticates the cron call. Unset → the route returns 500 and does nothing. |
| `LIFECYCLE_REMINDERS_MODE` | `disabled` (default when unset or mistyped), `canary`, or `live`. |
| `LIFECYCLE_REMINDERS_CANARY_EMAILS` | Comma-separated exact email addresses. Only read in `canary` mode. |

In `canary` mode, a recipient not on the list never gets a `LifecycleReminder` row at all — the gate is applied before the claim, not just before the send.

## Step 0 — prerequisite: delivery tracking

Do `docs/lifecycle/LIFECYCLE-1C-EMAIL-ATTRIBUTION.md` §26 first (Resend webhook + `RESEND_WEBHOOK_SECRET`), so the canary email's delivery/open/click events are recorded.

## Step 1 — create a canary account

Sign up on https://futuretutor.ca as a **Tutor** with an email address you control (an alias such as `you+ftcanary@yourdomain` works). Do not complete the profile — leave it in DRAFT so it is genuinely "user action required".

Then **wait at least 24 hours.** The R1 threshold is measured from the account's last meaningful progress (its creation, here). This is deliberately not faked — the system never edits timestamps.

## Step 2 — enable canary mode (Railway → FutureTutor → production → Variables)

- `LIFECYCLE_REMINDERS_MODE` = `canary`
- `LIFECYCLE_REMINDERS_CANARY_EMAILS` = the canary address from step 1
- `LIFECYCLE_REMINDERS_CRON_SECRET` = a long random value you generate yourself (never paste it into a chat)

Do **not** configure a cron schedule yet.

## Step 3 — trigger exactly one tick by hand

```
curl -X POST https://futuretutor.ca/api/cron/lifecycle-reminders-tick -H "x-cron-secret: <your secret>"
```

Expected response: `"mode":"canary"`, `"claimed":1`, `"outcomes":{"SENT":1,...}`. If `claimed` is 0, the canary account is probably not yet 24h old.

## Step 4 — verify

- The R1 email arrives at the canary address, in the right language, with a working "Continue" link to `/tutor/profile`.
- Admin → Tutors → the canary tutor: the Lifecycle card shows R1 `Sent`, then `Delivered` / `Opened` / `Clicked` as you interact with the email.
- Calling the tick again immediately sends nothing new (`claimed: 0`) — idempotency.

## Rollback — at any moment

Delete `LIFECYCLE_REMINDERS_MODE` (or set it to `disabled`). The next tick does nothing at all, and any reminder already claimed but not yet sent is left untouched rather than sent.

## Step 5 — going live (separate decision, not covered here)

Switching to `live` and adding a schedule would send R1 to every eligible real user on the first tick. Decide first:

1. **Stale cohort.** The 9 currently eligible users have been inactive for two months or more. They would receive R1 ("you started your application…"), never jumping straight to R3. Is that acceptable, or should very old episodes be excluded?
2. **Bounces and complaints are recorded but do not stop future reminders.** Automatic suppression after a hard bounce or a spam complaint does not exist yet.
3. **Scale.** Each tick scans at most 50 subjects per role, always the same 50. Fine today (production has 4 tutors, 5 parents, 4 students); it must be reworked before any role exceeds 50.
