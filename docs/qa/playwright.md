# Playwright E2E

QA-1 provides a Chromium-first browser suite for public, Student, Tutor, Admin, localization, password-visibility, select, responsive-overflow, console, and HTTP 5xx regressions.

## Install

```powershell
npm ci
npx playwright install chromium
```

Playwright reports are written to `playwright-report/`; traces, screenshots, videos, and other run output are written to `test-results/`. Both directories and `.playwright/` authentication state are ignored by Git.

## Targets and safety

Local is the default:

```powershell
npm run test:e2e:local
```

The local runner starts or reuses `http://localhost:3000`. Override the port only with an allowlisted localhost origin:

```powershell
$env:E2E_BASE_URL = "http://127.0.0.1:3001"
npm run test:e2e:local
```

Remote staging defaults to the Railway fallback URL:

```powershell
npm run test:e2e:staging
```

Later, select the custom staging origin explicitly:

```powershell
$env:E2E_BASE_URL = "https://staging.futuretutor.ca"
npm run test:e2e:staging
```

The fail-closed guard allows only localhost/127.0.0.1, the FutureTutor Railway staging fallback, and `staging.futuretutor.ca`. It always rejects `futuretutor.ca`, `www.futuretutor.ca`, lookalike hosts, URL credentials, paths, and arbitrary origins.

## Credentials

Authenticated tests require role-specific variables and skip cleanly when a role is not configured:

- `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`
- `E2E_TUTOR_EMAIL`, `E2E_TUTOR_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`

Keep values in an ignored local environment file or CI secret store. Never put credentials or generated session state in source control. Each role uses its own login helper and is never substituted for another role.

## Commands

```powershell
npm run test:e2e
npm run test:e2e:local
npm run test:e2e:staging
npm run test:e2e:headed
```

Pass normal Playwright CLI arguments after the runner when invoking `node e2e/run.mjs`, for example `node e2e/run.mjs staging --project=chromium-375`.

## External systems

The normal suite does not send Resend email and does not create Stripe PaymentIntents, charges, refunds, transfers, or Connect mutations. `E2E_EXTERNAL_EMAIL=true` and `E2E_FINANCIAL=true` currently fail closed because those future suites have not been implemented or authorized. A later external suite must remain separately invoked and explicitly reviewed.

## CI readiness

Install Chromium with `npx playwright install --with-deps chromium`, provide an allowlisted `E2E_BASE_URL`, and add only the role secrets needed by the selected tests. Do not schedule remote staging tests or make them deployment gates until credentials and environment policy are reviewed. Failure artifacts are already configured for CI retention.
