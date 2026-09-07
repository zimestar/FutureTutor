import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "AuditMetadataViewer.tsx"), "utf8");

describe("AuditMetadataViewer.tsx", () => {
  it("never receives or dumps raw JSON — no JSON.stringify, no dangerouslySetInnerHTML", () => {
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("a redacted field renders the caller-supplied redactedLabel, never field.value directly", () => {
    expect(source).toMatch(/\{field\.redacted \? redactedLabel : field\.value\}/);
  });

  it("renders zero mutation controls", () => {
    expect(source).not.toMatch(/<button/i);
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toContain("onClick");
  });

  it("handles the zero-fields case with a clean empty label, never an empty/broken list", () => {
    expect(source).toContain("fields.length === 0");
    expect(source).toContain("{emptyLabel}");
  });
});
