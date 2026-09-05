import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CANCELLATION-CONFIRM1 — no jsdom/React Testing Library harness exists in
// this codebase (vitest.config.ts runs under the "react-server" resolve
// condition and environment: "node" — confirmed unchanged from the
// precedent BookingWidget.formFields.test.ts already documents). This
// statically inspects the real component source instead, asserting the
// exact structural facts that make the confirmation gate real rather than
// cosmetic: the trigger cannot submit directly, only the dialog's own
// confirm handler can, "Keep session"/close paths never touch the form,
// and pending state gates a second submission.

const SOURCE_PATH = join(__dirname, "CancelBookingButton.tsx");
const rawSource = readFileSync(SOURCE_PATH, "utf8");
// Strips both block (/** ... */) and line (// ...) comments before any
// structural assertion below — this file's own doc comments legitimately
// mention "requestSubmit()" and "<form>" in prose, which would otherwise
// produce false-positive extra matches.
const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("CancelBookingButton.tsx — cancellation requires explicit confirmation", () => {
  it("item 1 — the visible trigger is type=\"button\", never type=\"submit\" (cannot submit the form directly)", () => {
    const triggerBlock = source.slice(source.indexOf('data-testid="cancel-booking"') - 300, source.indexOf('data-testid="cancel-booking"') + 50);
    expect(triggerBlock).toContain('type="button"');
    expect(triggerBlock).not.toContain('type="submit"');
  });

  it("item 2 — clicking the trigger only opens the dialog (setConfirmOpen(true)), never dispatches a server action itself", () => {
    expect(source).toMatch(/onClick=\{\(\)\s*=>\s*setConfirmOpen\(true\)\}/);
  });

  it("uses the existing shared ConfirmationDialog primitive, not a bespoke one", () => {
    expect(source).toContain('import { ConfirmationDialog } from "@/components/ui/Dialog"');
    expect(source).toContain("<ConfirmationDialog");
    expect(source).toContain("destructive");
  });

  it("item 3/4 — \"Keep session\" (onClose) only clears local state, never calls requestSubmit or any action", () => {
    const onCloseMatch = source.match(/onClose=\{(\(\)\s*=>\s*setConfirmOpen\(false\))\}/);
    expect(onCloseMatch).not.toBeNull();
    // The onClose prop is a single, self-contained arrow function with no
    // other calls inside it — confirmed by the exact single-expression
    // match above (a body containing requestSubmit or an action call would
    // not match this pattern at all, since it's anchored to exactly one
    // statement).
  });

  it("item 5 — the dialog's confirm handler is the ONLY path that calls formRef.current?.requestSubmit()", () => {
    const requestSubmitOccurrences = source.match(/requestSubmit\(\)/g) ?? [];
    expect(requestSubmitOccurrences.length).toBe(1);
    // And it must be inside the onConfirm handler, not onClose or the
    // trigger's onClick.
    const onConfirmIndex = source.indexOf("onConfirm={() => {");
    const requestSubmitIndex = source.indexOf("requestSubmit()");
    expect(onConfirmIndex).toBeGreaterThan(-1);
    expect(requestSubmitIndex).toBeGreaterThan(onConfirmIndex);
  });

  it("item 6 — the confirm handler guards against re-entrancy while pending (double-submit protection)", () => {
    const onConfirmBlock = source.slice(source.indexOf("onConfirm={() => {"), source.indexOf("requestSubmit()") + 20);
    expect(onConfirmBlock).toContain("if (pending) return;");
  });

  it("the dialog's confirm label reflects the pending state (cancellingLabel while pending)", () => {
    expect(source).toMatch(/confirmLabel=\{pending \? cancellingLabel : confirmLabel\}/);
  });

  it("item 7 — the server-computed consequencePreview is rendered inside the dialog description, never recomputed", () => {
    const dialogBlock = source.slice(source.indexOf("<ConfirmationDialog"));
    expect(dialogBlock).toContain("consequencePreview");
    expect(dialogBlock).toContain("dialogDescription");
    expect(dialogBlock).toContain("irreversibleNote");
  });

  it("item 15 — no client-side refund/tier calculation exists in this component", () => {
    expect(source).not.toContain("calculateCancellationRefund");
    expect(source).not.toMatch(/refundCents|refundPercent|FULL_REFUND|PARTIAL_REFUND|NO_REFUND/);
  });

  it("the component still declares exactly one <form>, unchanged submission target (cancelBookingAction via useActionState)", () => {
    expect(source).toContain('import { cancelBookingAction } from "@/lib/actions/bookings"');
    expect(source).toContain("useActionState(cancelBookingAction, undefined)");
    const formOccurrences = source.match(/<form\b/g) ?? [];
    expect(formOccurrences.length).toBe(1);
  });
});
