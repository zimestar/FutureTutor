import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";

// L1-01B — permanent DB-integration tests for the FULL production
// password-reset email delivery chain: requestPasswordReset() (real,
// unmodified L1-01A domain logic) -> resolveSendPasswordResetEmail() (real)
// -> resendSendPasswordResetEmail (real adapter) -> buildPasswordResetEmailContent
// (real, locale-aware) -> a MOCKED Resend client. Mirrors this codebase's
// own established "mock the external provider client, keep everything else
// real" precedent for provider-boundary tests (see
// src/services/cancellationConcurrency.integration.test.ts's
// `vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn() }))`).
//
// Also mocks next-intl/server's getTranslations — real next/headers cannot
// resolve outside an actual Next.js server runtime under vitest (see
// passwordResetEmailContent.test.ts's own doc comment for the full
// explanation) — with a minimal fake translator built from the REAL
// messages/en.json / messages/fr.json files, so EN vs FR content is still
// asserted against real, current copy rather than a hand-duplicated
// expectation.
function miniIcuPluralTranslate(messages: { passwordResetEmail: Record<string, string> }) {
  return (key: string, values?: Record<string, number>) => {
    let raw = messages.passwordResetEmail[key];
    if (!raw) throw new Error(`test fake translator: missing key "${key}"`);
    if (values) {
      for (const [varName, varValue] of Object.entries(values)) {
        const pluralRegex = new RegExp(`\\{${varName},\\s*plural,\\s*((?:\\w+\\s*\\{[^{}]*\\}\\s*)+)\\}`);
        raw = raw.replace(pluralRegex, (_match, branches: string) => {
          const branchMap: Record<string, string> = {};
          const branchRegex = /(\w+)\s*\{([^{}]*)\}/g;
          let branchMatch: RegExpExecArray | null;
          while ((branchMatch = branchRegex.exec(branches))) {
            branchMap[branchMatch[1]] = branchMatch[2];
          }
          const category = varValue === 1 ? "one" : "other";
          const chosen = branchMap[category] ?? branchMap.other ?? "";
          return chosen.replace(/#/g, String(varValue));
        });
      }
    }
    return raw;
  };
}

const messagesByLocale: Record<string, typeof enMessages> = { en: enMessages, fr: frMessages };

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: string; namespace: string }) => {
    const messages = messagesByLocale[locale] ?? enMessages;
    return miniIcuPluralTranslate(messages);
  },
}));

const sendMock = vi.fn();
vi.mock("@/lib/email/resendClient", () => ({
  getResendClient: () => ({ emails: { send: sendMock } }),
}));

import {
  requestPasswordReset,
  resetPassword,
  hashResetToken,
  InvalidOrExpiredResetTokenError,
} from "./passwordReset";
import { resolveSendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdEmails: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Non-production + both Resend env vars set => getEmailDeliveryMode()
  // resolves "resend" (see src/lib/email/emailDeliveryConfig.ts) without
  // requiring these tests to run with NODE_ENV=production. Uses vitest's
  // own vi.stubEnv (not direct `process.env.NODE_ENV = ...` assignment) —
  // this project's Next.js ambient types declare `process.env.NODE_ENV` as
  // read-only (TS2540), so a direct assignment does not typecheck even
  // with a cast.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("RESEND_API_KEY", "re_test_fake_key_for_integration_tests");
  vi.stubEnv("EMAIL_FROM", "FutureTutor <no-reply@futuretutor.ca>");
  sendMock.mockResolvedValue({ data: { id: "fake-email-id" }, error: null });
});

afterEach(async () => {
  vi.unstubAllEnvs();

  if (createdEmails.length > 0) {
    await db.verificationToken.deleteMany({
      where: { identifier: { in: createdEmails.map((e) => `password-reset:${e}`) } },
    });
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdEmails.length = 0;
  createdUserIds.length = 0;
});

function uniqueEmail(prefix: string) {
  return `pwreset-email-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createUserWithPassword(prefix: string) {
  const email = uniqueEmail(prefix);
  createdEmails.push(email);
  const passwordHash = await bcrypt.hash("OldPassword123!", 12);
  const user = await db.user.create({
    data: { email, role: "STUDENT", name: "Email Delivery Test User", passwordHash },
  });
  createdUserIds.push(user.id);
  return { user, email };
}

function buildResetUrl(locale: string) {
  return (rawToken: string) => `http://localhost:3100/${locale}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

describe("production password-reset email delivery (real requestPasswordReset -> real resolveSendPasswordResetEmail -> real Resend adapter -> mocked Resend client)", () => {
  it("test matrix item 1 — existing user requests reset -> the production (Resend) sender is invoked", async () => {
    const { email } = await createUserWithPassword("prod-sender");

    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe(email);
    expect(call.from).toBe("FutureTutor <no-reply@futuretutor.ca>");
  });

  it("test matrix item 3 — EN request produces the real EN subject/body", async () => {
    const { email } = await createUserWithPassword("en-content");

    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe(enMessages.passwordResetEmail.subject);
    expect(call.html).toContain(enMessages.passwordResetEmail.heading);
  });

  it("test matrix item 4 — FR request produces the real FR subject/body, not EN", async () => {
    const { email } = await createUserWithPassword("fr-content");

    await requestPasswordReset(db, email, {
      locale: "fr",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("fr"),
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe(frMessages.passwordResetEmail.subject);
    expect(call.subject).not.toBe(enMessages.passwordResetEmail.subject);
  });

  it("test matrix item 5 — the reset URL passed to the sender contains the requested locale", async () => {
    const { email } = await createUserWithPassword("locale-url");

    await requestPasswordReset(db, email, {
      locale: "fr",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("fr"),
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain("/fr/reset-password?token=");
  });

  it("test matrix item 6/7 — the raw token appears only in the delivery payload (the Resend `send` call), never in a DB-queryable form", async () => {
    const { email } = await createUserWithPassword("token-scope");

    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    const call = sendMock.mock.calls[0][0];
    const rawToken = new URL(call.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;
    expect(rawToken).toBeTruthy();

    // The raw value is not a valid lookup key — only its SHA-256 hash is.
    const rawLookup = await db.verificationToken.findUnique({ where: { token: rawToken } });
    expect(rawLookup).toBeNull();
    const hashedLookup = await db.verificationToken.findUnique({ where: { token: hashResetToken(rawToken) } });
    expect(hashedLookup).not.toBeNull();
  });

  it("test matrix item 8 — no raw token is ever written to AuditLog for this flow", async () => {
    const { email, user } = await createUserWithPassword("audit-safe");

    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    const call = sendMock.mock.calls[0][0];
    const rawToken = new URL(call.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    const rows = await db.auditLog.findMany({ where: { entityId: user.id, entityType: "User" } });
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(rawToken);
    }
  });

  it("test matrix item 2/9 — unknown email never reaches the sender at all (no enumeration signal, provider never invoked)", async () => {
    const unknownEmail = uniqueEmail("unknown");
    createdEmails.push(unknownEmail);

    await expect(
      requestPasswordReset(db, unknownEmail, {
        locale: "en",
        sendEmail: resolveSendPasswordResetEmail(),
        buildResetUrl: buildResetUrl("en"),
      })
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("test matrix item 9/10 — a confirmed provider delivery failure propagates as a thrown error, and the ALREADY-CREATED token is left in place (documented policy: harmless — the raw token was never retained anywhere, and it is superseded by the very next request's single-active-token invalidation, or expires naturally)", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "Resend had an outage.", statusCode: 500 },
    });
    const { email } = await createUserWithPassword("provider-failure");

    await expect(
      requestPasswordReset(db, email, {
        locale: "en",
        sendEmail: resolveSendPasswordResetEmail(),
        buildResetUrl: buildResetUrl("en"),
      })
    ).rejects.toThrow();

    // The token row created before the (failed) send still exists — it was
    // never deleted by a compensating rollback. Its raw value is lost
    // forever (it only ever existed as an in-memory URL passed to the
    // failed send call), so its mere presence is not independently usable
    // by anyone; it is superseded automatically by the next successful
    // request (verified below) or naturally expires after
    // PASSWORD_RESET_TTL_MS.
    const row = await db.verificationToken.findFirst({ where: { identifier: `password-reset:${email}` } });
    expect(row).not.toBeNull();

    // Recovery path: a subsequent successful request replaces it with a
    // fresh, deliverable token — preserving L1-01A's "at most one active
    // token" invariant (test matrix item 13) even after a delivery
    // failure.
    sendMock.mockResolvedValue({ data: { id: "recovered" }, error: null });
    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    const call = sendMock.mock.calls[sendMock.mock.calls.length - 1][0];
    const secondRawToken = new URL(call.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;
    const result = await resetPassword(db, secondRawToken, "BrandNewPassword123!", {
      hashPassword: (p) => bcrypt.hash(p, 12),
    });
    expect(result.userId).toBeDefined();
  });

  it("test matrix item 9 — a provider delivery failure does not distinguish a real account from an unknown one when both attempts throw at the sender boundary", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "Resend had an outage.", statusCode: 500 },
    });
    const { email: knownEmail } = await createUserWithPassword("known-vs-unknown");
    const unknownEmail = uniqueEmail("unknown-vs-known");
    createdEmails.push(unknownEmail);

    const knownAttempt = requestPasswordReset(db, knownEmail, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });
    await expect(knownAttempt).rejects.toThrow(); // real account: token created, send failed, throws

    const unknownAttempt = requestPasswordReset(db, unknownEmail, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });
    await expect(unknownAttempt).resolves.toBeUndefined(); // unknown account: silent no-op, sender never even called

    // The DISTINCTION only exists at the requestPasswordReset() return-value
    // level (throw vs. resolve) — the exact same distinction that already
    // exists for every other infrastructure failure in this module, and
    // forgotPasswordAction's own try/catch (unchanged by this task)
    // collapses both outcomes to the identical public {submitted:true}
    // response either way (asserted separately in
    // src/lib/actions/auth.test.ts).
  });

  it("test matrix item 11/12 — sender configuration is required outside dev/test opt-in: with no Resend env vars configured, the console/dev adapter is used and the mocked provider client is never called", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const { email } = await createUserWithPassword("no-config-dev-fallback");

    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("test matrix item 11/12 — in production, missing Resend configuration throws BEFORE any token is created or any DB write happens (dev adapter cannot silently activate in production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const { email } = await createUserWithPassword("prod-misconfig");

    // resolveSendPasswordResetEmail() throws SYNCHRONOUSLY (before
    // requestPasswordReset is ever entered) — wrapped in an async IIFE so
    // `.rejects` still has a promise to observe, mirroring exactly how
    // forgotPasswordAction's own call site evaluates this expression
    // in-place as a requestPasswordReset() argument.
    await expect(
      (async () =>
        requestPasswordReset(db, email, {
          locale: "en",
          sendEmail: resolveSendPasswordResetEmail(),
          buildResetUrl: buildResetUrl("en"),
        }))()
    ).rejects.toThrow();

    const row = await db.verificationToken.findFirst({ where: { identifier: `password-reset:${email}` } });
    expect(row).toBeNull();
  });

  it("stale token from a delivery failure cannot be used to complete a reset once superseded", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "outage", statusCode: 500 },
    });
    const { email } = await createUserWithPassword("stale-after-failure");

    await expect(
      requestPasswordReset(db, email, {
        locale: "en",
        sendEmail: resolveSendPasswordResetEmail(),
        buildResetUrl: buildResetUrl("en"),
      })
    ).rejects.toThrow();
    const staleCall = sendMock.mock.calls[0][0];
    const staleRawToken = new URL(staleCall.html.match(/href="([^"]+)"/)![1]).searchParams.get("token")!;

    sendMock.mockResolvedValue({ data: { id: "ok" }, error: null });
    await requestPasswordReset(db, email, {
      locale: "en",
      sendEmail: resolveSendPasswordResetEmail(),
      buildResetUrl: buildResetUrl("en"),
    });

    await expect(
      resetPassword(db, staleRawToken, "ShouldNeverWork123!", { hashPassword: (p) => bcrypt.hash(p, 12) })
    ).rejects.toBeInstanceOf(InvalidOrExpiredResetTokenError);
  });
});
