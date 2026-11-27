"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Input";
import { CANADIAN_PROVINCES_AND_TERRITORIES, isCanadianProvinceCode } from "@/lib/canadianProvinces";

/**
 * DESIGN-SYSTEM2 — province picker for profile forms, built on the canonical
 * list the signup form already uses. Values stay the 2-letter codes already
 * stored. A legacy free-text value is kept as an extra option so opening and
 * saving a profile never silently erases it.
 */
export function ProvinceSelect({
  id = "province",
  name = "province",
  defaultValue,
  required = false,
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const t = useTranslations("provinces");
  const tForm = useTranslations("auth.signup");
  const current = defaultValue?.trim() ?? "";
  const legacy = current !== "" && !isCanadianProvinceCode(current) ? current : null;

  return (
    <Select id={id} name={name} defaultValue={current} required={required}>
      <option value="" disabled={required}>
        {tForm("provincePlaceholder")}
      </option>
      {legacy && <option value={legacy}>{legacy}</option>}
      {CANADIAN_PROVINCES_AND_TERRITORIES.map((code) => (
        <option key={code} value={code}>
          {t(code)}
        </option>
      ))}
    </Select>
  );
}

export function useProvinceLabel() {
  const t = useTranslations("provinces");
  return (value: string | null | undefined) => (value && isCanadianProvinceCode(value) ? t(value) : value ?? "");
}
