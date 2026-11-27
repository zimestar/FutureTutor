"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Info, LockKeyhole, Mail, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/Input";
import { createBookingAction } from "@/lib/actions/bookings";
import { createPriceQuoteAction, type PriceQuoteResult } from "@/lib/actions/pricing";
import { preparePaymentForBookingQuoteAction, type PreparePaymentState } from "@/lib/actions/payments";
import { StripePaymentForm } from "@/components/payments/StripePaymentForm";
import { acquirePreparationLock, paymentPreparationView } from "@/lib/paymentPreparation";
import { shouldAutoFinalizeBooking } from "@/lib/bookingAutoFinalize";
import { resolveInitialAcademicLevel } from "@/lib/pricingLevelSelection";

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
  /** BETA-PRICINGFIX1 — the student's own canonical academic level
   * (StudentProfile.academicLevelId), used to preselect the pricing form's
   * level field instead of defaulting to an unpriced "Any level" state. Not
   * a second source of truth — read once, server-side, from the same
   * StudentProfile row listBookableStudentsForActor already resolves. */
  academicLevelId: string | null;
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
  tutorLearningMode,
  tutorName,
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
  // PROD-DIRECT-BOOKING-MODEFIX1 — the tutor's own CAPABILITY
  // (TutorProfile.learningMode), never the actual session mode on its own.
  // ONLINE/IN_PERSON tutors resolve to that one mode deterministically, no
  // selector shown; BOTH-capable tutors require an explicit choice below.
  tutorLearningMode: "ONLINE" | "IN_PERSON" | "BOTH";
  /** Tutor first name, shown on the confirmation card only. */
  tutorName?: string;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createBookingAction, undefined);
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? "");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [academicLevelId, setAcademicLevelId] = useState(() =>
    resolveInitialAcademicLevel(bookableStudents[0]?.academicLevelId, levels)
  );
  const [studentProfileId, setStudentProfileId] = useState(bookableStudents[0]?.id ?? "");
  // PROD-DIRECT-BOOKING-MODEFIX1 — deterministic for a single-mode tutor
  // (matches tutorLearningMode exactly); starts unset for a BOTH-capable
  // tutor, requiring an explicit choice before any quote can be requested
  // (see the quoteKey gate below) — never silently inferred.
  const [requestedMode, setRequestedMode] = useState<"ONLINE" | "IN_PERSON" | "">(
    tutorLearningMode === "BOTH" ? "" : tutorLearningMode
  );
  // Keyed by the exact selection it was fetched for — a stale quote from a
  // superseded selection is detected during render (a pure comparison)
  // rather than cleared via a synchronous setState inside the effect body.
  const [quoteState, setQuoteState] = useState<{ key: string; result: PriceQuoteResult } | null>(null);
  const [quotePending, startQuoteTransition] = useTransition();
  // BETA-PRICINGFIX1 — academicLevelId is now part of the truthiness gate,
  // not just the key: quote generation must not run while the level is
  // still unresolved (see resolveInitialLevel's doc comment above).
  // PROD-DIRECT-BOOKING-MODEFIX1 — requestedMode joins the same gate: a
  // BOTH-capable tutor's quote must not be requested until the customer has
  // explicitly picked Online or In person.
  const quoteKey =
    selectedSlot && subjectId && studentProfileId && academicLevelId && requestedMode
      ? `${studentProfileId}|${selectedSlot}|${subjectId}|${academicLevelId}|${requestedMode}`
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

  // Single-confirmation flow (P1 fix) — once Stripe authorization succeeds
  // (onAuthorized below), the booking-finalization <form> is submitted
  // programmatically via requestSubmit() instead of requiring a second user
  // click on a second, identically-labeled "Confirm Booking" button. This
  // reuses createBookingAction exactly as-is (no client-side duplication of
  // its logic) — requestSubmit() triggers the same Server Action path
  // useActionState already wires up. Keyed by quoteKey (not a bare
  // boolean) so a genuinely new selection can auto-finalize again, while a
  // stray effect re-run for the SAME authorization can never double-submit.
  const bookingFormRef = useRef<HTMLFormElement>(null);
  const autoFinalizedForKey = useRef<string | null>(null);
  useEffect(() => {
    if (!shouldAutoFinalizeBooking({ useStripe, authorizedPiId, quoteKey, alreadyFinalizedForKey: autoFinalizedForKey.current })) {
      return;
    }
    autoFinalizedForKey.current = quoteKey;
    bookingFormRef.current?.requestSubmit();
  }, [useStripe, authorizedPiId, quoteKey]);

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
    () => new Intl.DateTimeFormat(`${locale === "fr" ? "fr" : "en"}-CA`, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    [locale]
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(`${locale === "fr" ? "fr" : "en"}-CA`, { hour: "numeric", minute: "2-digit", timeZone: timezone }),
    [locale, timezone]
  );
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }),
    [locale]
  );
  const formatCents = (cents: number) => currencyFormatter.format(cents / 100);


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
        tutoringMode: requestedMode || undefined,
      });
      if (!cancelled) setQuoteState({ key: quoteKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [quoteKey, selectedSlot, subjectId, academicLevelId, tutorProfileId, studentProfileId, requestedMode]);

  // In live mode, once a real quote exists, prepare (or reuse) the Payment
  // + PaymentIntent for it so the card form can render.
  useEffect(() => {
    if (!useStripe || !quoteKey || !quote?.success) return;
    preparePayment(quoteKey, quote.customerPriceQuoteId, paymentPreparationError);
  }, [useStripe, quoteKey, quote, preparePayment, paymentPreparationError]);

  const selectedDay = days.find((day) => day.date === selectedDate);
  const selectedSlotData = selectedDay?.slots.find((slot) => slot.startAt === selectedSlot) ?? null;
  const selectedSlotMinutes = selectedSlotData
    ? Math.round((new Date(selectedSlotData.endAt).getTime() - new Date(selectedSlotData.startAt).getTime()) / 60000)
    : null;

  if (state?.success) {
    // DESIGN-SYSTEM2 — a real confirmation: what was booked, what it cost,
    // and only the next steps the platform actually performs (the
    // confirmation email is sent when the payment is captured; the session
    // is joined from Bookings).
    const subjectLabel = subjects.find((subject) => subject.id === subjectId)?.label;
    const recap: Array<{ label: string; value: string }> = [];
    if (tutorName) recap.push({ label: t("confirmation.tutor"), value: tutorName });
    if (selectedSlotData) {
      recap.push({
        label: t("confirmation.when"),
        value: `${dayFormatter.format(new Date(`${selectedDate}T12:00:00Z`))} · ${timeFormatter.format(new Date(selectedSlotData.startAt))}${
          selectedSlotMinutes ? ` · ${t("durationMinutes", { count: selectedSlotMinutes })}` : ""
        }`,
      });
    }
    if (subjectLabel) recap.push({ label: t("confirmation.subject"), value: subjectLabel });
    if (requestedMode) recap.push({ label: t("confirmation.format"), value: requestedMode === "ONLINE" ? t("modeOnline") : t("modeInPerson") });
    if (quote?.success) recap.push({ label: t("confirmation.paid"), value: formatCents(quote.totalCents) });

    return (
      <div className="mt-5" data-testid="booking-confirmation" role="status">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-light text-success">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-4 text-xl font-extrabold tracking-tight text-navy">{t("success")}</p>
          <p className="mt-1 text-sm text-text-secondary">{t("confirmation.subtitle")}</p>
        </div>

        {recap.length > 0 && (
          <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-canvas px-4">
            {recap.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                <dt className="text-text-secondary">{row.label}</dt>
                <dd className="text-right font-semibold text-navy">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-5 text-sm font-bold text-navy">{t("confirmation.nextTitle")}</p>
        <ul className="mt-2 flex flex-col gap-2.5 text-sm text-text-secondary">
          <li className="flex items-start gap-2.5">
            <Mail className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
            {t("confirmation.nextEmail")}
          </li>
          <li className="flex items-start gap-2.5">
            <Video className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
            {t("confirmation.nextJoin")}
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/dashboard/bookings"
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-blue/90"
          >
            {t("viewBookings")}
          </Link>
          <Link
            href="/dashboard"
            className="flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold text-navy transition-colors hover:border-blue/50"
          >
            {t("confirmation.backToDashboard")}
          </Link>
        </div>
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
    <div className="mt-5 flex flex-col gap-5">
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
            onChange={(e) => {
              const nextId = e.target.value;
              setStudentProfileId(nextId);
              // BETA-PRICINGFIX1 — switching learners re-derives the level
              // preselection from the newly selected student's own profile
              // rather than carrying over a level that may not apply to
              // them (or may not even be one of this tutor's offered
              // levels).
              const nextStudent = bookableStudents.find((s) => s.id === nextId);
              setAcademicLevelId(resolveInitialAcademicLevel(nextStudent?.academicLevelId, levels));
            }}
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
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              data-testid={`day-tab-${day.date}`}
              onClick={() => {
                setSelectedDate(day.date);
                setSelectedSlot("");
              }}
              aria-pressed={day.date === selectedDate}
              className={`shrink-0 snap-start whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                day.date === selectedDate
                  ? "border-blue bg-blue text-white shadow-sm"
                  : "border-border bg-surface text-navy hover:border-blue/50"
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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
            {selectedDay.slots.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                data-testid="time-slot"
                data-slot-start={slot.startAt}
                onClick={() => setSelectedSlot(slot.startAt)}
                aria-pressed={slot.startAt === selectedSlot}
                className={`rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                  slot.startAt === selectedSlot
                    ? "border-blue bg-blue text-white shadow-sm"
                    : "border-border bg-surface text-navy hover:border-blue/50"
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
          required
          value={academicLevelId}
          onChange={(e) => setAcademicLevelId(e.target.value)}
        >
          {/* BETA-PRICINGFIX1 — a real, priceable level must be chosen
              explicitly; this placeholder is never itself a valid selection
              for quote generation (see quoteKey's gating above). */}
          <option value="" disabled>
            {t("selectLevelPlaceholder")}
          </option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
      </div>

      {/* PROD-DIRECT-BOOKING-MODEFIX1 — only a BOTH-capable tutor is
          ambiguous enough to need this; a single-mode tutor's session mode
          is already unambiguous and shown nowhere else needs a control. */}
      {tutorLearningMode === "BOTH" && (
        <div>
          <label htmlFor="tutoringMode" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("modeLabel")}
          </label>
          <Select
            id="tutoringMode"
            required
            value={requestedMode}
            onChange={(e) => setRequestedMode(e.target.value as "ONLINE" | "IN_PERSON")}
          >
            <option value="" disabled>
              {t("selectModePlaceholder")}
            </option>
            <option value="ONLINE">{t("modeOnline")}</option>
            <option value="IN_PERSON">{t("modeInPerson")}</option>
          </Select>
        </div>
      )}

      {selectedSlot && (
        <div className="rounded-xl border border-border bg-canvas p-4" data-testid="price-summary">
          {selectedSlotData && (
            <div className="mb-3 flex items-start gap-3 border-b border-border pb-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue/10 text-blue">
                <CalendarClock className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-bold text-navy">{t("summaryTitle")}</p>
                <p className="text-text-secondary">
                  {dayFormatter.format(new Date(`${selectedDate}T12:00:00Z`))} · {timeFormatter.format(new Date(selectedSlotData.startAt))}
                  {selectedSlotMinutes ? ` · ${t("durationMinutes", { count: selectedSlotMinutes })}` : ""}
                </p>
              </div>
            </div>
          )}
          {!academicLevelId && (
            <p className="text-sm text-slate" data-testid="level-required-hint">
              {t("selectLevelToSeePricing")}
            </p>
          )}
          {academicLevelId && quotePending && <p className="text-sm text-slate">{t("calculatingPrice")}</p>}
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
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-navy">
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
          {paymentView.state === "failed-terminal" && payment?.success === false && payment.reason === "beta_gate" && (
            <div className="flex items-start gap-3 rounded-xl border border-blue/20 bg-blue/5 p-4" data-testid="beta-gate-notice">
              <Info className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden="true" />
              <p className="text-sm leading-6 text-navy">{paymentView.error}</p>
            </div>
          )}
          {(paymentView.state === "failed-retryable" ||
            (paymentView.state === "failed-terminal" && !(payment?.success === false && payment.reason === "beta_gate"))) && (
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
              ) : payment?.success === false && payment.reason === "beta_gate" ? null : (
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
          {!preparingPayment && payment?.success && payment.clientSecret && stripePublishableKey && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              {t("securePayment")}
            </p>
          )}
        </div>
      )}

      {/* Non-Stripe / dev-bypass path — unchanged single manual click, as
          it already was before this fix (there was never a two-stage
          problem here, since no separate Stripe authorization step
          exists in this mode). */}
      {!useStripe && (
        <form action={formAction}>
          <input type="hidden" name="studentProfileId" value={studentProfileId} />
          <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
          <input type="hidden" name="startAt" value={selectedSlot} />
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="academicLevelId" value={academicLevelId} />
          <input type="hidden" name="tutoringMode" value={requestedMode} />
          <input type="hidden" name="customerPriceQuoteId" value={quote?.success ? quote.customerPriceQuoteId : ""} />
          <input type="hidden" name="tutorPayoutQuoteId" value={quote?.success ? quote.tutorPayoutQuoteId : ""} />
          <button
            type="submit"
            data-testid="confirm-booking"
            disabled={pending || quotePending || !readyToSubmit}
            className="h-12 w-full rounded-xl bg-blue text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? t("confirming") : t("confirmCta")}
          </button>
        </form>
      )}

      {/* Stripe path, post-authorization — no second user-facing CTA. The
          form below exists only as requestSubmit()'s target (see the
          effect above) and is never presented as something to click; while
          it runs, a distinct "Finalizing…" status replaces the payment UI
          entirely. On failure, the existing top-of-widget error banner
          already shows state.error — this block only adds a way to safely
          retry the SAME already-authorized PaymentIntent (idempotent per
          verifyAndAuthorizePaymentIntent's own guard), never a way to
          create a second one. */}
      {useStripe && authorizedPiId && (
        <div aria-live="polite">
          {!state?.error && (
            <p className="text-sm font-semibold text-navy" data-testid="finalizing-booking">
              {t("finalizingBooking")}
            </p>
          )}
          {state?.error && (
            <button
              type="button"
              data-testid="retry-booking-finalization"
              onClick={() => bookingFormRef.current?.requestSubmit()}
              disabled={pending}
              className="min-h-11 rounded-md border border-error px-4 text-sm font-bold text-error transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("retryFinalizationCta")}
            </button>
          )}
          <form ref={bookingFormRef} action={formAction} data-testid="direct-booking-finalize-form">
            <input type="hidden" name="studentProfileId" value={studentProfileId} />
            <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
            <input type="hidden" name="startAt" value={selectedSlot} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="academicLevelId" value={academicLevelId} />
            {/* PROD-DIRECT-BOOKING-MODEFIX2 — missing from this form since
                PROD-DIRECT-BOOKING-MODEFIX1 (the non-Stripe form above had it,
                this one silently didn't). This is the form the real
                production (Stripe/live) path actually submits, so a
                BOTH-capable tutor's booking always failed
                resolveRequestedTutoringMode's own "missing => reject" rule
                after a real card authorization had already succeeded. */}
            <input type="hidden" name="tutoringMode" value={requestedMode} />
            <input type="hidden" name="customerPriceQuoteId" value={quote?.success ? quote.customerPriceQuoteId : ""} />
            <input type="hidden" name="tutorPayoutQuoteId" value={quote?.success ? quote.tutorPayoutQuoteId : ""} />
            <input type="hidden" name="stripePaymentIntentId" value={authorizedPiId} />
          </form>
        </div>
      )}
    </div>
  );
}
