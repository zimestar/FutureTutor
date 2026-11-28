import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { assistantSystemPrompt } from "@/lib/assistant/systemPrompt";

// ASSISTANT-1 — guard rails for the parent assistant.

const route = readFileSync("src/app/api/assistant/route.ts", "utf8");
const page = readFileSync("src/app/[locale]/dashboard/assistant/page.tsx", "utf8");

describe("assistant route", () => {
  it("is reserved to signed-in PARENT accounts and checks the origin", () => {
    expect(route).toContain('if (user.role !== "PARENT") return json({ error: "FORBIDDEN" }, 403);');
    expect(route).toContain("if (!sameOrigin(request))");
    expect(page).toContain('if (user.role !== "PARENT")');
  });

  it("reserves a question against the quota before calling the model", () => {
    expect(route.indexOf("reserveQuestion(")).toBeGreaterThan(0);
    expect(route.indexOf("reserveQuestion(")).toBeLessThan(route.indexOf("client.beta.messages.stream("));
  });

  it("uses Claude Sonnet 5.5 with server-side fallback and a cached system prompt", () => {
    expect(route).toContain("model: ASSISTANT_MODEL");
    expect(readFileSync("src/lib/assistant/config.ts", "utf8")).toContain('ASSISTANT_MODEL = "claude-sonnet-5-5"');
    expect(route).toContain('fallbacks: "default"');
    expect(route).toContain('cache_control: { type: "ephemeral" }');
  });

  it("never stores the question or the answer", () => {
    const writes = route.match(/db\.\w+\.(create|update|upsert)/g) ?? [];
    expect(writes).toHaveLength(0);
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toMatch(/model AssistantUsage \{[^}]*(question|answer|content)/);
  });

  it("never sends the API key to the client", () => {
    for (const file of ["src/components/dashboard/AssistantChat.tsx", "src/app/[locale]/dashboard/assistant/page.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("ANTHROPIC_API_KEY");
    }
  });
});

describe("assistant system prompt", () => {
  it("is deterministic (cacheable) and grounded in the library", () => {
    const a = assistantSystemPrompt("fr");
    expect(a).toBe(assistantSystemPrompt("fr"));
    expect(a).toContain("/fr/resources/library/alberta/math-7/integers");
    expect(assistantSystemPrompt("en")).toContain("/en/resources/library/alberta/math-10c/systems-of-equations");
  });
});

describe("assistant navigation", () => {
  it("is shown to parents only", () => {
    const t = (key: string) => key;
    expect(getStudentDashboardNavItems(t, "PARENT").some((i) => i.href === "/dashboard/assistant")).toBe(true);
    expect(getStudentDashboardNavItems(t, "STUDENT").some((i) => i.href === "/dashboard/assistant")).toBe(false);
  });
});
