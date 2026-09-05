import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/Feedback";
import { ConversationListItem } from "@/components/dashboard/ConversationListItem";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { tutorNavItems } from "@/lib/tutorNav";
import { homePathForRole } from "@/lib/authorization";
import { listMyConversations } from "@/services/messaging";
import { toConversationSummaryDto } from "@/lib/messagingPresentation";

/**
 * MESSAGING-MVP1B — /messages, shared by every supported role (SELF_MANAGED
 * student, guardian, approved tutor) rather than three separate
 * implementations, mirroring /notifications' own established pattern.
 * ADMIN/SUPER_ADMIN are structurally never messaging participants and are
 * redirected to their own home — a cheap role check, no extra query.
 *
 * A GUARDIAN_MANAGED student's own restricted login (role STUDENT) is not
 * specially detected here (that would require an extra DB lookup this
 * page's nav-resolution layer doesn't otherwise need) — listMyConversations
 * itself structurally returns zero conversations for that account (see
 * messagingAuthorization.ts), so the page correctly renders the same
 * honest empty state rather than any misleading access.
 */
export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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

  const conversations = (await listMyConversations(user.id)).map(toConversationSummaryDto);

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""} userImage={user.image}>
      <PageHeader title={t("list.title")} description={t("list.description")} />

      {conversations.length === 0 ? (
        <EmptyState className="mt-8" title={t("list.emptyTitle")} description={t("list.emptyDescription")} />
      ) : (
        <ul className="mt-8 flex flex-col gap-2" data-testid="conversation-list">
          {conversations.map((conversation) => {
            const primaryLabel =
              user.role === "TUTOR"
                ? conversation.studentFirstName
                : user.role === "PARENT"
                  ? t("list.guardianTitle", { student: conversation.studentFirstName, tutor: conversation.tutorFirstName })
                  : conversation.tutorFirstName;
            const secondaryLabel =
              user.role === "TUTOR" && conversation.guardianFirstNames.length > 0
                ? t("list.guardianContext", { names: conversation.guardianFirstNames.join(", ") })
                : null;

            return (
              <ConversationListItem
                key={conversation.id}
                conversationId={conversation.id}
                primaryLabel={primaryLabel}
                secondaryLabel={secondaryLabel}
                lastMessagePreview={conversation.lastMessagePreview}
                lastMessageAt={conversation.lastMessageAt}
                unreadCount={conversation.unreadCount}
                sessionContext={conversation.sessionContext}
                subjectLabel={conversation.sessionContext.subjectSlug ? tSubjects(conversation.sessionContext.subjectSlug) : null}
                locale={locale}
                noMessagesLabel={t("list.noMessagesYet")}
              />
            );
          })}
        </ul>
      )}
    </DashboardShell>
  );
}
