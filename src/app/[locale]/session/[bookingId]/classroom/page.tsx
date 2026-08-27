import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { VideoClassroom } from "@/components/video/VideoClassroom";
import { deriveVideoEntryState } from "@/lib/videoClassroomPresentation";
import { getSessionContext, SessionNotFoundError, SessionViewerNotAuthorizedError } from "@/services/sessionLifecycle";
import { VIDEO_ACCESS_GRACE_MS_AFTER_END } from "@/services/videoSession";
import type { VideoParticipantRole } from "@/services/videoProvider";

export default async function ClassroomPage({ params }: { params: Promise<{ locale: string; bookingId: string }> }) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect({ href: `/login?callbackUrl=/${locale}/session/${bookingId}/classroom`, locale });
    return;
  }

  if (!["STUDENT", "TUTOR", "PARENT"].includes(session.user.role)) {
    redirect({ href: `/session/${bookingId}`, locale });
    return;
  }

  const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, name: true } });
  if (!freshUser) {
    redirect({ href: `/session/${bookingId}`, locale });
    return;
  }

  let context;
  try {
    context = await getSessionContext(bookingId, session.user.id, freshUser.role);
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof SessionViewerNotAuthorizedError) {
      redirect({ href: `/session/${bookingId}`, locale });
      return;
    }
    throw error;
  }

  const role: VideoParticipantRole | null = context.viewerRole === "TUTOR_OWNER"
    ? "TUTOR"
    : context.viewerRole === "GUARDIAN"
      ? "OBSERVER"
      : context.viewerRole === "SELF_MANAGED_STUDENT" || context.viewerRole === "GUARDIAN_MANAGED_STUDENT_SELF"
        ? "STUDENT"
        : null;
  if (!role) {
    redirect({ href: `/session/${bookingId}`, locale });
    return;
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { tutorProfile: { select: { user: { select: { name: true } } } } },
  });
  if (!booking) {
    redirect({ href: `/session/${bookingId}`, locale });
    return;
  }

  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const participantName = freshUser.name?.trim() || (role === "STUDENT" ? context.representedLearner.firstName : role === "OBSERVER" ? context.representedLearner.firstName : "Tutor");
  const tutorName = booking.tutorProfile.user.name?.trim() || "Tutor";
  const studentName = context.representedLearner.firstName;
  const counterpartName = role === "TUTOR" || role === "OBSERVER" ? studentName : tutorName;
  const scheduledTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.timezone,
  }).format(context.scheduledStartAt);

  return (
    <VideoClassroom
      bookingId={bookingId}
      initialEntryState={deriveVideoEntryState({
        mode: context.mode,
        status: context.status,
        now: new Date(),
        opensAt: context.checkInWindowOpensAt,
        closesAt: new Date(context.scheduledEndAt.getTime() + VIDEO_ACCESS_GRACE_MS_AFTER_END),
      })}
      participantRole={role}
      participantName={participantName}
      counterpartName={counterpartName}
      tutorName={tutorName}
      studentName={studentName}
      subject={tSubjects(context.subjectSlug)}
      scheduledTime={scheduledTime}
      scheduledEndAtIso={context.scheduledEndAt.toISOString()}
      sessionHref={`/session/${bookingId}`}
    />
  );
}
