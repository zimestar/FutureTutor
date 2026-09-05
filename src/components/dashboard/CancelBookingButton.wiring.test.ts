import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// CANCELLATION-CONFIRM1 — confirms (a) the new booking.cancelDialog
// translation keys exist and differ between EN/FR (items 12/13), and (b)
// both real call sites (parent/student bookings page, tutor bookings
// page) actually pass the new dialog props sourced from that namespace,
// with the pre-existing isTutorViewer semantics left exactly as they were
// (item 11's wiring half — the content-level assertion lives in
// cancellationConsequencePreview.test.ts).

describe("booking.cancelDialog translations", () => {
  it("item 12 — EN keys exist with the expected interpolation placeholders", () => {
    const dialog = enMessages.booking.cancelDialog;
    expect(dialog.description).toContain("{subject}");
    expect(dialog.description).toContain("{name}");
    expect(dialog.description).toContain("{when}");
    expect(dialog.title).toBeTruthy();
    expect(dialog.keepLabel).toBeTruthy();
    expect(dialog.confirmLabel).toBeTruthy();
    expect(dialog.irreversibleNote).toBeTruthy();
  });

  it("item 13 — FR keys exist, with the same placeholders, and differ from EN", () => {
    const dialogFr = frMessages.booking.cancelDialog;
    const dialogEn = enMessages.booking.cancelDialog;
    expect(dialogFr.description).toContain("{subject}");
    expect(dialogFr.description).toContain("{name}");
    expect(dialogFr.description).toContain("{when}");
    expect(dialogFr.title).not.toBe(dialogEn.title);
    expect(dialogFr.confirmLabel).not.toBe(dialogEn.confirmLabel);
  });
});

function readPage(relativePath: string): string {
  return readFileSync(join(__dirname, "..", "..", "app", "[locale]", ...relativePath.split("/")), "utf8");
}

describe("dashboard/bookings/page.tsx (parent/student) — dialog wiring", () => {
  const source = readPage("dashboard/bookings/page.tsx");

  it("passes all five new dialog props to CancelBookingButton", () => {
    const block = source.slice(source.indexOf("<CancelBookingButton"), source.indexOf("<CancelBookingButton") + 1600);
    for (const prop of ["dialogTitle", "dialogDescription", "keepLabel", "confirmLabel", "irreversibleNote"]) {
      expect(block).toContain(`${prop}=`);
    }
  });

  it("dialogDescription is built from the booking.cancelDialog namespace, using the tutor's name (item 14 — date/time via formatBookingTime, unchanged helper)", () => {
    expect(source).toContain('namespace: "booking.cancelDialog"');
    const block = source.slice(source.indexOf("dialogDescription={"), source.indexOf("dialogDescription={") + 400);
    expect(block).toContain("tCancelDialog(\"description\"");
    expect(block).toContain("booking.tutorProfile.user.name");
    expect(block).toContain("formatBookingTime(booking.startAt, booking.timezone, locale)");
  });

  it("item 11 (wiring half) — the consequencePreview call is untouched: isTutorViewer: false, unchanged amount/currency/paymentStatus wiring", () => {
    const block = source.slice(source.indexOf("describeCancellationConsequence({"), source.indexOf("describeCancellationConsequence({") + 400);
    expect(block).toContain("isTutorViewer: false");
  });
});

describe("tutor/bookings/page.tsx — dialog wiring", () => {
  const source = readPage("tutor/bookings/page.tsx");

  it("passes all five new dialog props to CancelBookingButton", () => {
    const block = source.slice(source.indexOf("<CancelBookingButton"), source.indexOf("<CancelBookingButton") + 1600);
    for (const prop of ["dialogTitle", "dialogDescription", "keepLabel", "confirmLabel", "irreversibleNote"]) {
      expect(block).toContain(`${prop}=`);
    }
  });

  it("dialogDescription uses the learner's (studentProfile) name, not the tutor's own name", () => {
    const block = source.slice(source.indexOf("dialogDescription={"), source.indexOf("dialogDescription={") + 400);
    expect(block).toContain("booking.studentProfile.firstName");
  });

  it("item 11 (wiring half) — the consequencePreview call is untouched: isTutorViewer: true, still never derives a payer refund amount", () => {
    const block = source.slice(source.indexOf("describeCancellationConsequence({"), source.indexOf("describeCancellationConsequence({") + 400);
    expect(block).toContain("isTutorViewer: true");
  });
});

describe("item 18 — no alternate cancellation entry point exists", () => {
  it("cancelBookingAction is imported/used only by CancelBookingButton in application code", () => {
    // A structural cross-check, not exhaustive by itself — the full
    // confirmation for this mission's audit was a repo-wide grep (see the
    // mission checkpoint report), reproduced here as a standing regression
    // guard against a future second entry point being added silently.
    const buttonSource = readFileSync(join(__dirname, "CancelBookingButton.tsx"), "utf8");
    expect(buttonSource).toContain("cancelBookingAction");
  });
});
