import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptAnalyticsConsent, getConsentState, hasAnalyticsConsent, rejectAnalyticsConsent, revokeAnalyticsConsent } from "./consent";

// DATA-1 — consent.ts checks `typeof window === "undefined"` to stay
// SSR-safe; this test file's vitest environment is plain Node (this
// project's own convention — see vitest.config.ts), so a minimal
// in-memory localStorage-shaped stub is installed on globalThis.window
// for the duration of these tests, then removed. Every function reads
// storage fresh on each call (no cached module state), so a single shared
// import is safe to reuse across tests as long as the fake store itself
// is reset in beforeEach.

function installFakeWindow() {
  const store = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  // @ts-expect-error — deliberately minimal test-only global stub, not a full Window.
  globalThis.window = { localStorage: fakeLocalStorage };
}

function uninstallFakeWindow() {
  // @ts-expect-error — test-only cleanup.
  delete globalThis.window;
}

describe("analytics consent state machine", () => {
  beforeEach(() => {
    installFakeWindow();
  });

  afterEach(() => {
    uninstallFakeWindow();
  });

  it("defaults to undecided, never assumes consent", () => {
    expect(getConsentState().analytics).toBe("undecided");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("accept grants consent, persists policyVersion and a timestamp", () => {
    acceptAnalyticsConsent("2026-08-30");
    const state = getConsentState();
    expect(state.analytics).toBe("granted");
    expect(state.policyVersion).toBe("2026-08-30");
    expect(state.decidedAt).not.toBeNull();
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("reject denies consent — hasAnalyticsConsent stays false", () => {
    rejectAnalyticsConsent("2026-08-30");
    expect(getConsentState().analytics).toBe("denied");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("revoke returns to undecided regardless of the prior decision", () => {
    acceptAnalyticsConsent("2026-08-30");
    revokeAnalyticsConsent();
    const state = getConsentState();
    expect(state.analytics).toBe("undecided");
    expect(state.policyVersion).toBeNull();
    expect(state.decidedAt).toBeNull();
  });

  it("a decision persists across separate reads (simulating separate page loads)", () => {
    acceptAnalyticsConsent("2026-08-30");
    expect(getConsentState().analytics).toBe("granted");
    expect(getConsentState().analytics).toBe("granted");
  });

  it("fails closed to undecided when storage throws (private browsing simulation)", () => {
    // Simulate a browser where localStorage throws (private browsing). Cast
    // through unknown rather than a per-line @ts-expect-error, since the
    // diagnostic for a minimal stub object can land on a nested property
    // line rather than the assignment itself.
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    } as unknown as Window & typeof globalThis;
    expect(getConsentState().analytics).toBe("undecided");
    expect(hasAnalyticsConsent()).toBe(false);
    // Writing must not throw out of the caller either.
    expect(() => acceptAnalyticsConsent("2026-08-30")).not.toThrow();
  });

  it("returns undecided (never throws) when running server-side (no window)", () => {
    uninstallFakeWindow();
    expect(getConsentState().analytics).toBe("undecided");
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => acceptAnalyticsConsent("2026-08-30")).not.toThrow();
  });
});
