import { Badge } from "@/components/ui/Badge"; import { Button } from "@/components/ui/Button"; import { resendInvitationAction, revokeInvitationAction } from "@/lib/actions/adminManagement";

export function PendingInvitationRow({invitationId,name,email,presetLabel,invitedOn,expiresOn,statusLabel,locale,resendLabel,revokeLabel}:{invitationId:string;name:string;email:string;presetLabel:string;invitedOn:string;expiresOn:string;statusLabel:string;locale:"en"|"fr";resendLabel:string;revokeLabel:string}){
  return <article className="flex min-w-0 flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
    <div className="min-w-0 flex-1">
      <p className="truncate font-extrabold text-navy">{name}</p>
      <p className="truncate text-sm text-text-secondary">{email}</p>
      <p className="mt-1 text-xs text-text-muted">{invitedOn} · {expiresOn}</p>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Badge variant="neutral">{presetLabel}</Badge>
      <Badge variant="blue">{statusLabel}</Badge>
    </div>
    <div className="ml-auto flex shrink-0 flex-wrap gap-2">
      <form action={resendInvitationAction.bind(null, invitationId, locale)}><Button type="submit" variant="outline" size="sm">{resendLabel}</Button></form>
      <form action={revokeInvitationAction.bind(null, invitationId)}><Button type="submit" variant="destructive" size="sm">{revokeLabel}</Button></form>
    </div>
  </article>;
}
