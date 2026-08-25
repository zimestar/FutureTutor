import { Badge } from "@/components/ui/Badge";
export function AdminStatusBadge({ status, label }: { status: string; label: string }) { return <Badge variant={status === "ACTIVE" ? "mint" : status === "INVITED" ? "blue" : "outline"}>{label}</Badge>; }
