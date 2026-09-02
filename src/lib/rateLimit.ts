import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * BETA-OPS1 — server-side, Postgres-backed fixed-window rate limiting.
 * Deliberately not Redis/an external vendor: this is the only rate-limiting
 * need in the app, and the existing Supabase/Postgres infrastructure already
 * supports it cleanly via an atomic `INSERT ... ON CONFLICT DO UPDATE`
 * (see prisma/schema.prisma's RateLimitBucket comment). Correct under
 * horizontal scaling by construction — Postgres is the single source of
 * truth, not per-instance memory, so this holds even if Railway ever runs
 * more than one replica of this service.
 */

export interface RateLimitConfig {
  /** Fixed window length in milliseconds. */
  windowMs: number;
  /** Max attempts allowed within one window for one key. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window rolls over — safe to surface as a
   * Retry-After hint even though this isn't an HTTP response. */
  retryAfterSeconds: number;
}

/**
 * Atomically increments the counter for (key, current window) and reports
 * whether this attempt is still within the configured limit. `key` should
 * already encode scope + identifier + action (e.g.
 * "login:email:foo@example.com" or "register:ip:1.2.3.4") — this function
 * does no normalization of its own.
 */
export async function checkRateLimit(key: string, { windowMs, max }: RateLimitConfig): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (id, key, "windowStart", count, "createdAt")
    VALUES (${randomUUID()}, ${key}, ${windowStart}, 1, now())
    ON CONFLICT (key, "windowStart") DO UPDATE SET count = "RateLimitBucket".count + 1
    RETURNING count
  `;
  const count = rows[0]?.count ?? 1;
  const windowEnd = windowStart.getTime() + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
  return { allowed: count <= max, retryAfterSeconds };
}

/**
 * Best-effort client IP extraction for defense-in-depth rate limiting —
 * NOT a security boundary on its own (the primary gate on every
 * rate-limited action below is the normalized account identifier, e.g.
 * email; IP is a secondary layer). Railway does not publish a documented,
 * verifiable trusted-proxy chain for this app to validate against, so this
 * deliberately does not "trust" any header as authoritative — it reads the
 * conventional `x-forwarded-for` leftmost entry (the standard "original
 * client" position most reverse proxies, including Railway's edge, use) as
 * a best-effort signal only. A spoofed header can only ever affect the
 * IP-scoped bucket, never bypass the identifier-scoped one.
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  return real ? real.trim() : null;
}

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** DEV-labeled starting thresholds — not tuned against real abuse traffic,
 * deliberately conservative for a Closed Beta's traffic volume. Named
 * constants (not inlined at each call site) so a future tuning pass changes
 * one place. loginByEmail/loginByIp were raised from an initial 10/30 after
 * live staging E2E verification showed 10 per 15 minutes is too tight for
 * realistic legitimate use (a single Playwright run exercises ~9 viewport
 * projects, each logging in once — plus real users switching devices,
 * retrying a mistyped password, etc.) — every attempt counts toward the
 * limit, successful or not, since rate limiting must happen before the
 * expensive credential check. 20/15min still meaningfully throttles
 * brute-forcing (a guesser is capped at ~80 attempts/hour) while comfortably
 * covering legitimate multi-context usage. */
export const RATE_LIMITS = {
  loginByEmail: { windowMs: 15 * 60_000, max: 20 } satisfies RateLimitConfig,
  loginByIp: { windowMs: 15 * 60_000, max: 60 } satisfies RateLimitConfig,
  registerByIp: { windowMs: 60 * 60_000, max: 10 } satisfies RateLimitConfig,
  forgotPasswordByEmail: { windowMs: 60 * 60_000, max: 5 } satisfies RateLimitConfig,
  forgotPasswordByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
  resetPasswordByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
  invitationClaimByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
  adminSetupByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
  // BETA-EMAILVERIFY1 — mirrors forgotPassword's identifier+IP pair exactly
  // (same enumeration-safety reasoning: the identifier bucket is keyed on
  // the submitted email regardless of whether an account exists for it).
  emailVerificationResendByEmail: { windowMs: 60 * 60_000, max: 5 } satisfies RateLimitConfig,
  emailVerificationResendByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
  // Mirrors resetPasswordByIp — the verification token itself is
  // cryptographically random and single-use, so there's no meaningful
  // account identifier to key an identifier-scoped bucket on; this guards
  // against automated scanning across many guessed tokens.
  verifyEmailByIp: { windowMs: 60 * 60_000, max: 20 } satisfies RateLimitConfig,
} as const;

/** Checks both an identifier-scoped bucket (the primary, non-spoofable gate)
 * and an IP-scoped bucket (best-effort defense-in-depth) for one action,
 * returning `allowed: false` if either is exceeded. `identifier` should
 * already be a stable, normalized value (e.g. a lowercased email) — pass
 * `null` to skip the identifier check (e.g. signup, where there's no
 * existing account to key on). */
export async function checkActionRateLimit(params: {
  action: string;
  identifier: string | null;
  ip: string | null;
  identifierLimit: RateLimitConfig;
  ipLimit: RateLimitConfig;
}): Promise<RateLimitResult> {
  const { action, identifier, ip, identifierLimit, ipLimit } = params;
  const checks: Promise<RateLimitResult>[] = [];
  if (identifier) checks.push(checkRateLimit(`${action}:id:${normalizeEmailKey(identifier)}`, identifierLimit));
  if (ip) checks.push(checkRateLimit(`${action}:ip:${ip}`, ipLimit));
  if (checks.length === 0) return { allowed: true, retryAfterSeconds: 0 };
  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  return blocked ?? results[0];
}
