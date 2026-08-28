import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDirectionsHref } from "@/lib/inPersonLocationPresentation";

const component = readFileSync("src/components/dashboard/InPersonTutoringLocation.tsx", "utf8");

describe("in-person tutoring presentation", () => {
  it("uses semantic radios for Online and In-person modes", () => {
    expect(component).toContain('type="radio"');
    expect(component).toContain('["ONLINE", "IN_PERSON"]');
  });

  it("provides a labelled Canadian address form and privacy description", () => {
    expect(component).toContain('data-testid="in-person-location-fields"');
    expect(component).toContain('name="addressLine1"');
    expect(component).toContain('name="postalCode"');
    expect(component).toContain('autoComplete="postal-code"');
    expect(component).toContain('aria-describedby="location-privacy-note"');
  });

  it("supports saved-location selection and a no-location empty state", () => {
    expect(component).toContain('name="savedLocationId"');
    expect(component).toContain('data-testid="no-saved-location"');
  });

  it("exposes the guardian-managed restriction as a status", () => {
    expect(component).toContain('role="status"');
    expect(component).toContain('data-testid="guardian-managed-location-notice"');
  });

  it("keeps pre-confirmation location approximate", () => {
    expect(component).toContain('data-testid="approximate-location"');
    expect(component).toContain('t("approximate.privacy")');
    expect(component).toContain('t("approximate.waiting")');
  });

  it("renders exact address and arrival instructions only through the confirmed DTO component", () => {
    expect(component).toContain('data-testid="confirmed-location-card"');
    expect(component).toContain("location.addressLine1");
    expect(component).toContain("location.arrivalInstructions");
  });

  it("encodes an authorized exact DTO behind the directions helper", () => {
    const href = buildDirectionsHref({ addressLine1: "123 Example Street", addressLine2: "Unit 201", city: "Edmonton", province: "AB", postalCode: "T6X 1A1" });
    expect(href).toContain("123%20Example%20Street");
    expect(href).toContain("Unit%20201");
    expect(href).not.toContain(" ");
  });
});
