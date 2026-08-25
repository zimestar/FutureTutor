import { Avatar } from "@/components/ui/Avatar"; import { Badge } from "@/components/ui/Badge"; import { Button } from "@/components/ui/Button";

export function ActiveAdminRow({id,name,email,image,presetLabel,isSuperAdmin,isSuspended,isYou,lastActivity,statusLabel,viewLabel,youLabel}:{id:string;name:string;email:string;image?:string|null;presetLabel:string;isSuperAdmin:boolean;isSuspended:boolean;isYou:boolean;lastActivity:string;statusLabel:string;viewLabel:string;youLabel:string}){
  return <article className="flex min-w-0 flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
    <Avatar name={name} src={image ?? undefined} size={44} className="shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate font-extrabold text-navy">{name}</p>
        {isYou && <Badge variant="outline">{youLabel}</Badge>}
      </div>
      <p className="truncate text-sm text-text-secondary">{email}</p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {isSuperAdmin ? <Badge variant="navy">{presetLabel}</Badge> : <Badge variant="neutral">{presetLabel}</Badge>}
      <Badge variant={isSuspended ? "outline" : "mint"}>{statusLabel}</Badge>
    </div>
    <p className="hidden shrink-0 text-xs text-text-muted md:block">{lastActivity}</p>
    <Button href={`/admin/admins/${id}`} variant="outline" size="sm" className="ml-auto shrink-0">{viewLabel}</Button>
  </article>;
}
