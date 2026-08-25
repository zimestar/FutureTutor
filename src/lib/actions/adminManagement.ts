"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { AdminPermission, AdminRolePreset } from "@/generated/prisma/enums";
import { ADMIN_PERMISSIONS, replaceAdminPermissions } from "@/services/adminPermissions";
import { acceptAdminInvitation, createAdminInvitation, resendAdminInvitation } from "@/services/adminInvitation";
import { sendAdminInvitationEmail } from "@/lib/email/adminInvitationEmail";
import { getAppBaseUrl } from "@/lib/appUrl";

export type AdminManagementState = { success: true; email: string; error?: never } | { success?: never; email?: never; error: string } | undefined;
const strings = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
const selectedPermissions = (form: FormData) => form.getAll("permissions").filter((p): p is AdminPermission => typeof p === "string" && ADMIN_PERMISSIONS.includes(p as AdminPermission));

export async function inviteAdminAction(_state: AdminManagementState, form: FormData): Promise<AdminManagementState> {
  const session = await auth(); if (session?.user.role !== "SUPER_ADMIN") return { error: "forbidden" };
  const firstName = strings(form,"firstName"), lastName = strings(form,"lastName"), email = strings(form,"email").toLowerCase(), locale = strings(form,"locale") === "fr" ? "fr" : "en";
  const preset = strings(form,"rolePreset") as AdminRolePreset;
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || !["FULL_ACCESS","OPERATIONS","TUTOR_SUCCESS","FINANCE_READ_ONLY","CUSTOM"].includes(preset)) return { error: "invalid" };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return { error: "emailExists" };
  try { const { invitation, rawToken } = await createAdminInvitation(db,{ firstName,lastName,email,invitedById:session.user.id,rolePreset:preset,permissions:selectedPermissions(form) }); const origin = await getAppBaseUrl(); const setupUrl = `${origin}/${locale}/admin/setup/${rawToken}`; await sendAdminInvitationEmail({ email,firstName,preset,setupUrl,locale }); return { success:true,email:invitation.email }; } catch { return { error:"sendFailed" }; }
}

export async function completeAdminSetupAction(_state: AdminManagementState, form: FormData): Promise<AdminManagementState> {
  const token=strings(form,"token"), password=strings(form,"password"), accepted=form.get("terms")==="on"; if(!accepted||password.length<8||password.length>72)return{error:"invalid"};
  try { const result=await acceptAdminInvitation(db,token,password); return{success:true,email:result.email}; } catch{return{error:"invalidToken"};}
}

export async function updateAdminPermissionsAction(adminId:string,_state:AdminManagementState,form:FormData){const session=await auth();if(session?.user.role!=="SUPER_ADMIN")return{error:"forbidden"};await replaceAdminPermissions(adminId,selectedPermissions(form),session.user.id);revalidatePath(`/admin/admins/${adminId}`);return{success:true};}
export async function suspendAdminAction(adminId:string){const session=await auth();if(session?.user.role!=="SUPER_ADMIN"||adminId===session.user.id)throw new Error("FORBIDDEN");await db.$transaction(async tx=>{const target=await tx.user.findUnique({where:{id:adminId},select:{role:true}});if(!target||target.role!=="ADMIN")throw new Error("FORBIDDEN");await tx.user.update({where:{id:adminId},data:{deactivatedAt:new Date()}});await tx.auditLog.create({data:{actorUserId:session.user.id,action:"admin.suspended",entityType:"User",entityId:adminId}})});revalidatePath("/admin/admins");}
export async function reactivateAdminAction(adminId:string){const session=await auth();if(session?.user.role!=="SUPER_ADMIN")throw new Error("FORBIDDEN");await db.$transaction(async tx=>{await tx.user.update({where:{id:adminId,role:"ADMIN"},data:{deactivatedAt:null}});await tx.auditLog.create({data:{actorUserId:session.user.id,action:"admin.reactivated",entityType:"User",entityId:adminId}})});revalidatePath("/admin/admins");}
export async function revokeInvitationAction(invitationId:string){const session=await auth();if(session?.user.role!=="SUPER_ADMIN")throw new Error("FORBIDDEN");await db.$transaction(async tx=>{await tx.adminInvitation.update({where:{id:invitationId,acceptedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{actorUserId:session.user.id,action:"admin.invitation_revoked",entityType:"AdminInvitation",entityId:invitationId}})});revalidatePath("/admin/admins");}

export async function resendInvitationAction(invitationId: string, locale: "en" | "fr") {
  const session = await auth(); if (session?.user.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  const { invitation, rawToken } = await resendAdminInvitation(db, invitationId, session.user.id);
  const origin = await getAppBaseUrl();
  await sendAdminInvitationEmail({ email: invitation.email, firstName: invitation.firstName, preset: invitation.rolePreset, setupUrl: `${origin}/${locale}/admin/setup/${rawToken}`, locale });
  revalidatePath("/admin/admins");
}

export async function promoteAdminToSuperAdminAction(adminId: string) {
  const session = await auth(); if (session?.user.role !== "SUPER_ADMIN" || adminId === session.user.id) throw new Error("FORBIDDEN");
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, deactivatedAt: true } });
    if (!target || target.role !== "ADMIN" || target.deactivatedAt) throw new Error("TARGET_NOT_ACTIVE_ADMIN");
    await tx.user.update({ where: { id: adminId }, data: { role: "SUPER_ADMIN" } });
    await tx.auditLog.create({ data: { actorUserId: session.user.id, action: "admin.promoted_to_super_admin", entityType: "User", entityId: adminId } });
  });
  revalidatePath(`/admin/admins/${adminId}`); revalidatePath("/admin/admins");
}
