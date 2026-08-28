import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const dashboardShell = readFileSync("src/components/dashboard/DashboardShell.tsx", "utf8");
const layout = readFileSync("src/app/[locale]/layout.tsx", "utf8");
const launcher = readFileSync("src/app/[locale]/launch/page.tsx", "utf8");

describe("conservative PWA privacy boundary", () => {
  it("does not install a service worker or introduce a PWA cache package", () => {
    expect(existsSync("public/sw.js")).toBe(false);
    expect(existsSync("public/service-worker.js")).toBe(false);
    expect(existsSync("src/app/sw.ts")).toBe(false);
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("next-pwa");
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("@serwist/next");
  });

  it("therefore has no PWA cache capable of persisting private HTML, RSC, API, booking, address, payment, or video-token data", () => {
    expect(dashboardShell).not.toContain("serviceWorker.register");
    expect(dashboardShell).not.toContain("caches.open");
    expect(dashboardShell).not.toContain("CacheStorage");
  });

  it("publishes standards metadata and routes installed launches through authoritative auth", () => {
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain("appleWebApp:");
    expect(launcher).toContain("const session = await auth()");
    expect(launcher).toContain("homePathForRole(session.user.role)");
    expect(launcher).toContain('`/${safeLocale}/login`');
  });
});
