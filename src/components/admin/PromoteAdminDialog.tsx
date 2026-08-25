"use client";
import { useState } from "react"; import { useTranslations } from "next-intl"; import { promoteAdminToSuperAdminAction } from "@/lib/actions/adminManagement"; import { Surface } from "@/components/ui/Surface"; import { Button } from "@/components/ui/Button";
export function PromoteAdminDialog({adminId}:{adminId:string}) {
  const t=useTranslations("adminManagement.detail"); const [confirmed,setConfirmed]=useState(false);
  return <Surface padding="lg" className="border-warning/40 bg-warning/5">
    <h2 className="font-extrabold text-navy">{t("promoteTitle")}</h2>
    <p className="mt-1 text-sm text-text-secondary">{t("promoteDescription")}</p>
    <label className="mt-3 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} className="mt-0.5 size-4 shrink-0" /><span>{t("promoteConfirm")}</span></label>
    <form action={promoteAdminToSuperAdminAction.bind(null,adminId)} className="mt-3"><Button type="submit" variant="outline" disabled={!confirmed}>{t("promote")}</Button></form>
  </Surface>;
}
