import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";

export default async function AdminSessionDetailPage({ params }: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params; setRequestLocale(locale);
  const authSession = await auth(); const user = authSession?.user;
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) { redirect({ href: "/login", locale }); return; }
  const [t, tNav] = await Promise.all([getTranslations({ locale, namespace: "admin.operations.sessionDetail" }), getTranslations({ locale, namespace: "dashboard.nav" })]);
  const item = await db.session_.findUnique({ where: { id: sessionId }, select: { id: true, status: true, startedAt: true, completedAt: true, endedAt: true, noShowConvergedAt: true, booking: { select: { id: true, mode: true, startAt: true, endAt: true, timezone: true, studentProfile: { select: { firstName: true, lastName: true } }, tutorProfile: { select: { user: { select: { name: true, email: true } } } } } }, attendanceEvents: { where: { eventType: "CHECK_IN" }, select: { id: true, participantRole: true, occurredAt: true, source: true }, orderBy: { occurredAt: "asc" } } } });
  if (!item) notFound();
  const format = (value: Date | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: item.booking.timezone }).format(value) : t("notRecorded");
  const student = item.attendanceEvents.find((event) => event.participantRole === "STUDENT"); const tutor = item.attendanceEvents.find((event) => event.participantRole === "TUTOR");
  const rows = [[t("sessionId"), item.id], [t("booking"), item.booking.id], [t("student"), `${item.booking.studentProfile.firstName} ${item.booking.studentProfile.lastName}`], [t("tutor"), item.booking.tutorProfile.user.name ?? item.booking.tutorProfile.user.email], [t("mode"), item.booking.mode], [t("scheduled"), `${format(item.booking.startAt)} – ${format(item.booking.endAt)}`], [t("started"), format(item.startedAt)], [t("completed"), format(item.completedAt)], [t("ended"), format(item.endedAt)], [t("noShow"), format(item.noShowConvergedAt)], [t("studentCheckIn"), student ? `${format(student.occurredAt)} · ${student.source}` : t("notRecorded")], [t("tutorCheckIn"), tutor ? `${format(tutor.occurredAt)} · ${tutor.source}` : t("notRecorded")], [t("attendanceCount"), String(item.attendanceEvents.length)]];
  return <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}><Link href="/admin/sessions" className="inline-flex min-h-11 items-center font-bold text-blue">{t("back")}</Link><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-navy">{t("title")}</h1><Badge variant="outline">{item.status}</Badge></div><dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface px-4">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="font-bold text-text-secondary">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></DashboardShell>;
}
