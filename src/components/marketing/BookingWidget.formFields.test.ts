import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// PROD-DIRECT-BOOKING-MODEFIX2 — permanent regression guard for the exact
// class of bug this mission fixed: BookingWidget.tsx renders TWO separate
// booking-finalize <form> elements (the non-Stripe/dev-bypass path and the
// Stripe post-authorization path — see the component's own comments on why
// there are two), and PROD-DIRECT-BOOKING-MODEFIX1 added the "tutoringMode"
// hidden field to only one of them. A component-render test isn't available
// in this codebase (no jsdom/React Testing Library setup, and vitest.config.ts
// runs every test under the "react-server" resolve condition specifically
// for src/services's `import "server-only"` guards — a client-component
// render harness would need its own separate environment, out of scope for
// this fix). This test instead statically inspects the real source file and
// asserts BOTH <form>...</form> blocks carry the identical hidden input —
// the same kind of "two near-identical blocks silently diverged" bug can
// never regress unnoticed again, without requiring new test infrastructure.

const SOURCE_PATH = join(__dirname, "BookingWidget.tsx");

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function extractFormBlocks(source: string): string[] {
  const code = stripLineComments(source);
  const blocks: string[] = [];
  // Requires at least one attribute (a real JSX <form ...> element), not a
  // bare "<form>" that could otherwise appear in prose/comments.
  const formOpenRegex = /<form\s+[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = formOpenRegex.exec(code))) {
    const start = match.index;
    const end = code.indexOf("</form>", start);
    if (end === -1) throw new Error("Unclosed <form> tag found while parsing BookingWidget.tsx");
    blocks.push(code.slice(start, end + "</form>".length));
  }
  return blocks;
}

describe("BookingWidget.tsx — booking-finalize forms carry tutoringMode consistently", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const formBlocks = extractFormBlocks(source);

  it("finds exactly the two known booking-finalize forms", () => {
    // Guards the test itself against silently testing zero/wrong forms if
    // the component is ever restructured.
    expect(formBlocks.length).toBe(2);
  });

  it("every booking-finalize <form> includes the tutoringMode hidden field bound to requestedMode", () => {
    for (const block of formBlocks) {
      expect(block).toContain('name="tutoringMode"');
      expect(block).toMatch(/name="tutoringMode"\s+value=\{requestedMode\}/);
    }
  });

  it("every booking-finalize <form> also includes every other required field (sanity check on the parser itself)", () => {
    for (const block of formBlocks) {
      for (const field of ["studentProfileId", "tutorProfileId", "startAt", "subjectId", "academicLevelId", "customerPriceQuoteId", "tutorPayoutQuoteId"]) {
        expect(block).toContain(`name="${field}"`);
      }
    }
  });
});
