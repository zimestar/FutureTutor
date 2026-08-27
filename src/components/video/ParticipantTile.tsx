"use client";

import { useEffect, useRef } from "react";
import type { DailyParticipant } from "@daily-co/daily-js";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** VIDEO-2A — the one reusable video/avatar tile used for every camera
 * surface (grid slots, PiP corner, share-mode rail). Renders the live
 * camera track when available, or a named avatar placeholder when the
 * camera is off/absent — camera state is never communicated by color alone
 * (an explicit `cameraOffLabel` string is always rendered alongside it). */
export function ParticipantTile({
  participant,
  cameraOn,
  name,
  roleLabel,
  cameraOffLabel,
  muted = false,
  local = false,
  compact = false,
}: {
  participant?: DailyParticipant;
  cameraOn: boolean;
  name: string;
  roleLabel?: string;
  cameraOffLabel: string;
  muted?: boolean;
  local?: boolean;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const track = participant?.tracks.video.persistentTrack;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = track ? new MediaStream([track]) : null;
    return () => {
      video.srcObject = null;
    };
  }, [track]);

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const showVideo = cameraOn && Boolean(track);
  // VIDEO-2A.1 — a name that happens to equal its role label (e.g. a QA/demo
  // account with no display name set, falling back to the literal string
  // "Tutor") would otherwise render a redundant "Tutor • Tutor" badge.
  const showRoleLabel = Boolean(roleLabel) && roleLabel !== name;

  return (
    <div className="relative h-full min-h-full w-full overflow-hidden bg-neutral-900" data-testid={local ? "local-participant-tile" : "remote-participant-tile"}>
      {showVideo ? (
        // VIDEO-2A.1 — object-contain (not object-cover): human QA reported
        // faces being aggressively zoomed/cropped when a tile's container
        // aspect ratio didn't match the camera's native feed. contain never
        // crops a face; the trade-off (occasional letterboxing) is
        // acceptable against the dark tile background.
        <video ref={videoRef} autoPlay playsInline muted={muted} className={cn("h-full w-full object-contain", local && "-scale-x-100")} />
      ) : (
        <div className="flex h-full min-h-[inherit] flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.16),_transparent_55%)] p-4 text-center">
          <div className={cn("flex items-center justify-center rounded-full bg-white/10 font-extrabold", compact ? "size-9 text-xs" : "size-16 text-xl")} aria-hidden="true">
            {initial}
          </div>
          {!compact && <p className="mt-3 text-sm font-bold">{name}</p>}
          {!compact && showRoleLabel && <p className="text-[11px] font-semibold text-white/55">{roleLabel}</p>}
          <p className={cn("text-white/55", compact ? "mt-1 text-[10px]" : "mt-1 text-xs")}>{cameraOffLabel}</p>
        </div>
      )}
      <div
        className={cn(
          "pointer-events-none absolute left-2 rounded-full bg-black/60 font-bold text-white backdrop-blur",
          compact ? "bottom-1.5 px-2 py-0.5 text-[10px]" : "bottom-2.5 px-2.5 py-1 text-xs"
        )}
      >
        {name}
        {showRoleLabel && !compact ? ` • ${roleLabel}` : ""}
      </div>
    </div>
  );
}

/** VIDEO-2A — an empty grid/rail slot for a role that hasn't connected yet,
 * distinct from "connected but camera off" (ParticipantTile above). */
export function WaitingSlotTile({ label, description, compact = false }: { label: string; description?: string; compact?: boolean }) {
  return (
    <div className="flex h-full min-h-full w-full flex-col items-center justify-center bg-neutral-900/60 p-4 text-center" data-testid="waiting-participant-tile">
      <div className={cn("flex items-center justify-center rounded-full bg-white/8", compact ? "size-8" : "size-14")}>
        <Users className={cn("text-white/40", compact ? "size-4" : "size-6")} aria-hidden="true" />
      </div>
      <p className={cn("mt-2 font-bold text-white/70", compact ? "text-[10px]" : "text-sm")}>{label}</p>
      {!compact && description && <p className="mt-1 max-w-[16rem] text-xs leading-5 text-white/45">{description}</p>}
    </div>
  );
}
