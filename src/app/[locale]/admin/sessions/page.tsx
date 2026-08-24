import type { SessionStatus } from "@/generated/prisma/enums";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/adminNav";

export default async function AdminSessionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const { locale } = await params; const { status = "" } = await searchParams; setRequestLocale(locale);
  const authSession = await auth(); const user = authSession?.user;
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) { redirect({ href: "/login", locale }); return; }
  const [t, tNav, tSubjects] = await Promise.all([getTranslations({ locale, namespace: "admin.operations.sessions" }), getTranslations({ locale, namespace: "dashboard.nav" }), getTranslations({ locale, namespace: "subjects.items" })]);
  const statuses: SessionStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "INTERRUPTED"];
  const sessions = await db.session_.findMany({ where: statuses.includes(status as SessionStatus) ? { status: status as SessionStatus } : {}, orderBy: { booking: { startAt: "desc" } }, take: 100, select: { id: true, status: true, booking: { select: { startAt: true, timezone: true, mode: true, subject: { select: { slug: true } }, studentProfile: { select: { firstName: true, lastName: true } }, tutorProfile: { select: { user: { select: { name: true } } } } } }, attendanceEvents: { where: { eventType: "CHECK_IN" }, select: { participantRole: true } } } });
  return <DashboardShell navItems={adminNavItems(tNav)} userName={user.name ?? ""}><PageHeader title={t("title")} description={t("description")} /><form className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"><label className="w-full text-sm font-bold sm:max-w-xs">{t("status")}<select name="status" defaultValue={status} className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal"><option value="">{t("all")}</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><button className="min-h-11 rounded-md bg-blue px-5 font-bold text-white">{t("apply")}</button></form>{sessions.length ? <div className="mt-6 space-y-3">{sessions.map((s) => { const present = new Set(s.attendanceEvents.map((a) => a.participantRole)); return <div key={s.id} className="rounded-xl border border-border bg-surface p-4"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-extrabold">{tSubjects(s.booking.subject.slug)}</h2><p className="mt-1 text-sm text-text-secondary">{s.booking.studentProfile.firstName} {s.booking.studentProfile.lastName} · {s.booking.tutorProfile.user.name}</p></div><Badge variant={s.status === "IN_PROGRESS" ? "blue" : "outline"}>{s.status}</Badge></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-text-secondary"><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: s.booking.timezone }).format(s.booking.startAt)} · {s.booking.mode}</span><span>{t("attendance", { tutor: present.has("TUTOR") ? t("present") : t("absent"), student: present.has("STUDENT") ? t("present") : t("absent") })}</span><Link href={`/admin/sessions/${s.id}`} className="font-bold text-blue">{t("details")}</Link></div></div>; })}</div> : <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center">{t("empty")}</p>}</DashboardShell>;
}
