import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ClaimGuardianInvitationForm } from "@/components/marketing/ClaimGuardianInvitationForm";
import { ClaimStudentLoginInvitationForm } from "@/components/marketing/ClaimStudentLoginInvitationForm";
import { Section } from "@/components/ui/Section";
import { previewInvitationByToken } from "@/services/familyManagement";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "family.claimPage" });
  return { title: t("title") };
}

export default async function ClaimFamilyInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "family.claimPage" });
  const tStudent = await getTranslations({ locale, namespace: "family.studentLoginClaimPage" });
  const session = await auth();

  // Read-only preview — never mutates the invitation. Minimizes further
  // propagation of the raw token beyond this one route (§36 of the H.4
  // prompt): it's read once here to resolve state for rendering, and
  // separately by the claim Server Action on explicit submit; it is never
  // included in a redirect, another route's query params, or any link.
  //
  // Phase H.5 (§32): the invitation's type is resolved server-side from
  // the hashed token alone — there is no client-provided "type" of any
  // kind for this route to trust. One route, one token-resolution system,
  // branching into GUARDIAN_LINK vs STUDENT_LOGIN copy/forms below.
  const preview = await previewInvitationByToken(db, token);
  const isStudentLogin = preview?.type === "STUDENT_LOGIN";
  const pageT = isStudentLogin ? tStudent : t;

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-bold text-navy">{pageT("title")}</h1>
          <p className="mt-1 text-sm text-slate">{pageT("description")}</p>

          <div className="mt-6">
            {!preview ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-8">
                <p className="text-lg font-bold text-navy">{t("invalidTitle")}</p>
                <p className="mt-2 text-slate">{t("invalidDescription")}</p>
              </div>
            ) : preview.status === "EXPIRED" || preview.status === "REVOKED" ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-8">
                <p className="text-lg font-bold text-navy">{t("invalidTitle")}</p>
                <p className="mt-2 text-slate">{t("expiredDescription")}</p>
              </div>
            ) : preview.status === "CLAIMED_PENDING_APPROVAL" || preview.status === "ACCEPTED" ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-8">
                <p className="text-lg font-bold text-navy">{t("invalidTitle")}</p>
                <p className="mt-2 text-slate">{t("invalidDescription")}</p>
              </div>
            ) : isStudentLogin ? (
              <ClaimStudentLoginInvitationForm
                token={token}
                invitedEmail={preview.invitedEmailNormalized}
                isAuthenticated={!!session?.user}
                sessionEmail={session?.user?.email ?? null}
                sessionRole={session?.user?.role ?? null}
              />
            ) : (
              <ClaimGuardianInvitationForm
                token={token}
                invitedEmail={preview.invitedEmailNormalized}
                isAuthenticated={!!session?.user}
                sessionEmail={session?.user?.email ?? null}
                sessionRole={session?.user?.role ?? null}
              />
            )}
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
