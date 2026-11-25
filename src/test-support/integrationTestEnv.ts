import net from "node:net";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { expect, vi } from "vitest";

/**
 * RW-11 — hermetic environment for *.integration.test.ts (vitest setupFiles;
 * a no-op for every other test file).
 *
 * Integration results used to depend on whatever the caller exported: loading
 * the whole local .env made post-commit dispatch contact the real Resend API,
 * and loading nothing made payment-mode-dependent tests fail. Now:
 *  - only DATABASE_URL / DATABASE_URL_TEST are taken from .env (the caller's
 *    own values win, e.g. in CI); resolveVerifiedTestDatabase() still decides
 *    whether they are acceptable;
 *  - provider settings are removed or replaced by a dummy, even if the caller
 *    exported a real one;
 *  - any socket to a non-local host throws, so a missing mock fails loudly
 *    instead of reaching a provider.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const REMOVED = /^(RESEND_|EMAIL_|DAILY_|SUPABASE_|FINANCIAL_E2E_|CLOSED_BETA_|STRIPE_CONNECT_|LIFECYCLE_REMINDERS_)/;

export class ExternalNetworkBlockedError extends Error {
  constructor(host: string) {
    super(`Integration tests must not open network connections to non-local hosts (blocked: ${host}).`);
    this.name = "ExternalNetworkBlockedError";
  }
}

/** Null means "not a TCP target" (IPC path). */
function targetHost(args: unknown[]): string | null {
  // net.connect passes one normalized [options, callback] array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    const { path, host, port } = first as { path?: string; host?: string; port?: unknown };
    // https options carry an URL path alongside host/port; only a path with
    // neither is an IPC target.
    if (path && host === undefined && port === undefined) return null;
    return host ?? "localhost";
  }
  if (typeof first === "string" && Number.isNaN(Number(first))) return null;
  return typeof args[1] === "string" ? args[1] : "localhost";
}

function applyIntegrationTestEnv() {
  // Real-Postgres tests do many sequential round trips; the 5s unit default
  // produced timeouts on a busy machine, never a wrong result.
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

  let fromFile: Record<string, string> = {};
  try {
    fromFile = parse(readFileSync(".env", "utf8"));
  } catch {
    // No .env (e.g. CI): DATABASE_URL* must then come from the environment.
  }
  for (const key of ["DATABASE_URL", "DATABASE_URL_TEST"]) {
    if (!process.env[key] && fromFile[key]) process.env[key] = fromFile[key];
  }
  for (const key of Object.keys(process.env)) {
    if (REMOVED.test(key)) delete process.env[key];
  }
  process.env.PAYMENT_MODE = "stripe_test";
  process.env.STRIPE_SECRET_KEY = "sk_test_integration_dummy";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_integration_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration_dummy";

  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const host = targetHost(args);
    if (host !== null && !LOCAL_HOSTS.has(host)) throw new ExternalNetworkBlockedError(host);
    return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
}

if (expect.getState().testPath?.endsWith(".integration.test.ts")) applyIntegrationTestEnv();
