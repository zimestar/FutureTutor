"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/Input";
import { createBookingAction } from "@/lib/actions/bookings";
import { createPriceQuoteAction, type PriceQuoteResult } from "@/lib/actions/pricing";

export interface BookingWidgetDaySlot {
  date: string;
  slots: { startAt: string; endAt: string }[];
}

export interface BookingWidgetOption {
  id: string;
  label: string;
}

export function BookingWidget({
  tutorProfileId,
  timezone,
  days,
  subjects,
  levels,
}: {
  tutorProfileId: string;
  timezone: string;
  days: BookingWidgetDaySlot[];
  subjects: BookingWidgetOption[];
  levels: BookingWidgetOption[];
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createBookingAction, undefined);
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? "");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [academicLevelId, setAcademicLevelId] = useState("");
  // Keyed by the exact selection it was fetched for — a stale quote from a
  // superseded selection is detected during render (a pure comparison)
  // rather than cleared via a synchronous setState inside the effect body.
  const [quoteState, setQuoteState] = useState<{ key: string; result: PriceQuoteResult } | null>(null);
  const [quotePending, startQuoteTransition] = useTransition();
  const quoteKey = selectedSlot && subjectId ? `${selectedSlot}|${subjectId}|${academicLevelId}` : null;
  const quote = quoteState && quoteState.key === quoteKey ? quoteState.result : null;

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    [locale]
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone }),
    [locale, timezone]
  );
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }),
    [locale]
  );
  const formatCents = (cents: number) => currencyFormatter.format(cents / 100);

  const selectedDay = days.find((day) => day.date === selectedDate);

  // Fetch a fresh, authoritative price quote whenever the selection changes
  // — the UI never computes a price itself, it only displays what the
  // server calculated.
  useEffect(() => {
    if (!quoteKey) return;
    let cancelled = false;
    startQuoteTransition(async () => {
      const result = await createPriceQuoteAction({
        tutorProfileId,
        subjectId,
        academicLevelId: academicLevelId || undefined,
        startAt: selectedSlot,
      });
      if (!cancelled) setQuoteState({ key: quoteKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [quoteKey, selectedSlot, subjectId, academicLevelId, tutorProfileId]);

  if (state?.success) {
    return (
      <div className="mt-6 rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success">
        {t("success")}{" "}
        <Link href="/dashboard/bookings" className="underline">
          {t("viewBookings")}
        </Link>
      </div>
    );
  }

  if (days.length === 0) {
    return <p className="mt-6 text-sm text-slate">{t("noAvailability")}</p>;
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
      <input type="hidden" name="startAt" value={selectedSlot} />
      <input type="hidden" name="customerPriceQuoteId" value={quote?.success ? quote.customerPriceQuoteId : ""} />
      <input type="hidden" name="tutorPayoutQuoteId" value={quote?.success ? quote.tutorPayoutQuoteId : ""} />

      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">{t("selectDay")}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              data-testid={`day-tab-${day.date}`}
              onClick={() => {
                setSelectedDate(day.date);
                setSelectedSlot("");
              }}
              className={`shrink-0 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                day.date === selectedDate
                  ? "border-blue bg-blue/5 text-blue"
                  : "border-neutral-300 text-navy hover:border-blue"
              }`}
            >
              {dayFormatter.format(new Date(`${day.date}T12:00:00Z`))}
            </button>
          ))}
        </div>
      </div>

      {selectedDay && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-navy">{t("selectTime")}</p>
          <div className="flex flex-wrap gap-2">
            {selectedDay.slots.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                data-testid="time-slot"
                data-slot-start={slot.startAt}
                onClick={() => setSelectedSlot(slot.startAt)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  slot.startAt === selectedSlot
                    ? "border-blue bg-blue/5 text-blue"
                    : "border-neutral-300 text-navy hover:border-blue"
                }`}
              >
                {timeFormatter.format(new Date(slot.startAt))}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="subjectId" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("subjectLabel")}
        </label>
        <Select
          id="subjectId"
          name="subjectId"
          required
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="academicLevelId" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("levelLabel")}
        </label>
        <Select
          id="academicLevelId"
          name="academicLevelId"
          value={academicLevelId}
          onChange={(e) => setAcademicLevelId(e.target.value)}
        >
          <option value="">{t("anyLevel")}</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
      </div>

      {selectedSlot && (
        <div className="rounded-md border border-neutral-200 bg-off-white p-4" data-testid="price-summary">
          {quotePending && <p className="text-sm text-slate">{t("calculatingPrice")}</p>}
          {!quotePending && quote?.success && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-slate">
                <span>{t("sessionPrice")}</span>
                <span>{formatCents(quote.basePriceCents)}</span>
              </div>
              {quote.adjustments.map((adjustment, i) => (
                <div key={i} className="flex justify-between text-slate">
                  <span>{t(`adjustmentReasons.${adjustment.reasonKey}`)}</span>
                  <span>+{formatCents(adjustment.amountCents)}</span>
                </div>
              ))}
              {quote.taxConfigured && (
                <div className="flex justify-between text-slate">
                  <span>{t("tax")}</span>
                  <span>{formatCents(quote.taxCents)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-bold text-navy">
                <span>{t("total")}</span>
                <span data-testid="total-price">{formatCents(quote.totalCents)}</span>
              </div>
            </div>
          )}
          {!quotePending && quote && !quote.success && (
            <p role="alert" className="text-sm font-semibold text-error">
              {quote.error}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        data-testid="confirm-booking"
        disabled={pending || quotePending || !quote?.success}
        className="h-12 w-full rounded-md bg-blue text-[15px] font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("confirming") : t("confirmCta")}
      </button>
    </form>
  );
}
