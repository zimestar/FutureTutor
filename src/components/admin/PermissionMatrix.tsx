"use client";
import { useTranslations } from "next-intl";
import { ADMIN_PERMISSIONS } from "@/services/adminPermissions.constants";
const groups = {
  dashboard: ["ADMIN_DASHBOARD_VIEW"], users: ["ADMIN_USERS_READ","ADMIN_USERS_WRITE"], tutors: ["ADMIN_TUTORS_READ","ADMIN_TUTORS_REVIEW","ADMIN_TUTORS_APPROVE","ADMIN_TUTORS_SUSPEND"], students: ["ADMIN_STUDENTS_READ"], guardians: ["ADMIN_GUARDIANS_READ"], bookings: ["ADMIN_BOOKINGS_READ"], sessions: ["ADMIN_SESSIONS_READ"], quickmatch: ["ADMIN_QUICKMATCH_READ","ADMIN_QUICKMATCH_MANAGE"], pricing: ["ADMIN_PRICING_READ","ADMIN_PRICING_MANAGE"], payments: ["ADMIN_PAYMENTS_READ"], admins: ["ADMIN_ADMINS_VIEW","ADMIN_ADMINS_MANAGE"],
} as const;
export function PermissionMatrix({ selected=[], disabled=false }: { selected?: string[]; disabled?: boolean }) {
  const t=useTranslations("adminManagement.permissions");
  return <div className="grid gap-2 sm:grid-cols-2">{Object.entries(groups).map(([group,permissions])=><details key={group} open className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer select-none font-extrabold text-navy">{t(`groups.${group}`)}</summary><div className="mt-3 grid gap-2">{permissions.filter((p)=>ADMIN_PERMISSIONS.includes(p)).map(p=><label key={p} className="flex min-h-9 items-center gap-3 text-sm"><input type="checkbox" name="permissions" value={p} defaultChecked={selected.includes(p)} disabled={disabled} className="size-4 shrink-0 rounded border-neutral-300" /><span>{t(`items.${p}`)}</span></label>)}</div></details>)}</div>;
}
