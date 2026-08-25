import { getTranslations,setRequestLocale } from "next-intl/server";import{auth}from"@/lib/auth";import{redirect}from"@/i18n/navigation";import{DashboardShell}from"@/components/dashboard/DashboardShell";import{adminNavItems}from"@/lib/adminNav";import{AdminInviteDialog}from"@/components/admin/AdminInviteDialog";import{PageHeader}from"@/components/ui/PageHeader";
export default async function NewAdminPage({params}:{params:Promise<{locale:string}>}){
  const{locale}=await params;setRequestLocale(locale);
  const session=await auth();if(session?.user.role!=="SUPER_ADMIN"){redirect({href:"/admin",locale});return}
  const[t,tNav]=await Promise.all([getTranslations({locale,namespace:"adminManagement.invite"}),getTranslations({locale,namespace:"dashboard.nav"})]);
  return <DashboardShell navItems={await adminNavItems(tNav, session.user)} userName={session.user.name??""}>
    <PageHeader eyebrow={t("title")} title={t("title")} description={t("description")} />
    <div className="mt-8"><AdminInviteDialog/></div>
  </DashboardShell>;
}
