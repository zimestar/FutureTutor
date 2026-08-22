import "dotenv/config";
import { defineConfig } from "@playwright/test";
import { assertExternalSuitesDisabled, resolveSafeE2ETarget, stagingFallbackUrl } from "./e2e/helpers/target";

const requestedTarget = process.env.E2E_TARGET === "staging" ? "staging" : "local";
const configuredUrl = process.env.E2E_BASE_URL ?? (requestedTarget === "staging" ? stagingFallbackUrl : "http://localhost:3000");
const target = resolveSafeE2ETarget(configuredUrl);
if (target.kind !== requestedTarget) {
  throw new Error(`E2E_TARGET=${requestedTarget} does not match the safe target kind for ${target.origin}.`);
}
assertExternalSuitesDisabled();

const viewports = [
  { name: "chromium-375", width: 375, height: 812 },
  { name: "chromium-768", width: 768, height: 1024 },
  { name: "chromium-1024", width: 1024, height: 768 },
  { name: "chromium-1440", width: 1440, height: 900 },
];

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.test.ts", "**/helpers/**", "**/fixtures/**"],
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: target.origin,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },
  webServer: target.kind === "local" ? {
    command: "npm run dev",
    url: target.origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
  projects: viewports.map(({ name, width, height }) => ({
    name,
    use: { viewport: { width, height } },
  })),
});
