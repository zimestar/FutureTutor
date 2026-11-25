import { describe, expect, it } from "vitest";
import https from "node:https";
import { resolveVerifiedTestDatabase } from "./testDatabaseSafety";
import { getEmailDeliveryMode } from "@/lib/email/emailDeliveryConfig";

// RW-11 — proves the hermetic integration environment itself.
describe("integration test environment", () => {
  it("resolves the verified local test database without any CLI env flag", () => {
    expect(resolveVerifiedTestDatabase().databaseName).toMatch(/_test$/);
  });

  it("holds no real provider credential and can only select console email", () => {
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    expect(process.env.DAILY_API_KEY).toBeUndefined();
    expect(process.env.STRIPE_SECRET_KEY).toBe("sk_test_integration_dummy");
    expect(getEmailDeliveryMode()).toBe("console_dev");
  });

  it("blocks fetch to a non-local host", async () => {
    const error = await fetch("https://example.com").then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error }
    );
    expect(`${error?.message} ${error?.cause?.message}`).toContain("non-local hosts");
  });

  it("blocks node:https to a non-local host, with a URL path", async () => {
    const message = await new Promise<string>((resolve) => {
      try {
        https
          .get("https://example.com/v1/charges", { agent: false }, () => resolve("connected"))
          .on("error", (e) => resolve(e.message));
      } catch (e) {
        resolve((e as Error).message);
      }
    });
    expect(message).toContain("non-local hosts");
  });
});
