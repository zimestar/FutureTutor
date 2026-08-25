"use client";
import { useActionState } from "react"; import { useLocale,useTranslations } from "next-intl"; import { inviteAdminAction } from "@/lib/actions/adminManagement"; import { PermissionMatrix } from "./PermissionMatrix"; import { Surface } from "@/components/ui/Surface"; import { Button } from "@/components/ui/Button";
export function AdminInviteDialog(){
  const t=useTranslations("adminManagement.invite"),locale=useLocale();const[state,action,pending]=useActionState(inviteAdminAction,undefined);
  return <Surface padding="lg"><form action={action} className="space-y-5"><input type="hidden" name="locale" value={locale}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold text-text-primary">{t("firstName")}<input name="firstName" required className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal"/></label>
      <label className="text-sm font-bold text-text-primary">{t("lastName")}<input name="lastName" required className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal"/></label>
      <label className="text-sm font-bold text-text-primary sm:col-span-2">{t("email")}<input name="email" type="email" required className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal"/></label>
      <label className="text-sm font-bold text-text-primary sm:col-span-2">{t("preset")}<select name="rolePreset" className="mt-1 h-11 w-full rounded-md border border-border px-3 font-normal">{["FULL_ACCESS","OPERATIONS","TUTOR_SUCCESS","FINANCE_READ_ONLY","CUSTOM"].map(p=><option key={p} value={p}>{t(`presets.${p}`)}</option>)}</select></label>
    </div>
    <PermissionMatrix/>
    {state?.error&&<p role="alert" className="text-sm font-semibold text-error">{t(`errors.${state.error}`)}</p>}
    {state?.success&&<p role="status" className="text-sm font-semibold text-success">{t("success",{email:state.email})}</p>}
    <Button type="submit" disabled={pending}>{pending?t("sending"):t("send")}</Button>
  </form></Surface>;
}
