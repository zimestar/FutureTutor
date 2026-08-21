import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("staging frontend hardening", () => {
  it.each(["en", "fr"])("resolves the %s runtime fallback without leaking raw keys", (locale) => {
    const messages = JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
    const t = createTranslator({
      locale,
      messages,
      namespace: "runtimeError",
      onError: (error) => {
        throw error;
      },
    });

    for (const key of ["eyebrow", "title", "description", "retry"] as const) {
      expect(t(key)).not.toContain("runtimeError.");
      expect(t(key)).not.toBe(key);
    }
  });

  it("keeps internal runtime errors out of the user-facing boundary", () => {
    const source = fs.readFileSync(path.join(root, "src/app/[locale]/error.tsx"), "utf8");

    expect(source).not.toContain("error.message");
    expect(source).not.toContain("error.stack");
    expect(source).not.toContain("console.");
    expect(source).toContain('useTranslations("runtimeError")');
  });

  it("locks Stripe onboarding while its server action is pending", () => {
    const button = fs.readFileSync(
      path.join(root, "src/components/dashboard/StripeOnboardingSubmitButton.tsx"),
      "utf8",
    );
    const page = fs.readFileSync(path.join(root, "src/app/[locale]/tutor/payouts/page.tsx"), "utf8");

    expect(button).toContain("useFormStatus");
    expect(button).toContain("disabled={pending}");
    expect(page).toContain("<StripeOnboardingSubmitButton");
    expect(page).toContain('t("onboardingPending")');
  });
});
