import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldLoadGtm, loadGtmIfEligible, pushToDataLayer } from "./vendors";

// DATA-1 — the vendor loader must stay inert until all three conditions
// hold: production hostname, a real NEXT_PUBLIC_GTM_ID, and explicit
// ANALYTICS consent. No NEXT_PUBLIC_GTM_ID is configured in any
// environment today (see docs/analytics/DATA-1-ANALYTICS-FOUNDATION.md's
// human-checkpoint section), so shouldLoadGtm() is unconditionally false
// right now — these tests exercise the logic with a safe, fake test-only
// ID, never a real one.

const originalGtmId = process.env.NEXT_PUBLIC_GTM_ID;

function installFakeBrowser({ hostname, consent, storage }: { hostname: string; consent: "granted" | "denied" | "undecided"; storage?: boolean }) {
  const store = new Map<string, string>();
  if (consent !== "undecided") {
    store.set("futuretutor_consent_v1", JSON.stringify({ analytics: consent, policyVersion: "2026-08-30", decidedAt: new Date().toISOString() }));
  }
  const fakeLocalStorage = storage === false ? undefined : {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
  // @ts-expect-error — minimal test-only window/document stub.
  globalThis.window = { location: { hostname }, localStorage: fakeLocalStorage, dataLayer: undefined };
}

afterEach(() => {
  // @ts-expect-error — test-only cleanup.
  delete globalThis.window;
  // @ts-expect-error — test-only cleanup.
  delete globalThis.document;
  if (originalGtmId === undefined) delete process.env.NEXT_PUBLIC_GTM_ID;
  else process.env.NEXT_PUBLIC_GTM_ID = originalGtmId;
});

describe("shouldLoadGtm", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GTM_ID;
  });

  it("is false with no configured GTM ID, even with consent granted on production", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    expect(shouldLoadGtm()).toBe(false);
  });

  it("is false without consent, even with a GTM ID configured on production", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "undecided" });
    expect(shouldLoadGtm()).toBe(false);
  });

  it("is false when consent was explicitly denied", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "denied" });
    expect(shouldLoadGtm()).toBe(false);
  });

  it("is false on a non-production hostname, even with a GTM ID and consent", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "localhost", consent: "granted" });
    expect(shouldLoadGtm()).toBe(false);
  });

  it("is true only when all three conditions hold: production host, GTM ID, granted consent", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    expect(shouldLoadGtm()).toBe(true);
  });

  it("is false server-side (no window) regardless of env var", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    expect(shouldLoadGtm()).toBe(false);
  });
});

describe("loadGtmIfEligible", () => {
  it("does nothing (no throw, no script element) when shouldLoadGtm() is false", () => {
    delete process.env.NEXT_PUBLIC_GTM_ID;
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    expect(() => loadGtmIfEligible()).not.toThrow();
  });

  it("injects exactly one script element and never duplicates it on repeated calls", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });

    const created: Array<{ id: string }> = [];
    const elementsById = new Map<string, { id: string }>();
    // Minimal test-only document stub covering exactly what
    // loadGtmIfEligible touches — cast through unknown rather than a
    // per-line @ts-expect-error, since diagnostics for a multi-line
    // object literal land on nested property lines, not the assignment.
    globalThis.document = {
      getElementById: (id: string) => elementsById.get(id) ?? null,
      createElement: () => {
        const el = { id: "" };
        return el;
      },
      head: {
        appendChild: (el: { id: string }) => {
          created.push(el);
          elementsById.set(el.id, el);
        },
      },
    } as unknown as Document;

    loadGtmIfEligible();
    loadGtmIfEligible();
    loadGtmIfEligible();

    expect(created).toHaveLength(1);
  });
});

describe("pushToDataLayer", () => {
  it("does nothing server-side (no window)", () => {
    expect(() => pushToDataLayer({ event: "test_event" })).not.toThrow();
  });

  it("does nothing when window.dataLayer was never initialized (GTM never loaded)", () => {
    // @ts-expect-error — minimal test-only window stub, dataLayer deliberately absent.
    globalThis.window = { location: { hostname: "futuretutor.ca" } };
    expect(() => pushToDataLayer({ event: "test_event" })).not.toThrow();
  });

  it("pushes the payload once dataLayer exists", () => {
    const pushed: unknown[] = [];
    // @ts-expect-error — minimal test-only window stub.
    globalThis.window = { dataLayer: { push: (item: unknown) => pushed.push(item) } };
    pushToDataLayer({ event: "test_event", foo: "bar" });
    expect(pushed).toEqual([{ event: "test_event", foo: "bar" }]);
  });
});
