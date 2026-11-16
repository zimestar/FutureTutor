# Closed Beta gates — operations runbook

Status today: **both gates active** in every environment (nothing is set, so both default to active). Every change described here is a human decision made in the Railway dashboard. Nothing switches automatically.

Source of truth: `src/lib/closedBetaConfig.ts` (RW-22).

## The two gates

| Variable | When `active` | Enforced in |
|---|---|---|
| `CLOSED_BETA_FINANCIAL_GATE` | No paid tutoring can start: no PaymentIntent, no booking reservation, no Quick Match confirmation. | `createBookingAction`, `preparePaymentForBookingQuoteAction`, `preparePaymentForRequestAction`, `confirmTutoringRequestAction` |
| `CLOSED_BETA_ONLINE_ONLY` | Sessions and learner preferences are ONLINE only. IN_PERSON is refused and hidden from the forms. New accounts default to an ONLINE preference. | Direct booking and pricing, Quick Match request creation, profile and family preference changes, signup and child-creation defaults, the Quick Match / profile / family pages |

Accepted values are exactly `active` or `inactive`, lowercase with no spaces.

`BOTH` is never an actual session mode, whatever these gates say (RW-02).

Direct-booking IN_PERSON is refused **unconditionally**, whatever these gates say: direct booking does not collect an address yet.

## How each gate is resolved (per gate, independently)

1. **Its own variable is present.** `active` or `inactive` is used as-is. **Any other value** (a typo, `Inactive`, `" inactive"`, an empty string) resolves to **active**. An invalid value never falls back to the legacy variable, so a typo can never inherit a permissive setting.
2. **Its own variable is absent.** The deprecated `CLOSED_BETA_MODE` is used if it is valid.
3. **Otherwise:** active.

So a deployment that sets neither new variable behaves exactly as before RW-22.

`CLOSED_BETA_MODE` is **deprecated**. It is still honoured as the fallback, but do not use it for new changes; set the two explicit variables instead.

These gates are independent of `PAYMENT_MODE`, `STRIPE_CONNECT_ENABLED` and `FINANCIAL_E2E_*`, which keep their own meaning. The time-boxed financial E2E exception still only applies **while the financial gate is active**.

## The four combinations

| Financial gate | Online-only | Meaning | Allowed in production? |
|---|---|---|---|
| active | active | Free closed beta, online only (**today**) | Yes |
| **inactive** | **active** | **First paid launch:** paid ONLINE sessions; IN_PERSON refused | Only after RW-05, RW-06 and RW-08 are complete and reviewed |
| active | inactive | Free beta that accepts in-person Quick Match requests (direct-booking IN_PERSON still refused) | Only after RW-23 and in-person workflow verification |
| inactive | inactive | Full launch | Only after all of the above |

### Hard prerequisites

- **Do not set `CLOSED_BETA_FINANCIAL_GATE=inactive` in production** until all three are complete and reviewed:
  - RW-05: production financial end-to-end test;
  - RW-06: Stripe platform onboarding, including refund/chargeback liability and seller compliance acknowledgments;
  - RW-08: payments cron scheduled.
- **Do not set `CLOSED_BETA_ONLINE_ONLY=inactive` in production** until both are done:
  - RW-23: Quick Match IN_PERSON travel pricing. Quick Match supplies no distance today, so no travel adjustment is applied;
  - the in-person workflow (address privacy, arrival instructions, tutor matching by city) has been verified end to end.

## Checking the effective values

**Admin → Financial ops** (`/admin/financial-ops`) shows the **resolved** values:
- `Financial gate: ACTIVE/INACTIVE`
- `Online-only: ACTIVE/INACTIVE`

The page is read-only. It requires an ADMIN or SUPER_ADMIN account with the `ADMIN_PAYMENTS_READ` permission (checked against the database on every request). It never shows raw environment values, and nothing on the page can change a gate.

## Changing a gate (Railway → FutureTutor → production → Variables)

1. Confirm the prerequisites above for the gate you are changing.
2. Set **only** that gate's variable to exactly `active` or `inactive`. Railway redeploys automatically.
3. After the deploy, open `/admin/financial-ops` and confirm the displayed value.

## Rollback

Set the variable to `active`, or delete it if `CLOSED_BETA_MODE` is unset or `active`. The next request after the redeploy is gated again. No data migration is involved, and existing bookings are not affected.
