"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/Input";
import { createBookingAction } from "@/lib/actions/bookings";
import { createPriceQuoteAction, type PriceQuoteResult } from "@/lib/actions/pricing";
import { preparePaymentForBookingQuoteAction, type PreparePaymentState } from "@/lib/actions/payments";
import { StripePaymentForm } from "@/components/payments/StripePaymentForm";
import { acquirePreparationLock, paymentPreparationView } from "@/lib/paymentPreparation";

export interface BookingWidgetDaySlot {
  date: string;
  slots: { startAt: string; endAt: string }[];
}

export interface BookingWidgetOption {
  id: string;
  label: string;
}

export interface BookableStudentOption {
  id: string;
  label: string;
}

export function BookingWidget({
  tutorProfileId,
  timezone,
  days,
  subjects,
  levels,
  useStripe,
  stripePublishableKey,
  bookableStudents,
  actorIsParent,
}: {
  tutorProfileId: string;
  timezone: string;
  days: BookingWidgetDaySlot[];
  subjects: BookingWidgetOption[];
  levels: BookingWidgetOption[];
  useStripe: boolean;
  stripePublishableKey: string | null;
  // Phase H.7 — server-authoritative (listBookableStudentsForActor), never
  // invented by this component. A SELF_MANAGED Student's own session has
  // exactly one entry (their own profile) and no selector is shown, per
  // §11's "preserve current UX as closely as possible." A Parent sees
  // every linked child they may currently book for.
  bookableStudents: BookableStudentOption[];
  actorIsParent: boolean;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createBookingAction, undefined);
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? "");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [academicLevelId, setAcademicLevelId] = useState("");
  const [studentProfileId, setStudentProfileId] = useState(bookableStudents[0]?.id ?? "");
  // Keyed by the exact selection it was fetched for — a stale quote from a
  // superseded selection is detected during render (a pure comparison)
  // rather than cleared via a synchronous setState inside the effect body.
  const [quoteState, setQuoteState] = useState<{ key: string; result: PriceQuoteResult } | null>(null);
  const [quotePending, startQuoteTransition] = useTransition();
  const quoteKey =
    selectedSlot && subjectId && studentProfileId
      ? `${studentProfileId}|${selectedSlot}|${subjectId}|${academicLevelId}`
      : null;
  const quote = quoteState && quoteState.key === quoteKey ? quoteState.result : null;
  const selectedStudent = bookableStudents.find((s) => s.id === studentProfileId) ?? null;

  // Payment preparation — only meaningful in live mode, and only once a
  // real quote exists. Keyed the same way as the quote itself so changing
  // the selection invalidates a stale client secret/authorization.
  const [paymentState, setPaymentState] = useState<{ key: string; result: PreparePaymentState } | null>(null);
  const [preparingPayment, startPreparingPayment] = useTransition();
  const activePaymentPreparations = useRef(new Set<string>());
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState<{ key: string; id: string } | null>(null);
  const payment = paymentState && paymentState.key === quoteKey ? paymentState.result : null;
  const authorizedPiId =
    stripePaymentIntentId && stripePaymentIntentId.key === quoteKey ? stripePaymentIntentId.id : null;
  const paymentView = paymentPreparationView(preparingPayment, payment);
  const paymentPreparationError = t("errors.paymentPreparationFailed");

  const preparePayment = useCallback((key: string, customerPriceQuoteId: string, fallbackError: string) => {
    if (!acquirePreparationLock(activePaymentPreparations.current, key)) return;
    startPreparingPayment(async () => {
      try {
        const result = await preparePaymentForBookingQuoteAction(customerPriceQuoteId);
        setPaymentState({ key, result });
      } catch {
        setPaymentState({ key, result: { success: false, error: fallbackError, retryable: true } });
      } finally {
        activePaymentPreparations.current.delete(key);
      }
    });
  }, []);

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
    if (!quoteKey || !studentProfileId) return;
    let cancelled = false;
    startQuoteTransition(async () => {
      const result = await createPriceQuoteAction({
        studentProfileId,
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
  }, [quoteKey, selectedSlot, subjectId, academicLevelId, tutorProfileId, studentProfileId]);

  // In live mode, once a real quote exists, prepare (or reuse) the Payment
  // + PaymentIntent for it so the card form can render.
  useEffect(() => {
    if (!useStripe || !quoteKey || !quote?.success) return;
    preparePayment(quoteKey, quote.customerPriceQuoteId, paymentPreparationError);
  }, [useStripe, quoteKey, quote, preparePayment, paymentPreparationError]);

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

  const readyToSubmit = quote?.success && (!useStripe || authorizedPiId);

  return (
    // Deliberately a <div>, not a <form> — StripePaymentForm below renders
    // its own <form>, and nesting a form inside another form is invalid
    // HTML with undefined/inconsistent browser submit-event behavior (this
    // was the root cause of a P1 where "Confirm Booking" silently failed to
    // reach Stripe). The actual createBookingAction submission is its own
    // small, separate <form> further down — a sibling of StripePaymentForm,
    // not an ancestor — mirroring the pattern QuickMatchPriceReview.tsx
    // already uses correctly. All the fields that form needs are tracked in
    // React state already and passed via hidden inputs on that form alone.
    <div className="mt-6 flex flex-col gap-4">
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      {/* Phase H.7 (§11/§35) — the selected learner's identity stays
          visible for the whole flow: a real selector when the Parent has
          more than one eligible child, a plain "booking for" label when
          there's exactly one (no unnecessary dropdown, per §11), and
          nothing extra for a Student booking themselves (unchanged UX). */}
      {bookableStudents.length > 1 && (
        <div data-testid="learner-selector">
          <label htmlFor="learnerSelect" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("learnerSelectorLabel")}
          </label>
          <Select
            id="learnerSelect"
            value={studentProfileId}
            onChange={(e) => setStudentProfileId(e.target.value)}
          >
            {bookableStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.label}
              </option>
            ))}
          </Select>
          {actorIsParent && <p className="mt-1.5 text-xs text-slate">{t("paidByParentNote")}</p>}
        </div>
      )}
      {bookableStudents.length === 1 && actorIsParent && selectedStudent && (
        <p className="text-sm text-slate" data-testid="learner-single-label">
          {t("bookingForLabel", { name: selectedStudent.label })}
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

      {useStripe && quote?.success && !authorizedPiId && (
        <div aria-live="polite">
          {paymentView.state === "preparing" && <p className="text-sm text-slate">{t("preparingPayment")}</p>}
          {(paymentView.state === "failed-retryable" || paymentView.state === "failed-terminal") && (
            <div className="rounded-md bg-error-light p-3">
              <p role="alert" className="text-sm font-semibold text-error">{paymentView.error}</p>
              {paymentView.state === "failed-retryable" ? (
                <button
                  type="button"
                  data-testid="retry-booking-payment"
                  onClick={() =>
                    quoteKey && preparePayment(quoteKey, quote.customerPriceQuoteId, paymentPreparationError)
                  }
                  disabled={preparingPayment}
                  className="mt-3 min-h-11 rounded-md border border-error px-4 text-sm font-bold text-error transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("retryPaymentCta")}
                </button>
              ) : (
                <p className="mt-2 text-sm text-text-secondary">{t("restartPaymentFlow")}</p>
              )}
            </div>
          )}
          {!preparingPayment && payment?.success && payment.clientSecret && stripePublishableKey && (
            <StripePaymentForm
              clientSecret={payment.clientSecret}
              publishableKey={stripePublishableKey}
              onAuthorized={(id) => quoteKey && setStripePaymentIntentId({ key: quoteKey, id })}
              submitLabel={t("confirmCta")}
              pendingLabel={t("confirming")}
              errorMessage={t("paymentErrorFallback")}
            />
          )}
        </div>
      )}

      {(!useStripe || authorizedPiId) && (
        <form action={formAction}>
          <input type="hidden" name="studentProfileId" value={studentProfileId} />
          <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
          <input type="hidden" name="startAt" value={selectedSlot} />
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="academicLevelId" value={academicLevelId} />
          <input type="hidden" name="customerPriceQuoteId" value={quote?.success ? quote.customerPriceQuoteId : ""} />
          <input type="hidden" name="tutorPayoutQuoteId" value={quote?.success ? quote.tutorPayoutQuoteId : ""} />
          {authorizedPiId && <input type="hidden" name="stripePaymentIntentId" value={authorizedPiId} />}
          <button
            type="submit"
            data-testid="confirm-booking"
            disabled={pending || quotePending || !readyToSubmit}
            className="h-12 w-full rounded-md bg-blue text-[15px] font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? t("confirming") : t("confirmCta")}
          </button>
        </form>
      )}
    </div>
  );
}
