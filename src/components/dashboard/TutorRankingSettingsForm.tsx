"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTutorRankingSettingsAction } from "@/lib/actions/quickMatchAdmin";

export interface TutorRankingSettingsValues {
  responseWindowMinutes: number;
  sequentialInvitationCount: number;
  parallelBatchSize: number;
  maxDispatchAttempts: number;
  tutorScoreWeight: number;
  bookingReliabilityWeight: number;
  invitationResponsivenessWeight: number;
  tutorTierWeight: number;
  minInvitationsForReliabilityData: number;
  rankingVersion: string;
}

const NUMBER_FIELDS: { name: keyof TutorRankingSettingsValues; label: string; step?: string }[] = [
  { name: "responseWindowMinutes", label: "Response window (minutes)" },
  { name: "sequentialInvitationCount", label: "Sequential invitations" },
  { name: "parallelBatchSize", label: "Parallel batch size" },
  { name: "maxDispatchAttempts", label: "Max dispatch attempts" },
  { name: "tutorScoreWeight", label: "Tutor Score weight", step: "0.01" },
  { name: "bookingReliabilityWeight", label: "Booking reliability weight", step: "0.01" },
  { name: "invitationResponsivenessWeight", label: "Invitation responsiveness weight", step: "0.01" },
  { name: "tutorTierWeight", label: "Tutor tier weight", step: "0.01" },
  { name: "minInvitationsForReliabilityData", label: "Min invitations for reliability data" },
];

export function TutorRankingSettingsForm({ values }: { values: TutorRankingSettingsValues }) {
  const [state, formAction, pending] = useActionState(saveTutorRankingSettingsAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">Saved.</p>}
      {NUMBER_FIELDS.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-xs font-semibold text-slate">
            {field.label}
          </label>
          <Input
            id={field.name}
            name={field.name}
            type="number"
            step={field.step}
            defaultValue={values[field.name]}
            required
          />
        </div>
      ))}
      <div>
        <label htmlFor="rankingVersion" className="mb-1 block text-xs font-semibold text-slate">
          Ranking version
        </label>
        <Input id="rankingVersion" name="rankingVersion" defaultValue={values.rankingVersion} required />
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-3">
        Save settings
      </Button>
    </form>
  );
}
