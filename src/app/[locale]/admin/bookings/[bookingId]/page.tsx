import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ locale: string; bookingId: string }> }) {
  const { locale, bookingId } = await params; setRequestLocale(locale);
  const session = await auth(); const user = session?.user;
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) { redirect({ href: "/login", locale }); return; }
  const [t, tNav, tSubjects, tLevels] = await Promise.all([getTranslations({ locale, namespace: "admin.operations.bookingDetail" }), getTranslations({ locale, namespace: "dashboard.nav" }), getTranslations({ locale, namespace: "subjects.items" }), getTranslations({ locale, namespace: "gradeLevels" })]);
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, startAt: true, endAt: true, timezone: true, mode: true, status: true, createdAt: true, subject: { select: { slug: true } }, academicLevel: { select: { slug: true } }, studentProfile: { select: { firstName: true, lastName: true } }, tutorProfile: { select: { user: { select: { name: true, email: true } } } }, session: { select: { id: true, status: true } } } });
  if (!booking) notFound();
  const format = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: booking.timezone }).format(value);
  const rows = [[t("bookingId"), booking.id], [t("student"), `${booking.studentProfile.firstName} ${booking.studentProfile.lastName}`], [t("tutor"), booking.tutorProfile.user.name ?? booking.tutorProfile.user.email], [t("subject"), tSubjects(booking.subject.slug)], [t("level"), booking.academicLevel ? tLevels(booking.academicLevel.slug) : t("notProvided")], [t("mode"), booking.mode], [t("scheduled"), `${format(booking.startAt)} – ${format(booking.endAt)}`], [t("created"), format(booking.createdAt)]];
  return <DashboardShell navItems={await adminNavItems(tNav, user)} userName={user.name ?? ""}><Link href="/admin/bookings" className="inline-flex min-h-11 items-center font-bold text-blue">{t("back")}</Link><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-navy">{t("title")}</h1><Badge variant="outline">{booking.status}</Badge></div><dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface px-4">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="font-bold text-text-secondary">{label}</dt><dd className="break-words">{value}</dd></div>)}<div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="font-bold text-text-secondary">{t("session")}</dt><dd>{booking.session ? <Link href={`/admin/sessions/${booking.session.id}`} className="font-bold text-blue">{booking.session.status}</Link> : t("noSession")}</dd></div></dl></DashboardShell>;
}
