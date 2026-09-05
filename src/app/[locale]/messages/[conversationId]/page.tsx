import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { homePathForRole } from "@/lib/authorization";
import { MessageThread } from "@/components/dashboard/MessageThread";
import {
  getConversationParties,
  getConversationSessionContext,
  listConversationMessages,
  markConversationRead,
} from "@/services/messaging";
import { canSendConversationMessage } from "@/services/messagingAuthorization";
import { toMessageDto, toSessionContextDto } from "@/lib/messagingPresentation";

/**
 * MESSAGING-MVP1B — /messages/[conversationId]. An unauthorized OR
 * nonexistent conversation both render the app's own notFound() page —
 * getConversationParties returns null identically for both cases (see
 * messagingAuthorization.ts's own "no distinguishable response" design),
 * so there is no code path here that could leak which one occurred.
 */
export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    redirect({ href: homePathForRole(user.role), locale });
    return;
  }

  const parties = await getConversationParties(user.id, conversationId);
  if (!parties) notFound();

  const t = await getTranslations({ locale, namespace: "messaging" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });

  let navItems;
  if (user.role === "TUTOR") {
    const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id }, select: { applicationStatus: true } });
    navItems = tutorNavItems(tNav, tutorProfile?.applicationStatus ?? "DRAFT");
  } else {
    navItems = getStudentDashboardNavItems(tNav, user.role as "STUDENT" | "PARENT");
  }

  const [messagesResult, sessionContext, sendEligibility] = await Promise.all([
    listConversationMessages(user.id, conversationId),
    getConversationSessionContext(user.id, conversationId),
    canSendConversationMessage(db, user.id, conversationId),
  ]);

  // Opening the thread marks it read — best-effort, never blocks render.
  await markConversationRead(user.id, conversationId).catch(() => {});

  const initialMessages = messagesResult.ok ? messagesResult.page.items.map(toMessageDto).reverse() : [];
  const initialCursor = messagesResult.ok ? messagesResult.page.nextCursor : null;

  const threadTitle =
    user.role === "TUTOR"
      ? parties.studentFirstName
      : user.role === "PARENT"
        ? t("thread.guardianTitle", { student: parties.studentFirstName, tutor: parties.tutorFirstName })
        : parties.tutorFirstName;

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""} userImage={user.image}>
      <MessageThread
        conversationId={conversationId}
        title={threadTitle}
        initialMessages={initialMessages}
        initialCursor={initialCursor}
        ownUserId={user.id}
        participantNames={parties.names}
        sessionContext={sessionContext ? toSessionContextDto(sessionContext) : null}
        subjectLabel={sessionContext?.subjectSlug ? tSubjects(sessionContext.subjectSlug) : null}
        canSend={sendEligibility.ok}
        sendBlockedReason={sendEligibility.ok ? null : (sendEligibility.reason ?? "NOT_AUTHORIZED")}
        locale={locale}
      />
    </DashboardShell>
  );
}
