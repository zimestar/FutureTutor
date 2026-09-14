import { describe, expect, it } from "vitest";
import { canonicalWwwRedirectForHost, normalizeHostHeader } from "./canonicalHost";

// SEO-INFRA-WWW1 — Railway has no native domain-redirect feature, so the
// www -> apex canonical-host redirect is enforced in proxy.ts.
//
// SEO-INFRA-WWW1-FIX1 — req.nextUrl.hostname is always the literal string
// "localhost" in this deployment (confirmed via a temporary, now-removed
// production diagnostic), because Railway's edge does not forward an
// absolute URL Next.js trusts. The request's `host` header was confirmed
// (and cross-checked against the agreeing `x-forwarded-host`) to reliably
// carry the real public hostname instead — this is the source these tests
// exercise. Exact hostname match only — never endsWith or substring — so
// an unrelated or spoofed host can never be accidentally caught.

describe("normalizeHostHeader", () => {
  it("returns null for a missing header", () => {
    expect(normalizeHostHeader(null)).toBeNull();
  });

  it("returns null for an empty or whitespace-only header", () => {
    expect(normalizeHostHeader("")).toBeNull();
    expect(normalizeHostHeader("   ")).toBeNull();
  });

  it("strips an explicit port", () => {
    expect(normalizeHostHeader("www.futuretutor.ca:443")).toBe("www.futuretutor.ca");
  });

  it("lowercases a mixed-case host", () => {
    expect(normalizeHostHeader("WWW.FutureTutor.CA")).toBe("www.futuretutor.ca");
  });

  it("uses only the first entry of a comma-separated proxy chain", () => {
    expect(normalizeHostHeader("www.futuretutor.ca, some-internal-proxy.local")).toBe("www.futuretutor.ca");
  });

  it("returns null for a malformed value rather than throwing", () => {
    expect(normalizeHostHeader("::not a valid host::")).toBeNull();
  });
});

describe("canonicalWwwRedirectForHost", () => {
  it("redirects the www root to the exact apex root", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/");
  });

  it("preserves an EN locale path", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/en/find-tutors", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/en/find-tutors");
  });

  it("preserves an FR locale path", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/fr/resources", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/fr/resources");
  });

  it("preserves a deeply nested path", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/en/tutoring/edmonton", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/en/tutoring/edmonton");
  });

  it("preserves the query string", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/en/find-tutors", "?mode=online&utm_source=seo_test");
    expect(result?.toString()).toBe("https://futuretutor.ca/en/find-tutors?mode=online&utm_source=seo_test");
  });

  it("matches when the host header carries an explicit port", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca:443", "/en", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/en");
  });

  it("matches a mixed-case host header", () => {
    const result = canonicalWwwRedirectForHost("WWW.FutureTutor.CA", "/en", "");
    expect(result?.toString()).toBe("https://futuretutor.ca/en");
  });

  it("never redirects the apex itself", () => {
    expect(canonicalWwwRedirectForHost("futuretutor.ca", "/en/find-tutors", "")).toBeNull();
  });

  it("never redirects staging or any other subdomain — exact hostname match only, never endsWith/substring", () => {
    expect(canonicalWwwRedirectForHost("staging.futuretutor.ca", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("notwww.futuretutor.ca", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("evilwww.futuretutor.ca.attacker.com", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("www.futuretutor.ca.attacker.com", "/en", "")).toBeNull();
  });

  it("never redirects localhost", () => {
    expect(canonicalWwwRedirectForHost("localhost:3000", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("localhost", "/en", "")).toBeNull();
  });

  it("never redirects a Railway-generated or internal domain", () => {
    expect(canonicalWwwRedirectForHost("futuretutor-production.up.railway.app", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("q2vwb12u.up.railway.app", "/en", "")).toBeNull();
  });

  it("never redirects on a missing or malformed host header", () => {
    expect(canonicalWwwRedirectForHost(null, "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("", "/en", "")).toBeNull();
    expect(canonicalWwwRedirectForHost("::not a valid host::", "/en", "")).toBeNull();
  });

  it("the redirect destination can never itself be www.futuretutor.ca (no redirect loop possible)", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/en/find-tutors", "?mode=online");
    expect(result?.hostname).toBe("futuretutor.ca");
    expect(result?.hostname).not.toBe("www.futuretutor.ca");
    // Re-running the check against the redirect's own destination host
    // confirms it is a fixed point: applying the rule again never
    // redirects again.
    expect(canonicalWwwRedirectForHost(result!.host, result!.pathname, result!.search)).toBeNull();
  });

  it("the destination always uses the https protocol, regardless of the incoming request's protocol", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca", "/en", "");
    expect(result?.protocol).toBe("https:");
  });

  it("the destination never carries an explicit port", () => {
    const result = canonicalWwwRedirectForHost("www.futuretutor.ca:443", "/en", "");
    expect(result?.port).toBe("");
  });
});
