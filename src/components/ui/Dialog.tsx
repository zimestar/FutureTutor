"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useModalFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onClose]);

  return panelRef;
}

export function Drawer({ open, onClose, title, closeLabel, children, id, className }: { open: boolean; onClose: () => void; title: ReactNode; closeLabel: string; children: ReactNode; id?: string; className?: string }) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const panelRef = useModalFocus(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" id={id}>
      <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-navy/45 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn("absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] flex-col bg-surface shadow-pop", className)}>
        <div className="flex min-h-20 items-center justify-between border-b border-border px-5">
          <div id={titleId}>{title}</div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="flex size-11 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle hover:text-text-primary">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dialog({ open, onClose, title, description, closeLabel, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; closeLabel: string; children?: ReactNode; actions?: ReactNode }) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const panelRef = useModalFocus(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-navy/45 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="relative w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-pop">
        <button type="button" onClick={onClose} aria-label={closeLabel} className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle"><X className="size-5" aria-hidden="true" /></button>
        <h2 id={titleId} className="pr-10 text-xl font-bold text-text-primary">{title}</h2>
        {description && <p id={descriptionId} className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
        {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function ConfirmationDialog({ open, onClose, onConfirm, title, description, confirmLabel, cancelLabel, closeLabel = cancelLabel, destructive = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description: ReactNode; confirmLabel: string; cancelLabel: string; closeLabel?: string; destructive?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} closeLabel={closeLabel} actions={<><Button type="button" variant="outline" onClick={onClose}>{cancelLabel}</Button><Button type="button" variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></>} />
  );
}
