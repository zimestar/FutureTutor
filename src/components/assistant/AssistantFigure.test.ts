import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFigure } from "@/components/assistant/AssistantFigure";
import { assistantSystemPrompt } from "@/lib/assistant/systemPrompt";

// ASSISTANT-2 — figures are data validated by FutureTutor, never model-written markup.

describe("parseFigure", () => {
  it("accepts every documented figure type", () => {
    const examples = [
      '{"type":"triangle","vertices":["A","B","C"],"sides":["5 cm","4 cm","3 cm"],"angles":[null,"90°",null],"lengths":[5,4,3],"rightAngleAt":1}',
      '{"type":"rectangle","width":8,"height":5,"widthLabel":"8 m","heightLabel":"5 m"}',
      '{"type":"circle","radiusLabel":"r = 3 cm","diameter":false,"centerLabel":"O"}',
      '{"type":"numberLine","min":-5,"max":5,"step":1,"points":[{"value":-3,"label":"-3"}],"segment":{"from":-3,"to":2}}',
      '{"type":"fractionBars","bars":[{"parts":3,"shaded":1,"label":"1/3"}]}',
      '{"type":"graph","lines":[{"slope":2,"intercept":-1,"label":"y = 2x - 1"}],"points":[{"x":0,"y":-1}]}',
    ];
    for (const example of examples) expect(parseFigure(example), example).not.toBeNull();
  });

  it("rejects unknown types, broken JSON, markup-sized labels and absurd sizes", () => {
    expect(parseFigure('{"type":"svg","markup":"<script>alert(1)</script>"}')).toBeNull();
    expect(parseFigure("{not json")).toBeNull();
    expect(parseFigure(`{"type":"circle","radiusLabel":"${"x".repeat(200)}"}`)).toBeNull();
    expect(parseFigure('{"type":"fractionBars","bars":[{"parts":5000,"shaded":1}]}')).toBeNull();
    expect(parseFigure('{"type":"graph","xMin":-100000}')).toBeNull();
  });

  it("is documented to the model with the same shapes", () => {
    const prompt = assistantSystemPrompt("fr");
    expect(prompt).toContain("```figure");
    for (const type of ["triangle", "rectangle", "circle", "numberLine", "fractionBars", "graph"]) expect(prompt).toContain(`"type":"${type}"`);
    expect(prompt).toContain("never write SVG");
  });
});

describe("homework photos", () => {
  const route = readFileSync("src/app/api/assistant/route.ts", "utf8");
  const chat = readFileSync("src/components/dashboard/AssistantChat.tsx", "utf8");

  it("are size-limited and type-limited server-side, and never stored", () => {
    expect(route).toContain('mediaType: z.enum(["image/jpeg", "image/png", "image/webp"])');
    expect(route).toContain(".max(ASSISTANT_MAX_IMAGE_BASE64_CHARS)");
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/hasImage\s+Boolean/);
    expect(route).not.toMatch(/db\.\w+\.(create|update|upsert)/);
  });

  it("are resized in the browser before upload and offered from the phone camera", () => {
    expect(chat).toContain("MAX_IMAGE_SIDE = 1568");
    expect(chat).toContain('accept="image/*"');
  });
});
