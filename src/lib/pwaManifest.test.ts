import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

function pngSize(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("FutureTutor web app manifest", () => {
  const value = manifest();

  it("uses the certified FutureTutor standalone identity and locale-safe launcher", () => {
    expect(value.name).toBe("FutureTutor");
    expect(value.short_name).toBe("FutureTutor");
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/launch");
    expect(value.scope).toBe("/");
  });

  it("declares standard and maskable PNG icons that resolve at their stated dimensions", () => {
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/pwa/icon-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/pwa/icon-512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/pwa/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
    expect(pngSize("public/pwa/icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/pwa/icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/pwa/icon-maskable-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("src/app/apple-icon.png")).toEqual({ width: 180, height: 180 });
  });
});
