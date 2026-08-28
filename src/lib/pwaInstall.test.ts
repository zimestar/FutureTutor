import { describe, expect, it } from "vitest";

import { isIosInstallEnvironment, isStandaloneDisplay } from "@/lib/pwaInstall";

describe("PWA install environment detection", () => {
  it("detects iPhone and iPadOS desktop-mode user agents", () => {
    expect(isIosInstallEnvironment({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isIosInstallEnvironment({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });

  it("does not mistake desktop Safari or Android for iOS", () => {
    expect(isIosInstallEnvironment({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIosInstallEnvironment({ userAgent: "Mozilla/5.0 (Linux; Android 15)", platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(false);
  });

  it("recognizes standards-based and iOS standalone modes", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, iosStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, iosStandalone: false })).toBe(false);
  });
});
