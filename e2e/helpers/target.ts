const RAILWAY_STAGING_HOST = "futuretutor-web-production.up.railway.app";
const CUSTOM_STAGING_HOST = "staging.futuretutor.ca";
const PRODUCTION_HOSTS = new Set(["futuretutor.ca", "www.futuretutor.ca"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type E2ETargetKind = "local" | "staging";

export interface SafeE2ETarget {
  origin: string;
  kind: E2ETargetKind;
}

export function resolveSafeE2ETarget(rawUrl: string): SafeE2ETarget {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("E2E_BASE_URL must be a valid absolute URL.");
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("E2E_BASE_URL must contain only an allowed origin, without credentials, path, query, or hash.");
  }
  if (PRODUCTION_HOSTS.has(url.hostname)) {
    throw new Error(`E2E target ${url.hostname} is a production host and is always blocked.`);
  }
  if (LOCAL_HOSTS.has(url.hostname)) {
    if (url.protocol !== "http:") throw new Error("Local E2E targets must use http.");
    return { origin: url.origin, kind: "local" };
  }
  if (url.hostname === RAILWAY_STAGING_HOST || url.hostname === CUSTOM_STAGING_HOST) {
    if (url.protocol !== "https:") throw new Error("Remote staging E2E targets must use https.");
    if (url.port) throw new Error("Remote staging E2E targets must use the default HTTPS port.");
    return { origin: url.origin, kind: "staging" };
  }
  throw new Error(`E2E target host ${url.hostname} is not allowlisted.`);
}

export function assertExternalSuitesDisabled(): void {
  if (process.env.E2E_EXTERNAL_EMAIL === "true") {
    throw new Error("External email E2E is not implemented in QA-1 and cannot run in the normal suite.");
  }
  if (process.env.E2E_FINANCIAL === "true") {
    throw new Error("Financial E2E is not implemented in QA-1 and cannot run in the normal suite.");
  }
}

export const stagingFallbackUrl = `https://${RAILWAY_STAGING_HOST}`;
