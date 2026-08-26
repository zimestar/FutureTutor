import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authEditorialPortraits, selectAuthPortrait } from "./authEditorialPortraits";

describe("auth editorial portrait rotation", () => {
  it("makes all five approved portraits deterministically reachable", () => {
    expect(authEditorialPortraits).toHaveLength(5);
    expect(new Set(authEditorialPortraits).size).toBe(5);
    expect([0, 1, 2, 3, 4].map(selectAuthPortrait)).toEqual(authEditorialPortraits);
    expect(selectAuthPortrait(5)).toBe(authEditorialPortraits[0]);
  });

  it("selects only after mount without SSR randomness or persistent storage", () => {
    const source = readFileSync("src/components/marketing/AuthEditorialPortrait.tsx", "utf8");
    expect(source).toContain("useEffect");
    expect(source).toContain("crypto.getRandomValues");
    expect(source).not.toContain("Math.random");
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
