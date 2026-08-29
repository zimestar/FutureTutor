/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately minimal Prisma transaction test double */
import { describe, expect, it } from "vitest";
import { ADMIN_INVITATION_TTL_MS, hashAdminInvitationToken, isAdminInvitationExpired, previewAdminInvitation, resendAdminInvitation } from "./adminInvitation";
import { ADMIN_PERMISSIONS, ADMIN_PRESETS, permissionsForPreset } from "./adminPermissions";

describe("Admin Management security primitives", () => {
  it("hashes invitation tokens deterministically without preserving plaintext", () => { const raw="safe-test-token-12345678901234567890"; const hash=hashAdminInvitationToken(raw); expect(hash).toHaveLength(64); expect(hash).not.toContain(raw); expect(hashAdminInvitationToken(raw)).toBe(hash); });
  it("uses an exact 72-hour TTL and expires at the boundary", () => { expect(ADMIN_INVITATION_TTL_MS).toBe(72*60*60*1000); const expiry=new Date("2030-01-04T00:00:00Z"); expect(isAdminInvitationExpired(expiry,new Date("2030-01-03T23:59:59Z"))).toBe(false); expect(isAdminInvitationExpired(expiry,expiry)).toBe(true); });
  it("maps all four presets to constrained permissions", () => { expect(ADMIN_PRESETS.FULL_ACCESS).toEqual(ADMIN_PERMISSIONS); expect(ADMIN_PRESETS.OPERATIONS).toEqual(["ADMIN_DASHBOARD_VIEW","ADMIN_STUDENTS_READ","ADMIN_STUDENTS_SUSPEND","ADMIN_GUARDIANS_READ","ADMIN_GUARDIANS_SUSPEND","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_TUTORS_READ","ADMIN_QUICKMATCH_READ"]); expect(ADMIN_PRESETS.TUTOR_SUCCESS).toContain("ADMIN_TUTORS_APPROVE"); expect(ADMIN_PRESETS.TUTOR_SUCCESS).toContain("ADMIN_TUTORS_SUSPEND"); expect(ADMIN_PRESETS.FINANCE_READ_ONLY).toEqual(["ADMIN_DASHBOARD_VIEW","ADMIN_PAYMENTS_READ","ADMIN_BOOKINGS_READ","ADMIN_SESSIONS_READ","ADMIN_PRICING_READ"]); expect(ADMIN_PRESETS.FINANCE_READ_ONLY).not.toContain("ADMIN_PRICING_MANAGE"); });
  it("deduplicates custom permission assignments", () => expect(permissionsForPreset("CUSTOM",["ADMIN_USERS_READ","ADMIN_USERS_READ"])).toEqual(["ADMIN_USERS_READ"]));
  it("revokes the old token and issues a fresh single-use token on resend", async () => {
    const oldToken="old-safe-test-token-12345678901234567890", now=new Date("2030-01-01T00:00:00Z");
    const rows=new Map<string,any>(); const previous:any={id:"old",firstName:"Ada",lastName:"Admin",email:"ada@example.test",invitedById:"owner",tokenHash:hashAdminInvitationToken(oldToken),expiresAt:new Date("2030-01-02"),acceptedAt:null,revokedAt:null,rolePreset:"OPERATIONS",permissions:["ADMIN_DASHBOARD_VIEW"]}; rows.set(previous.tokenHash,previous);
    const tx={adminInvitation:{findUnique:async({where}:{where:any})=>where.id==="old"?previous:rows.get(where.tokenHash),update:async()=>{previous.revokedAt=now;return previous},create:async({data}:{data:any})=>{const row={id:"new",acceptedAt:null,revokedAt:null,...data};rows.set(row.tokenHash,row);return row}},auditLog:{create:async()=>({})}};
    const client={$transaction:async(fn:any)=>fn(tx),adminInvitation:{findUnique:async({where}:{where:any})=>rows.get(where.tokenHash)}} as any;
    const result=await resendAdminInvitation(client,"old","owner",now);
    expect(await previewAdminInvitation(client,oldToken,now)).toBeNull();
    expect(await previewAdminInvitation(client,result.rawToken,now)).toMatchObject({id:"new",email:"ada@example.test"});
    expect(result.rawToken).not.toBe(oldToken);
  });
});
