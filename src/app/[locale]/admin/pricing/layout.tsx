import type { ReactNode } from "react"; import { auth } from "@/lib/auth"; import { requireAdminPermission } from "@/services/adminPermissions";
export default async function Layout({children}:{children:ReactNode}) { await requireAdminPermission(await auth(), "ADMIN_PRICING_READ"); return children; }
