import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldLoadGtm, loadGtmIfEligible, loadGtmIfConsentAlreadyGranted, pushToDataLayer, unloadGtm } from "./vendors";

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

function installFakeDocument(): Map<string, { id: string }> {
  const elementsById = new Map<string, { id: string }>();
  globalThis.document = {
    getElementById: (id: string) => elementsById.get(id) ?? null,
    createElement: () => ({ id: "" }),
    head: {
      appendChild: (el: { id: string }) => {
        elementsById.set(el.id, el);
      },
    },
  } as unknown as Document;
  return elementsById;
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

describe("loadGtmIfConsentAlreadyGranted — DATA-1-GTM-LIVE-DETECTION-FIX1", () => {
  // This is the exact function ConsentBanner's mount/pathname-change effect
  // calls (src/components/marketing/ConsentBanner.tsx) — no React render
  // harness exists in this codebase (vitest runs in a plain Node
  // environment, no jsdom/RTL), so the effect's own decision logic is
  // tested directly here, the same way the rest of this module already is.
  // The component itself is reduced to a one-line `useEffect(() => {
  // loadGtmIfConsentAlreadyGranted(pathname); }, [pathname])`.

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
  });

  it("[1] does NOT load on an eligible public route when consent is undecided", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "undecided" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    expect(elementsById.size).toBe(0);
  });

  it("[2] does NOT load on an eligible public route when consent was denied", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "denied" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    expect(elementsById.size).toBe(0);
  });

  it("[3] loads on an eligible public route when consent is already granted — the fixed case (visitor returns on a fresh page load)", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    expect(elementsById.size).toBe(1);
  });

  it("[4] a pathname change across two eligible routes re-invokes the loader safely without creating a duplicate script", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    loadGtmIfConsentAlreadyGranted("/en/how-it-works");
    expect(elementsById.size).toBe(1);
  });

  it("[5] does NOT load on a private route even with consent already granted", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/dashboard");
    expect(elementsById.size).toBe(0);
  });

  it("[6] does NOT load on an auth-utility route even with consent already granted", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/login");
    expect(elementsById.size).toBe(0);
  });

  it("[7] does NOT load on an admin route even with consent already granted", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/admin");
    expect(elementsById.size).toBe(0);
  });

  it("[11] loads on an eligible EN public route", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    expect(elementsById.size).toBe(1);
  });

  it("[12] loads on an eligible FR public route", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();
    loadGtmIfConsentAlreadyGranted("/fr/find-tutors");
    expect(elementsById.size).toBe(1);
  });

  it("[10] after revoke + unloadGtm(), a subsequent mount/pathname re-check does not reload GTM (consent is back to undecided)", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    const elementsById = installFakeDocument();

    // Simulate the effect firing once with consent already granted (the
    // fixed case), then the visitor revoking via CookiePreferencesControl:
    // revokeAnalyticsConsent() resets storage to undecided and the control
    // separately calls unloadGtm() before reloading.
    loadGtmIfConsentAlreadyGranted("/en/find-tutors");
    expect(elementsById.size).toBe(1);

    globalThis.window.localStorage.removeItem("futuretutor_consent_v1");
    const scriptId = [...elementsById.keys()][0];
    (elementsById.get(scriptId) as unknown as { remove: () => void }).remove = () => elementsById.delete(scriptId);
    unloadGtm();
    expect(elementsById.size).toBe(0);

    // A subsequent pathname change (e.g. the reload CookiePreferencesControl
    // triggers, or simply navigating again) must not silently reload GTM
    // now that consent is undecided again.
    loadGtmIfConsentAlreadyGranted("/en/how-it-works");
    expect(elementsById.size).toBe(0);
  });
});

// [8] "clicking Accept on an eligible public route still loads GTM
// immediately" is unchanged by this fix and already proven by
// loadGtmIfEligible's own "injects exactly one script element" test above
// (ConsentBanner's handleAccept calls loadGtmIfEligible() directly, exactly
// as before this fix).
//
// [9] "clicking Reject never loads GTM" needed no new test: handleReject
// never called any loader function before or after this fix — it only
// records the decision — and shouldLoadGtm()'s own "is false when consent
// was explicitly denied" test above already covers the underlying gate.

describe("unloadGtm", () => {
  it("does nothing (no throw) server-side (no window/document)", () => {
    expect(() => unloadGtm()).not.toThrow();
  });

  it("removes the injected GTM script element by its stable id", () => {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST0000";
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });

    const elementsById = new Map<string, { id: string; removed: boolean }>();
    globalThis.document = {
      getElementById: (id: string) => elementsById.get(id) ?? null,
      createElement: () => {
        const el = { id: "", removed: false };
        return el;
      },
      head: {
        appendChild: (el: { id: string; removed: boolean }) => {
          elementsById.set(el.id, el);
        },
      },
    } as unknown as Document;

    loadGtmIfEligible();
    const scriptId = [...elementsById.keys()][0];
    expect(scriptId).toBeDefined();

    // Patch in a real-enough `.remove()` so unloadGtm's DOM call succeeds.
    const el = elementsById.get(scriptId)!;
    (el as unknown as { remove: () => void }).remove = () => elementsById.delete(scriptId);

    unloadGtm();
    expect(elementsById.has(scriptId)).toBe(false);
  });

  it("empties window.dataLayer's contents", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "granted" });
    globalThis.window.dataLayer = [{ event: "one" }, { event: "two" }];
    unloadGtm();
    expect(globalThis.window.dataLayer.length).toBe(0);
  });

  it("does not throw when no script element was ever injected and dataLayer was never initialized", () => {
    installFakeBrowser({ hostname: "futuretutor.ca", consent: "denied" });
    globalThis.document = {
      getElementById: () => null,
    } as unknown as Document;
    expect(() => unloadGtm()).not.toThrow();
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
