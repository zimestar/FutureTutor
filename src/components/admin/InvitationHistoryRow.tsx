import { Badge } from "@/components/ui/Badge";

export function InvitationHistoryRow({name,email,presetLabel,statusLabel,date}:{name:string;email:string;presetLabel:string;statusLabel:string;date:string}){
  return <article className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-surface-subtle px-4 py-2.5 text-sm text-text-muted opacity-75">
    <div className="min-w-0 flex-1">
      <span className="truncate font-semibold">{name}</span>{" "}<span className="truncate">{email}</span>
    </div>
    <Badge variant="outline">{presetLabel}</Badge>
    <Badge variant="outline">{statusLabel}</Badge>
    <span className="shrink-0 text-xs">{date}</span>
  </article>;
}
