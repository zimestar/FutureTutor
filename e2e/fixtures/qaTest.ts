import { expect, test as base, type Page } from "@playwright/test";

type AuditEvent = { type: "console" | "pageerror" | "http"; detail: string };

export const test = base.extend<{ runtimeAudit: void }>({
  runtimeAudit: [async ({ page }, use, testInfo) => {
    const failures: AuditEvent[] = [];
    page.on("console", (message) => {
      // Chromium itself (not application code) synthesizes this exact
      // message for any non-2xx resource load, including the main-document
      // navigation of a deliberately-404 URL a test is asserting against —
      // it is never something FutureTutor's own code logs, so it is not a
      // meaningful application error signal.
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource: the server responded with a status of 404")) {
        failures.push({ type: "console", detail: message.text() });
      }
    });
    page.on("pageerror", (error) => failures.push({ type: "pageerror", detail: error.message }));
    page.on("response", (response) => {
      if ([500, 502, 503, 504].includes(response.status())) {
        failures.push({ type: "http", detail: `${response.status()} ${response.url()}` });
      }
    });
    await use();
    if (failures.length) {
      await testInfo.attach("runtime-errors", {
        body: Buffer.from(JSON.stringify(failures, null, 2)),
        contentType: "application/json",
      });
    }
    expect(failures, "unexpected console, page, or HTTP 5xx errors").toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function expectSameOrigin(page: Page, configuredBaseUrl: string) {
  expect(new URL(page.url()).origin).toBe(new URL(configuredBaseUrl).origin);
}

export async function expectNoRawKeys(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/(?:sessionExperience|auth\.(?:forgotPassword|resetPassword|passwordVisibility)|quickMatch|tutorPayouts|runtimeError)\.[\w.-]+/);
}

export async function expectNoDocumentOverflow(page: Page, tolerance = 1) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + tolerance);
}
