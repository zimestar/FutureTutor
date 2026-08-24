"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyIframe, { type DailyCall, type DailyParticipant, type DailyParticipantsObject } from "@daily-co/daily-js";
import {
  ArrowLeft, Camera, CameraOff, CheckCircle2, Clock3, Headphones,
  LoaderCircle, Mic, MicOff, MonitorUp, PhoneOff, RefreshCw, ShieldCheck, Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getVideoClassroomStateAction, requestVideoJoinCredentialAction, type VideoJoinActionError } from "@/lib/actions/video";
import { cn } from "@/lib/utils";
import {
  controlsForVideoRole,
  formatCallDuration,
  presentConnectionState,
  type VideoConnectionState,
  type VideoEntryState,
} from "@/lib/videoClassroomPresentation";
import type { VideoParticipantRole } from "@/services/videoProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Input";
import { Logo } from "@/components/marketing/Logo";

type PermissionState = "checking" | "ready" | "partial" | "denied" | "unsupported";

export interface VideoClassroomProps {
  bookingId: string;
  initialEntryState: VideoEntryState;
  participantRole: VideoParticipantRole;
  participantName: string;
  counterpartName: string;
  subject: string;
  scheduledTime: string;
  sessionHref: string;
}

export function VideoClassroom(props: VideoClassroomProps) {
  const t = useTranslations("videoClassroom");
  const callRef = useRef<DailyCall | null>(null);
  const [entryState, setEntryState] = useState(props.initialEntryState);
  const [connection, setConnection] = useState<VideoConnectionState>("prejoin");
  const [permission, setPermission] = useState<PermissionState>(props.participantRole === "OBSERVER" ? "ready" : "checking");
  const [participants, setParticipants] = useState<DailyParticipantsObject | null>(null);
  const [microphoneOn, setMicrophoneOn] = useState(props.participantRole !== "OBSERVER");
  const [cameraOn, setCameraOn] = useState(props.participantRole !== "OBSERVER");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState("");
  const [selectedVideo, setSelectedVideo] = useState("");
  const [joinError, setJoinError] = useState<VideoJoinActionError | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [left, setLeft] = useState(false);
  const controls = controlsForVideoRole(props.participantRole);

  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (call && !call.isDestroyed()) setParticipants({ ...call.participants() });
  }, []);

  useEffect(() => {
    if (entryState !== "ready" || left) return;
    const supported = DailyIframe.supportedBrowser();
    if (!supported.supported || !navigator.mediaDevices) {
      queueMicrotask(() => {
        setPermission("unsupported");
        setMicrophoneOn(false);
        setCameraOn(false);
      });
      return;
    }

    const call = DailyIframe.createCallObject({
      allowMultipleCallInstances: true,
      strictMode: true,
      subscribeToTracksAutomatically: true,
    });
    callRef.current = call;

    const onJoined = () => { setConnection("connected"); refreshParticipants(); };
    const onLeft = () => setConnection("disconnected");
    const onParticipant = () => refreshParticipants();
    const onNetwork = (event: unknown) => {
      const state = presentConnectionState(typeof event === "object" && event && "event" in event ? String(event.event) : "");
      if (state) setConnection(state);
    };
    const onCameraError = () => {
      setPermission("partial");
      setCameraOn(false);
    };
    const onError = () => {
      setJoinError("unavailable");
      setConnection("disconnected");
    };

    call.on("joined-meeting", onJoined);
    call.on("left-meeting", onLeft);
    call.on("participant-joined", onParticipant);
    call.on("participant-updated", onParticipant);
    call.on("participant-left", onParticipant);
    call.on("network-connection", onNetwork);
    call.on("camera-error", onCameraError);
    call.on("error", onError);

    if (props.participantRole === "OBSERVER") {
      // Observer readiness is the initial state; the provider token, not a
      // client toggle, enforces the no-publish capability boundary.
    } else {
      call.startCamera({ startAudioOff: false, startVideoOff: false })
        .then(async () => {
          const { devices } = await call.enumerateDevices();
          const audio = devices.filter((device) => device.kind === "audioinput");
          const video = devices.filter((device) => device.kind === "videoinput");
          setAudioDevices(audio);
          setVideoDevices(video);
          setSelectedAudio(audio[0]?.deviceId ?? "");
          setSelectedVideo(video[0]?.deviceId ?? "");
          setPermission(audio.length && video.length ? "ready" : "partial");
          if (!audio.length) { call.setLocalAudio(false); setMicrophoneOn(false); }
          if (!video.length) { call.setLocalVideo(false); setCameraOn(false); }
          refreshParticipants();
        })
        .catch((error: unknown) => {
          const name = error instanceof DOMException ? error.name : "";
          setPermission(name === "NotAllowedError" || name === "PermissionDeniedError" ? "denied" : "partial");
          setMicrophoneOn(false);
          setCameraOn(false);
          call.setLocalAudio(false);
          call.setLocalVideo(false);
          refreshParticipants();
        });
    }

    return () => {
      callRef.current = null;
      if (!call.isDestroyed()) void call.leave().catch(() => undefined).finally(() => call.destroy());
    };
  }, [entryState, left, props.participantRole, refreshParticipants]);

  useEffect(() => {
    if (connection !== "connected") return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [connection]);

  useEffect(() => {
    if (connection !== "connected" && connection !== "reconnecting") return;
    const interval = window.setInterval(() => {
      void getVideoClassroomStateAction(props.bookingId).then((state) => {
        if (state === "cancelled" || state === "ended" || state === "unavailable") {
          const call = callRef.current;
          if (call && !call.isDestroyed()) void call.leave().catch(() => undefined);
          setEntryState(state);
        }
      });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [connection, props.bookingId]);

  const localParticipant = participants?.local;
  const remoteParticipant = useMemo(
    () => Object.values(participants ?? {}).find((participant) => !participant.local),
    [participants],
  );

  async function join() {
    const call = callRef.current;
    if (!call || call.isDestroyed()) return;
    setJoinError(null);
    setConnection("connecting");
    const result = await requestVideoJoinCredentialAction(props.bookingId);
    if (!result.success) {
      setJoinError(result.error);
      if (["tooEarly", "cancelled", "ended"].includes(result.error)) setEntryState(result.error as VideoEntryState);
      setConnection("prejoin");
      return;
    }
    const credential = result.credential;
    try {
      await call.join({
        url: credential.joinUrl,
        token: credential.token,
        userName: props.participantName,
        startAudioOff: !controls.canPublishAudio || !microphoneOn,
        startVideoOff: !controls.canPublishVideo || !cameraOn,
      });
      refreshParticipants();
    } catch {
      setJoinError("unavailable");
      setConnection("disconnected");
    }
  }

  function toggleMicrophone() {
    const call = callRef.current;
    if (!call || !controls.canPublishAudio) return;
    const next = !microphoneOn;
    call.setLocalAudio(next);
    setMicrophoneOn(next);
    refreshParticipants();
  }

  function toggleCamera() {
    const call = callRef.current;
    if (!call || !controls.canPublishVideo) return;
    const next = !cameraOn;
    call.setLocalVideo(next);
    setCameraOn(next);
    refreshParticipants();
  }

  async function changeDevice(kind: "audio" | "video", deviceId: string) {
    const call = callRef.current;
    if (!call) return;
    if (kind === "audio") {
      setSelectedAudio(deviceId);
      await call.setInputDevicesAsync({ audioDeviceId: deviceId });
    } else {
      setSelectedVideo(deviceId);
      await call.setInputDevicesAsync({ videoDeviceId: deviceId });
    }
    refreshParticipants();
  }

  async function leave() {
    setLeaveOpen(false);
    const call = callRef.current;
    if (call && !call.isDestroyed()) await call.leave().catch(() => undefined);
    setParticipants(null);
    setConnection("disconnected");
    setLeft(true);
  }

  if (left) return <PostCall href={props.sessionHref} />;
  if (entryState !== "ready") return <EntryBoundary state={entryState} scheduledTime={props.scheduledTime} href={props.sessionHref} />;

  return (
    <main className="min-h-dvh bg-navy text-white" data-testid="video-classroom" data-connection-state={connection}>
      <header className="flex min-h-18 items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <Logo variant="dark" className="h-8" />
        <div className="min-w-0 border-l border-white/15 pl-4">
          <p className="truncate text-sm font-extrabold sm:text-base">{props.subject}</p>
          <p className="truncate text-xs text-white/65">{props.scheduledTime}</p>
        </div>
        {connection !== "prejoin" && (
          <div className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold tabular-nums" aria-label={t("timer.label")}>
            <Clock3 className="size-4" aria-hidden="true" /> {formatCallDuration(elapsed)}
          </div>
        )}
      </header>

      {connection === "prejoin" ? (
        <PreJoin
          {...props}
          permission={permission}
          localParticipant={localParticipant}
          microphoneOn={microphoneOn}
          cameraOn={cameraOn}
          controls={controls}
          audioDevices={audioDevices}
          videoDevices={videoDevices}
          selectedAudio={selectedAudio}
          selectedVideo={selectedVideo}
          joinError={joinError}
          onMicrophone={toggleMicrophone}
          onCamera={toggleCamera}
          onAudioDevice={(value) => void changeDevice("audio", value)}
          onVideoDevice={(value) => void changeDevice("video", value)}
          onJoin={() => void join()}
        />
      ) : (
        <ConnectedClassroom
          counterpartName={props.counterpartName}
          role={props.participantRole}
          connection={connection}
          remoteParticipant={remoteParticipant}
          localParticipant={localParticipant}
          microphoneOn={microphoneOn}
          cameraOn={cameraOn}
          canPublishAudio={controls.canPublishAudio}
          canPublishVideo={controls.canPublishVideo}
          joinError={joinError}
          onMicrophone={toggleMicrophone}
          onCamera={toggleCamera}
          onLeave={() => setLeaveOpen(true)}
          onRetry={() => void join()}
        />
      )}

      <ConfirmationDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => void leave()}
        title={t("leave.title")}
        description={t("leave.description")}
        cancelLabel={t("leave.stay")}
        confirmLabel={t("leave.confirm")}
        destructive
      />
    </main>
  );
}

function PreJoin({
  participantRole, participantName, counterpartName, subject, scheduledTime, permission, localParticipant,
  microphoneOn, cameraOn, controls, audioDevices, videoDevices, selectedAudio, selectedVideo, joinError,
  onMicrophone, onCamera, onAudioDevice, onVideoDevice, onJoin, sessionHref,
}: VideoClassroomProps & {
  permission: PermissionState; localParticipant?: DailyParticipant; microphoneOn: boolean; cameraOn: boolean;
  controls: ReturnType<typeof controlsForVideoRole>; audioDevices: MediaDeviceInfo[]; videoDevices: MediaDeviceInfo[];
  selectedAudio: string; selectedVideo: string; joinError: VideoJoinActionError | null;
  onMicrophone: () => void; onCamera: () => void; onAudioDevice: (value: string) => void;
  onVideoDevice: (value: string) => void; onJoin: () => void;
}) {
  const t = useTranslations("videoClassroom");
  const observer = participantRole === "OBSERVER";
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:py-10" data-testid="video-prejoin">
      <section className="relative min-h-[19rem] overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-pop sm:min-h-[28rem]">
        {observer ? (
          <div className="flex h-full min-h-[19rem] flex-col items-center justify-center px-6 text-center sm:min-h-[28rem]">
            <ShieldCheck className="size-12 text-mint" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-extrabold">{t("observer.title")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/70">{t("observer.description")}</p>
          </div>
        ) : (
          <VideoTile participant={localParticipant} cameraOn={cameraOn} label={participantName} muted local waitingLabel={t("prejoin.previewUnavailable")} />
        )}
        {!observer && <div className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold backdrop-blur">{t("prejoin.you")}</div>}
      </section>

      <section className="rounded-2xl bg-white p-5 text-navy shadow-pop sm:p-7">
        <Link href={sessionHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue hover:text-blue-hover">
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("actions.back")}
        </Link>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-blue">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{t("prejoin.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{t("prejoin.description", { name: counterpartName })}</p>
        <div className="mt-5 rounded-xl border border-border bg-surface-subtle p-4">
          <p className="font-extrabold">{subject}</p>
          <p className="mt-1 text-sm text-text-secondary">{scheduledTime}</p>
        </div>

        {!observer && (
          <>
            <PermissionNotice permission={permission} />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <ControlButton icon={microphoneOn ? Mic : MicOff} active={microphoneOn} label={microphoneOn ? t("controls.micOn") : t("controls.micOff")} onClick={onMicrophone} />
              <ControlButton icon={cameraOn ? Camera : CameraOff} active={cameraOn} label={cameraOn ? t("controls.cameraOn") : t("controls.cameraOff")} onClick={onCamera} />
            </div>
            <div className="mt-5 space-y-4">
              <DeviceSelect label={t("devices.microphone")} value={selectedAudio} devices={audioDevices} onChange={onAudioDevice} emptyLabel={t("devices.noneMicrophone")} />
              <DeviceSelect label={t("devices.camera")} value={selectedVideo} devices={videoDevices} onChange={onVideoDevice} emptyLabel={t("devices.noneCamera")} />
            </div>
          </>
        )}

        {joinError && <SafeError error={joinError} />}
        <Button type="button" size="lg" className="mt-6 w-full" onClick={onJoin} disabled={permission === "checking"} data-testid="join-video-session">
          {permission === "checking" ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <MonitorUp className="size-5" aria-hidden="true" />}
          {observer ? t("actions.joinObserver") : t("actions.join")}
        </Button>
        {!controls.canPublishAudio && !controls.canPublishVideo && <p className="mt-3 text-center text-xs text-text-muted">{t("observer.controlsNote")}</p>}
      </section>
    </div>
  );
}

function ConnectedClassroom({ counterpartName, role, connection, remoteParticipant, localParticipant, microphoneOn, cameraOn, canPublishAudio, canPublishVideo, joinError, onMicrophone, onCamera, onLeave, onRetry }: {
  counterpartName: string; role: VideoParticipantRole; connection: VideoConnectionState;
  remoteParticipant?: DailyParticipant; localParticipant?: DailyParticipant; microphoneOn: boolean; cameraOn: boolean;
  canPublishAudio: boolean; canPublishVideo: boolean; joinError: VideoJoinActionError | null;
  onMicrophone: () => void; onCamera: () => void; onLeave: () => void; onRetry: () => void;
}) {
  const t = useTranslations("videoClassroom");
  const observer = role === "OBSERVER";
  return (
    <div className="relative flex min-h-[calc(100dvh-4.5rem)] flex-col p-3 sm:p-5">
      <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900" aria-label={t("classroom.videoRegion")}>
        {remoteParticipant ? (
          <VideoTile participant={remoteParticipant} cameraOn={remoteParticipant.video} label={remoteParticipant.user_name || counterpartName} waitingLabel={t("classroom.cameraOff")} />
        ) : (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-5 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-white/10"><Users className="size-7 text-mint" aria-hidden="true" /></div>
            <h1 className="mt-5 text-xl font-extrabold sm:text-2xl">{t("classroom.waiting", { name: counterpartName })}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/65">{t("classroom.waitingDescription")}</p>
          </div>
        )}
        {remoteParticipant && <RemoteAudio participant={remoteParticipant} />}

        {!observer && (
          <div className="absolute bottom-4 right-4 h-28 w-36 overflow-hidden rounded-xl border-2 border-white/25 bg-neutral-800 shadow-pop sm:h-40 sm:w-56" data-testid="local-video-tile">
            <VideoTile participant={localParticipant} cameraOn={cameraOn} label={t("prejoin.you")} muted local waitingLabel={t("classroom.cameraOff")} />
          </div>
        )}
        {observer && <div className="absolute left-4 top-4 rounded-full bg-mint px-3 py-1.5 text-xs font-extrabold text-navy"><ShieldCheck className="mr-1 inline size-4" aria-hidden="true" />{t("observer.title")}</div>}
        {(connection === "connecting" || connection === "reconnecting") && (
          <div className="absolute inset-x-4 top-4 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold backdrop-blur" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> {t(`connection.${connection}`)}
          </div>
        )}
        {connection === "disconnected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy/90 p-5 text-center">
            <div className="max-w-md"><RefreshCw className="mx-auto size-10 text-mint" aria-hidden="true" /><h2 className="mt-4 text-xl font-extrabold">{t("connection.failedTitle")}</h2><p className="mt-2 text-sm leading-6 text-white/70">{t("connection.failedDescription")}</p><Button className="mt-5" onClick={onRetry}><RefreshCw className="size-4" aria-hidden="true" />{t("actions.retry")}</Button></div>
          </div>
        )}
      </section>

      {joinError && connection !== "disconnected" && <SafeError error={joinError} inverse />}
      <nav className="mx-auto mt-3 flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-3 py-2 backdrop-blur sm:mt-4 sm:px-5" aria-label={t("controls.label")}>
        {canPublishAudio && <RoundControl icon={microphoneOn ? Mic : MicOff} active={microphoneOn} label={microphoneOn ? t("controls.mute") : t("controls.unmute")} onClick={onMicrophone} />}
        {canPublishVideo && <RoundControl icon={cameraOn ? Camera : CameraOff} active={cameraOn} label={cameraOn ? t("controls.stopCamera") : t("controls.startCamera")} onClick={onCamera} />}
        {observer && <span className="px-2 text-center text-xs font-bold text-white/65"><ShieldCheck className="mx-auto mb-1 size-5 text-mint" aria-hidden="true" />{t("observer.controlsNote")}</span>}
        <button type="button" onClick={onLeave} className="flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-extrabold text-white transition hover:bg-destructive-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={t("controls.leave")}>
          <PhoneOff className="size-5" aria-hidden="true" /><span className="hidden sm:inline">{t("controls.leave")}</span>
        </button>
      </nav>
    </div>
  );
}

function VideoTile({ participant, cameraOn, label, muted = false, local = false, waitingLabel }: { participant?: DailyParticipant; cameraOn: boolean; label: string; muted?: boolean; local?: boolean; waitingLabel: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const track = participant?.tracks.video.persistentTrack;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = track ? new MediaStream([track]) : null;
    return () => { video.srcObject = null; };
  }, [track]);
  return (
    <div className="relative h-full min-h-full w-full bg-neutral-900">
      {cameraOn && track ? <video ref={videoRef} autoPlay playsInline muted={muted} className={cn("h-full w-full object-cover", local && "-scale-x-100")} /> : <div className="flex h-full min-h-[inherit] flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.16),_transparent_55%)] p-5 text-center"><div className="flex size-16 items-center justify-center rounded-full bg-white/10 text-xl font-extrabold">{label.trim().charAt(0).toUpperCase()}</div><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-white/55">{waitingLabel}</p></div>}
    </div>
  );
}

function RemoteAudio({ participant }: { participant: DailyParticipant }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = participant.tracks.audio.persistentTrack;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = track ? new MediaStream([track]) : null;
    return () => { audio.srcObject = null; };
  }, [track]);
  return <audio ref={audioRef} autoPlay playsInline />;
}

function ControlButton({ icon: Icon, active, label, onClick }: { icon: typeof Mic; active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue", active ? "border-blue/25 bg-blue/10 text-blue" : "border-border bg-surface text-text-secondary")}><Icon className="size-5" aria-hidden="true" />{label}</button>;
}

function RoundControl({ icon: Icon, active, label, onClick }: { icon: typeof Mic; active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label} className={cn("flex size-12 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white", active ? "bg-white text-navy hover:bg-neutral-100" : "bg-white/12 text-white hover:bg-white/20")}><Icon className="size-5" aria-hidden="true" /></button>;
}

function DeviceSelect({ label, value, devices, onChange, emptyLabel }: { label: string; value: string; devices: MediaDeviceInfo[]; onChange: (value: string) => void; emptyLabel: string }) {
  return <label className="block text-sm font-bold text-text-primary"><span className="mb-1.5 flex items-center gap-2"><Headphones className="size-4 text-blue" aria-hidden="true" />{label}</span><Select value={value} onChange={(event) => onChange(event.target.value)} disabled={!devices.length} className="min-h-11 h-11 text-sm font-medium disabled:text-text-muted">{!devices.length && <option value="">{emptyLabel}</option>}{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</Select></label>;
}

function PermissionNotice({ permission }: { permission: PermissionState }) {
  const t = useTranslations("videoClassroom");
  if (permission === "ready") return <p className="mt-5 flex items-start gap-2 rounded-lg bg-mint/20 p-3 text-sm font-semibold text-navy"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t("permissions.ready")}</p>;
  if (permission === "checking") return <p className="mt-5 flex items-center gap-2 text-sm text-text-secondary" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("permissions.checking")}</p>;
  return <p className="mt-5 rounded-lg bg-warning/10 p-3 text-sm leading-6 text-text-secondary">{t(`permissions.${permission}`)}</p>;
}

function SafeError({ error, inverse = false }: { error: VideoJoinActionError; inverse?: boolean }) {
  const t = useTranslations("videoClassroom");
  return <p role="alert" className={cn("mt-4 rounded-lg p-3 text-sm font-semibold", inverse ? "bg-white/10 text-white" : "bg-destructive/10 text-destructive")}>{t(`errors.${error}`)}</p>;
}

function EntryBoundary({ state, scheduledTime, href }: { state: Exclude<VideoEntryState, "ready">; scheduledTime: string; href: string }) {
  const t = useTranslations("videoClassroom");
  return <main className="flex min-h-dvh items-center justify-center bg-canvas p-5"><section className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 text-center shadow-pop sm:p-9"><Logo className="mx-auto h-9" /><Clock3 className="mx-auto mt-8 size-10 text-blue" aria-hidden="true" /><p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-blue">{t(`entry.${state}.label`)}</p><h1 className="mt-2 text-2xl font-extrabold text-navy">{t(`entry.${state}.title`)}</h1><p className="mt-3 text-sm leading-6 text-text-secondary">{t(`entry.${state}.description`, { time: scheduledTime })}</p><Button href={href} variant="outline" className="mt-7 w-full sm:w-auto"><ArrowLeft className="size-4" aria-hidden="true" />{t("actions.back")}</Button></section></main>;
}

function PostCall({ href }: { href: string }) {
  const t = useTranslations("videoClassroom");
  return <main className="flex min-h-dvh items-center justify-center bg-canvas p-5"><section className="w-full max-w-xl rounded-2xl border border-border bg-surface p-7 text-center shadow-pop"><CheckCircle2 className="mx-auto size-12 text-mint-dark" aria-hidden="true" /><h1 className="mt-5 text-2xl font-extrabold text-navy">{t("postCall.title")}</h1><p className="mt-3 text-sm leading-6 text-text-secondary">{t("postCall.description")}</p><p className="mt-3 text-xs font-semibold text-text-muted">{t("postCall.authorityNote")}</p><Button href={href} className="mt-7 w-full sm:w-auto">{t("postCall.return")}</Button></section></main>;
}
