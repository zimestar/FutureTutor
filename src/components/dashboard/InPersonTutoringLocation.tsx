"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Home, MapPin, Monitor, ShieldCheck } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Form";
import { buildDirectionsHref } from "@/lib/inPersonLocationPresentation";
import type {
  ApproximateTutoringLocation,
  ConfirmedTutoringLocation,
} from "@/types/inPersonTutoring";

export type RequestTutoringMode = "ONLINE" | "IN_PERSON";

export function TutoringModeSelector({ value, onChange }: {
  value: RequestTutoringMode;
  onChange: (value: RequestTutoringMode) => void;
}) {
  const t = useTranslations("inPersonTutoring");
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-navy">{t("mode.legend")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["ONLINE", "IN_PERSON"] as const).map((mode) => {
          const Icon = mode === "ONLINE" ? Monitor : Home;
          return (
            <label key={mode} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${value === mode ? "border-blue bg-blue/5" : "border-neutral-200 bg-white hover:border-blue/50"}`}>
              <input className="size-4 accent-blue" type="radio" name="tutoringMode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
              <Icon className="size-5 shrink-0 text-blue" aria-hidden="true" />
              <span className="font-semibold text-navy">{t(`mode.${mode}`)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function LocationForm() {
  const t = useTranslations("inPersonTutoring");
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-off-white p-4" data-testid="in-person-location-fields">
      <legend className="px-1 text-sm font-bold text-navy">{t("form.title")}</legend>
      <p id="location-privacy-note" className="flex items-start gap-2 rounded-md bg-mint/10 p-3 text-sm text-navy"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />{t("form.privacy")}</p>
      <div><label htmlFor="addressLine1" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.addressLine1")}</label><Input id="addressLine1" name="addressLine1" required autoComplete="address-line1" aria-describedby="location-privacy-note" /></div>
      <div><label htmlFor="addressLine2" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.addressLine2")}</label><Input id="addressLine2" name="addressLine2" autoComplete="address-line2" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="city" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.city")}</label><Input id="city" name="city" required autoComplete="address-level2" /></div>
        <div><label htmlFor="province" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.province")}</label><Select id="province" name="province" required defaultValue=""><option value="" disabled>{t("form.provincePlaceholder")}</option>{["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"].map((province) => <option key={province} value={province}>{province}</option>)}</Select></div>
      </div>
      <div><label htmlFor="postalCode" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.postalCode")}</label><Input id="postalCode" name="postalCode" required autoComplete="postal-code" inputMode="text" /></div>
      <div><label htmlFor="arrivalInstructions" className="mb-1.5 block text-sm font-semibold text-navy">{t("form.arrivalInstructions")}</label><Textarea id="arrivalInstructions" name="arrivalInstructions" rows={3} maxLength={500} placeholder={t("form.arrivalInstructionsPlaceholder")} /></div>
    </fieldset>
  );
}

export function GuardianManagedLocationNotice() {
  const t = useTranslations("inPersonTutoring");
  return <div role="status" className="rounded-lg border border-blue/20 bg-blue/5 p-4 text-sm text-navy" data-testid="guardian-managed-location-notice"><p className="font-bold">{t("guardian.title")}</p><p className="mt-1 text-slate">{t("guardian.description")}</p></div>;
}

export function ApproximateLocationSummary({ location, waitingForConfirmation = false }: { location: ApproximateTutoringLocation; waitingForConfirmation?: boolean }) {
  const t = useTranslations("inPersonTutoring");
  const place = [location.areaLabel, location.city, location.province, location.postalCodePrefix ? t("approximate.postalArea", { prefix: location.postalCodePrefix }) : null].filter(Boolean).join(", ");
  return <section className="mt-3 rounded-lg border border-blue/15 bg-blue/5 p-3" aria-label={t("approximate.title")} data-testid="approximate-location"><div className="flex gap-2"><MapPin className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" /><div><p className="text-sm font-bold text-navy">{place || t("approximate.unavailable")}</p>{location.distanceKm != null && <p className="mt-0.5 text-sm text-slate">{t("approximate.distance", { distance: location.distanceKm })}</p>}<p className="mt-1 text-xs text-slate">{waitingForConfirmation ? t("approximate.waiting") : t("approximate.privacy")}</p></div></div></section>;
}

export function ConfirmedLocationCard({ location }: { location: ConfirmedTutoringLocation }) {
  const t = useTranslations("inPersonTutoring");
  return <section className="rounded-xl border border-neutral-200 bg-white p-5" aria-labelledby="confirmed-location-title" data-testid="confirmed-location-card"><div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" /><div className="min-w-0"><h3 id="confirmed-location-title" className="font-extrabold text-navy">{t("confirmed.title")}</h3>{location.label && <p className="mt-2 text-sm font-bold text-navy">{location.label}</p>}<address className="mt-1 not-italic text-sm leading-6 text-slate"><span className="block">{location.addressLine1}</span>{location.addressLine2 && <span className="block">{location.addressLine2}</span>}<span className="block">{location.city}, {location.province} {location.postalCode}</span></address></div></div>{location.arrivalInstructions && <div className="mt-4 border-t border-neutral-200 pt-4"><h4 className="text-sm font-bold text-navy">{t("confirmed.arrivalInstructions")}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-slate">{location.arrivalInstructions}</p></div>}<a href={buildDirectionsHref(location)} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-blue px-4 text-sm font-bold text-blue hover:bg-blue/5">{t("confirmed.directions")}<ExternalLink className="size-4" aria-hidden="true" /></a></section>;
}
