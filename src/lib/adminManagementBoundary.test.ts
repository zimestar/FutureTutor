import { readFileSync } from "node:fs"; import { describe,expect,it } from "vitest";
describe("Admin Management boundaries",()=>{it("keeps invitation and permission services server-only",()=>{for(const f of ["src/services/adminInvitation.ts","src/services/adminPermissions.ts","src/lib/email/adminInvitationEmail.ts"])expect(readFileSync(f,"utf8")).toContain('import "server-only"')});it("never logs raw invitation URLs or tokens",()=>expect(readFileSync("src/lib/email/adminInvitationEmail.ts","utf8")).not.toContain("console."));it("protects management pages with SUPER_ADMIN server gates",()=>{for(const f of ["src/app/[locale]/admin/admins/page.tsx","src/app/[locale]/admin/admins/new/page.tsx","src/app/[locale]/admin/admins/[adminId]/page.tsx"])expect(readFileSync(f,"utf8")).toMatch(/role\s*!==\s*"SUPER_ADMIN"/)});it("does not import protected financial or video services",()=>{const files=["src/services/adminInvitation.ts","src/services/adminPermissions.ts","src/lib/actions/adminManagement.ts"].map(f=>readFileSync(f,"utf8")).join("\n");expect(files).not.toMatch(/stripe|PaymentIntent|TutorEarning|Daily|videoSession|pricingAdmin/i)})});

describe("Admin permission enforcement boundaries",()=>{
  it("keeps invitation activation public while Admin surfaces remain protected",()=>{const proxy=readFileSync("src/proxy.ts","utf8");expect(proxy).toContain('startsWithSegment(pathname, "/admin/setup")');expect(proxy.indexOf('startsWithSegment(pathname, "/admin/setup")')).toBeLessThan(proxy.indexOf('startsWithSegment(pathname, "/admin")) return "admin"'))});
  it("server-guards every Admin read domain",()=>{for(const [folder,permission] of Object.entries({tutors:"ADMIN_TUTORS_READ",students:"ADMIN_STUDENTS_READ",bookings:"ADMIN_BOOKINGS_READ",sessions:"ADMIN_SESSIONS_READ",users:"ADMIN_USERS_READ","quick-match":"ADMIN_QUICKMATCH_READ",family:"ADMIN_GUARDIANS_READ",pricing:"ADMIN_PRICING_READ",payments:"ADMIN_PAYMENTS_READ",admins:"ADMIN_ADMINS_VIEW"}))expect(readFileSync(`src/app/[locale]/admin/${folder}/layout.tsx`,"utf8")).toContain(permission)});
  it("guards sensitive mutation entry points by permission",()=>{expect(readFileSync("src/lib/actions/pricingAdmin.ts","utf8")).toContain("ADMIN_PRICING_MANAGE");expect(readFileSync("src/lib/actions/quickMatchAdmin.ts","utf8")).toContain("ADMIN_QUICKMATCH_MANAGE");const tutor=["adminTutorReview","tutorDocuments","tutorEducation","tutorExam","tutorInterview","tutorTraining"].map(f=>readFileSync(`src/lib/actions/${f}.ts`,"utf8")).join("\n");expect(tutor).toContain("requireAdminPermission");});
  it("does not grant ordinary Admins a financial mutation permission",()=>{const schema=readFileSync("prisma/schema.prisma","utf8");expect(schema).not.toMatch(/ADMIN_(PAYMENTS|REFUNDS|TRANSFERS)_(WRITE|MANAGE)/);expect(readFileSync("src/lib/actions/paymentsAdmin.ts","utf8")).toContain('role !== "SUPER_ADMIN"')});
});

describe("Admin invitation URL origin", () => {
  const source = readFileSync("src/lib/actions/adminManagement.ts", "utf8");

  it("builds both the initial and resent invitation URL from the real request origin, not an env var fallback", () => {
    expect(source).toContain('import { getAppBaseUrl } from "@/lib/appUrl"');
    // Both call sites use the same helper -- appears once per action, twice total.
    expect(source.match(/await getAppBaseUrl\(\)/g)?.length).toBe(2);
  });

  it("no longer depends on AUTH_URL/NEXTAUTH_URL or a localhost fallback for invitation links", () => {
    expect(source).not.toContain("process.env.AUTH_URL");
    expect(source).not.toContain("process.env.NEXTAUTH_URL");
    expect(source).not.toContain("localhost:3000");
  });

  it("preserves the requested locale and setup route path in both invitation URLs", () => {
    const setupUrlTemplates = source.match(/`\$\{origin\}\/\$\{locale\}\/admin\/setup\/\$\{rawToken\}`/g) ?? [];
    expect(setupUrlTemplates.length).toBe(2);
  });

  it("still never logs a raw invitation token or URL", () => {
    expect(source).not.toMatch(/console\.(log|error|warn|info)\([^)]*rawToken/);
    expect(source).not.toMatch(/console\.(log|error|warn|info)\([^)]*setupUrl/);
  });
});
