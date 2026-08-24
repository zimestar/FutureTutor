"use client";

import { useActionState, useEffect, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { updateTutorProfileImageAction } from "@/lib/actions/tutorProfileImage";

export function TutorProfileImageForm({ name, image }: { name: string; image?: string | null }) {
  const t = useTranslations("tutorProfileForm.photo");
  const [state, action, pending] = useActionState(updateTutorProfileImageAction, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <form action={action} className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center" encType="multipart/form-data">
      <Avatar name={name} src={preview ?? image ?? undefined} size={112} className="ring-4 ring-blue/10" />
      <div className="min-w-0 flex-1">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-bold text-text-primary hover:bg-surface-subtle focus-within:outline-2 focus-within:outline-blue">
          <Camera className="size-4" aria-hidden="true" /> {t("change")}
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" required onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview((current) => { if (current) URL.revokeObjectURL(current); return file ? URL.createObjectURL(file) : null; });
          }} />
        </label>
        <p className="mt-2 text-xs text-text-muted">{t("hint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="upload" size="sm" disabled={pending || !preview}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}{pending ? t("uploading") : t("upload")}</Button>
          {image && <Button type="submit" name="intent" value="remove" variant="outline" size="sm" disabled={pending} formNoValidate><Trash2 className="size-4" aria-hidden="true" />{t("remove")}</Button>}
        </div>
        {state?.error && <p role="alert" className="mt-3 text-sm font-semibold text-error">{state.error}</p>}
        {state?.success && <p role="status" className="mt-3 text-sm font-semibold text-success">{t(state.success)}</p>}
      </div>
    </form>
  );
}
