import { getTranslations,setRequestLocale } from "next-intl/server"; import { auth } from "@/lib/auth"; import { redirect } from "@/i18n/navigation"; import { db } from "@/lib/db"; import { DashboardShell } from "@/components/dashboard/DashboardShell"; import { adminNavItems } from "@/lib/adminNav"; import { PageHeader } from "@/components/ui/PageHeader"; import { Button } from "@/components/ui/Button"; import { EmptyState } from "@/components/ui/Feedback"; import { ActiveAdminRow } from "@/components/admin/ActiveAdminRow"; import { PendingInvitationRow } from "@/components/admin/PendingInvitationRow"; import { InvitationHistoryRow } from "@/components/admin/InvitationHistoryRow";

export default async function AdminsPage({params}:{params:Promise<{locale:string}>}){
  const{locale}=await params;setRequestLocale(locale);
  const session=await auth();if(session?.user.role!=="SUPER_ADMIN"){redirect({href:"/admin",locale});return}
  const[t,tNav]=await Promise.all([getTranslations({locale,namespace:"adminManagement"}),getTranslations({locale,namespace:"dashboard.nav"})]);
  const now=new Date();
  const[activeAdmins,pendingInvitations,invitationHistory]=await Promise.all([
    db.user.findMany({where:{role:{in:["ADMIN","SUPER_ADMIN"]}},select:{id:true,name:true,email:true,role:true,image:true,deactivatedAt:true,adminInvitationAccepted:{select:{rolePreset:true}},auditLogs:{select:{createdAt:true},orderBy:{createdAt:"desc"},take:1}},orderBy:{createdAt:"desc"}}),
    db.adminInvitation.findMany({where:{acceptedAt:null,revokedAt:null,expiresAt:{gt:now}},select:{id:true,firstName:true,lastName:true,email:true,rolePreset:true,expiresAt:true,createdAt:true},orderBy:{createdAt:"desc"}}),
    db.adminInvitation.findMany({where:{acceptedAt:null,OR:[{revokedAt:{not:null}},{expiresAt:{lte:now}}]},select:{id:true,firstName:true,lastName:true,email:true,rolePreset:true,expiresAt:true,revokedAt:true,createdAt:true},orderBy:{createdAt:"desc"},take:25}),
  ]);
  const dateFmt=new Intl.DateTimeFormat(locale,{dateStyle:"medium"});
  const presetLabel=(preset:string)=>t(`invite.presets.${preset}`);
  return <DashboardShell navItems={await adminNavItems(tNav, session.user)} userName={session.user.name??""}>
    <PageHeader eyebrow={t("title")} title={t("title")} description={t("description")} actions={<Button href="/admin/admins/new">{t("inviteCta")}</Button>}/>
    <section className="mt-8" aria-labelledby="active-admins-title">
      <h2 id="active-admins-title" className="mb-3 text-lg font-extrabold text-navy">{t("activeAdminsTitle")}</h2>
      {activeAdmins.length?<div className="grid gap-3">{activeAdmins.map(u=><ActiveAdminRow key={u.id} id={u.id} name={u.name??u.email} email={u.email} image={u.image} presetLabel={u.role==="SUPER_ADMIN"?t("superAdminBadge"):presetLabel(u.adminInvitationAccepted?.rolePreset??"CUSTOM")} isSuperAdmin={u.role==="SUPER_ADMIN"} isSuspended={!!u.deactivatedAt} isYou={u.id===session.user.id} lastActivity={u.auditLogs[0]?.createdAt?dateFmt.format(u.auditLogs[0].createdAt):t("never")} statusLabel={u.deactivatedAt?t("statuses.SUSPENDED"):t("statuses.ACTIVE")} viewLabel={t("view")} youLabel={t("you")}/>)}</div>:<EmptyState title={t("noActiveAdmins")} description=""/>}
    </section>
    <section className="mt-8" aria-labelledby="pending-invitations-title">
      <h2 id="pending-invitations-title" className="mb-3 text-lg font-extrabold text-navy">{t("pendingInvitationsTitle")}</h2>
      {pendingInvitations.length?<div className="grid gap-3">{pendingInvitations.map(i=><PendingInvitationRow key={i.id} invitationId={i.id} name={`${i.firstName} ${i.lastName}`} email={i.email} presetLabel={presetLabel(i.rolePreset)} invitedOn={t("invitedOn",{date:dateFmt.format(i.createdAt)})} expiresOn={t("expiresOn",{date:dateFmt.format(i.expiresAt)})} statusLabel={t("statuses.INVITED")} locale={locale==="fr"?"fr":"en"} resendLabel={t("resend")} revokeLabel={t("revoke")}/>)}</div>:<EmptyState title={t("noPendingInvitations")} description=""/>}
    </section>
    <details className="mt-8 group" aria-labelledby="invitation-history-title">
      <summary id="invitation-history-title" className="cursor-pointer text-lg font-extrabold text-navy">{t("invitationHistoryTitle")}</summary>
      <div className="mt-3">{invitationHistory.length?<div className="grid gap-2">{invitationHistory.map(i=><InvitationHistoryRow key={i.id} name={`${i.firstName} ${i.lastName}`} email={i.email} presetLabel={presetLabel(i.rolePreset)} statusLabel={i.revokedAt?t("statuses.REVOKED"):t("statuses.EXPIRED")} date={dateFmt.format(i.revokedAt??i.expiresAt)}/>)}</div>:<EmptyState title={t("noInvitationHistory")} description=""/>}</div>
    </details>
  </DashboardShell>;
}
