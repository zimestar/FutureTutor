"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PaymentStatus } from "@/generated/prisma/enums";
import { toPaymentHistoryDto, type PaymentHistoryDto } from "@/lib/paymentHistoryPresentation";

/**
 * PAYMENT-HISTORY1 — read-only. Never creates/modifies a Payment, Refund,
 * Booking, TutorEarning, or TutorTransfer row, and never calls Stripe —
 * this module only ever runs `findMany` against already-persisted,
 * already-authoritative financial records.
 *
 * Authorization: every query is scoped to `payerUserId: <the authenticated
 * session's own id>` — never a value supplied by the caller. A guardian-
 * managed child (whose own userId, if any, is never the payerUserId in
 * that scenario) structurally cannot see a guardian's payment history
 * through this path; no separate child-exclusion check is needed because
 * the existing payerUserId semantic already is that boundary.
 *
 * Status filter: only CAPTURED / PARTIALLY_REFUNDED / REFUNDED are ever
 * queried — see paymentHistoryPresentation.ts's own doc comment for why
 * every other PaymentStatus is deliberately excluded from this history.
 */

const PAGE_LIMIT = 20;
const HISTORY_STATUSES: PaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];

const PAYMENT_HISTORY_SELECT = {
  id: true,
  amountCents: true,
  currency: true,
  refundedAmountCents: true,
  status: true,
  capturedAt: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      mode: true,
      startAt: true,
      endAt: true,
      timezone: true,
      subject: { select: { slug: true } },
      academicLevel: { select: { slug: true } },
      tutorProfile: { select: { user: { select: { name: true } } } },
    },
  },
  refunds: {
    select: { id: true, amountCents: true, currency: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type RawPaymentRow = Awaited<ReturnType<typeof queryOnePage>> extends Array<infer T> ? T : never;

async function queryOnePage(userId: string, cursor?: string | null) {
  return db.payment.findMany({
    where: { payerUserId: userId, status: { in: HISTORY_STATUSES } },
    select: PAYMENT_HISTORY_SELECT,
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    take: PAGE_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

function toDto(row: RawPaymentRow): PaymentHistoryDto | null {
  return toPaymentHistoryDto({
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    refundedAmountCents: row.refundedAmountCents,
    status: row.status,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    booking: row.booking
      ? {
          id: row.booking.id,
          subjectSlug: row.booking.subject.slug,
          academicLevelSlug: row.booking.academicLevel?.slug ?? null,
          tutorFirstName: row.booking.tutorProfile.user.name?.split(" ")[0] ?? "",
          mode: row.booking.mode,
          startAt: row.booking.startAt,
          endAt: row.booking.endAt,
          timezone: row.booking.timezone,
        }
      : null,
    refunds: row.refunds,
  });
}

export interface PaymentHistoryPage {
  items: PaymentHistoryDto[];
  nextCursor: string | null;
}

export async function getPaymentHistoryPageAction(cursor?: string | null): Promise<PaymentHistoryPage> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { items: [], nextCursor: null };

  const rows = await queryOnePage(userId, cursor);
  const hasMore = rows.length > PAGE_LIMIT;
  const page = hasMore ? rows.slice(0, PAGE_LIMIT) : rows;

  return {
    items: page.map(toDto).filter((dto): dto is PaymentHistoryDto => dto !== null),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}
