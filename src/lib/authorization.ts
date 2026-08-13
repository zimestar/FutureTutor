import type { Role } from "@/generated/prisma/enums";

/** Where a signed-in user of a given role lands after login / when hitting a route they can't use. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case "TUTOR":
      return "/tutor/dashboard";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin";
    case "STUDENT":
    case "PARENT":
    default:
      return "/dashboard";
  }
}

/** Section prefixes gated by role. Checked in `src/proxy.ts`; re-checked at the page/Server Action level too — middleware is a UX convenience, not the security boundary. */
export function canAccessSection(role: Role, section: "dashboard" | "tutor" | "admin"): boolean {
  switch (section) {
    case "tutor":
      return role === "TUTOR";
    case "admin":
      return role === "ADMIN" || role === "SUPER_ADMIN";
    case "dashboard":
      return role === "STUDENT" || role === "PARENT";
    default:
      return false;
  }
}
