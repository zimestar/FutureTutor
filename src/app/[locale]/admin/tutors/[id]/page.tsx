import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { InterviewRubricForm } from "@/components/dashboard/InterviewRubricForm";
import { TutorPayoutTierSelect } from "@/components/dashboard/TutorPayoutTierSelect";
import {
  hasApprovedEducationDocument,
  interviewIsFullyScored,
  allRequiredTrainingComplete,
  hasPassedExam,
} from "@/services/tutorApplicationWorkflow";
import {
  startDocumentReviewAction,
  requireInterviewAction,
  sendToFinalReviewAction,
  approveTutorAction,
  rejectTutorAction,
  suspendTutorAction,
  reactivateTutorAction,
} from "@/lib/actions/adminTutorReview";
import { approveDocumentAction, rejectDocumentAction } from "@/lib/actions/tutorDocuments";
import { verifyEducationAction, verifyCertificationAction } from "@/lib/actions/tutorEducation";
import { scheduleInterviewAction } from "@/lib/actions/tutorInterview";
import { requireTrainingAction } from "@/lib/actions/tutorTraining";
import { requireExamAction } from "@/lib/actions/tutorExam";
import { adminNavItems } from "@/lib/adminNav";
import { Avatar } from "@/components/ui/Avatar";

export default async function AdminTutorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations({ locale, namespace: "admin.tutorDetail" });
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tStatus = await getTranslations({ locale, namespace: "dashboard.tutor.applicationStatus" });
  const tDocType = await getTranslations({ locale, namespace: "tutorDocuments.types" });
  const tDocStatus = await getTranslations({ locale, namespace: "tutorDocuments.status" });

  const tutor = await db.tutorProfile.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, image: true } },
      education: true,
      certifications: true,
      documents: { orderBy: { uploadedAt: "desc" } },
      interviews: { orderBy: { scheduledAt: "desc" }, include: { evaluations: true } },
      trainingProgress: true,
      examAttempts: { orderBy: { attemptNumber: "desc" } },
      scores: { where: { scopeType: "OVERALL", scopeKey: "OVERALL" } },
    },
  });
  if (!tutor) notFound();

  const [docsGateOk, interviewGateOk, trainingGateOk, examGateOk, trainingModules] = await Promise.all([
    hasApprovedEducationDocument(db, tutor.id),
    interviewIsFullyScored(db, tutor.id),
    allRequiredTrainingComplete(db, tutor.id),
    hasPassedExam(db, tutor.id),
    db.trainingModule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const status = tutor.applicationStatus;
  const approvedDocuments = tutor.documents.filter((d) => d.status === "APPROVED");
  const latestInterview = tutor.interviews[0];
  const score = tutor.scores[0];

  return (
    <DashboardShell
      navItems={await adminNavItems(tNav, user)}
      userName={user.name ?? ""}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={tutor.user.name ?? tutor.user.email} src={tutor.user.image ?? undefined} size={72} />
        <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">{tutor.user.name}</h1>
        <Badge variant={status === "APPROVED" ? "mint" : "outline"}>{tStatus(status)}</Badge>
        {tutor.validationVersion && (
          <span className="text-xs text-slate">{t("validationVersion", { version: tutor.validationVersion })}</span>
        )}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate">{tutor.user.email}</p>
      <p className="mt-1 text-xs text-slate">
        {tutor.tutorAgreementAcceptedAt
          ? t("tutorAgreementAccepted", {
              version: tutor.tutorAgreementAcceptedVersion ?? "?",
              date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(tutor.tutorAgreementAcceptedAt),
              lang: tutor.tutorAgreementAcceptedLocale ?? "?",
            })
          : t("tutorAgreementNotAccepted")}
      </p>

      <TutorPayoutTierSelect
        tutorProfileId={tutor.id}
        currentTier={tutor.payoutTier}
        label={t("payoutTierLabel")}
        tierLabels={{
          NEW: t("payoutTiers.NEW"),
          VERIFIED: t("payoutTiers.VERIFIED"),
          SENIOR: t("payoutTiers.SENIOR"),
          ELITE: t("payoutTiers.ELITE"),
        }}
      />

      {/* --- Stage actions --- */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5">
        {status === "SUBMITTED" && (
          <form action={startDocumentReviewAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm">
              {t("startDocumentReview")}
            </Button>
          </form>
        )}
        {status === "UNDER_REVIEW" && (
          <form action={requireInterviewAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm" disabled={!docsGateOk}>
              {t("requireInterview")}
            </Button>
          </form>
        )}
        {status === "UNDER_REVIEW" && !docsGateOk && (
          <p className="text-sm text-slate">{t("requireInterviewGateHint")}</p>
        )}
        {status === "INTERVIEW_COMPLETED" && (
          <form action={requireTrainingAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm">
              {t("requireTraining")}
            </Button>
          </form>
        )}
        {status === "TRAINING_COMPLETED" && (
          <form action={requireExamAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm">
              {t("requireExam")}
            </Button>
          </form>
        )}
        {status === "EXAM_COMPLETED" && (
          <form action={sendToFinalReviewAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm">
              {t("sendToFinalReview")}
            </Button>
          </form>
        )}
        {status === "FINAL_REVIEW" && (
          <form action={approveTutorAction.bind(null, tutor.id)}>
            <Button type="submit" size="sm" disabled={!docsGateOk || !interviewGateOk || !trainingGateOk || !examGateOk}>
              {t("approveTutor")}
            </Button>
          </form>
        )}
        {status !== "APPROVED" && status !== "REJECTED" && (
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-error">{t("rejectTutor")}</summary>
            <form action={rejectTutorAction.bind(null, tutor.id)} className="mt-2 flex gap-2">
              <input
                type="text"
                name="reason"
                required
                placeholder={t("reasonPlaceholder")}
                className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
              />
              <Button type="submit" variant="outline" size="sm">
                {t("confirmReject")}
              </Button>
            </form>
          </details>
        )}
        {status === "APPROVED" && (
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-error">{t("suspendTutor")}</summary>
            <form action={suspendTutorAction.bind(null, tutor.id)} className="mt-2 flex gap-2">
              <input
                type="text"
                name="reason"
                required
                placeholder={t("reasonPlaceholder")}
                className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
              />
              <Button type="submit" variant="outline" size="sm">
                {t("confirmSuspend")}
              </Button>
            </form>
          </details>
        )}
        {status === "SUSPENDED" && (
          <form action={reactivateTutorAction.bind(null, tutor.id)} className="flex gap-2">
            <input
              type="text"
              name="reason"
              required
              placeholder={t("reasonPlaceholder")}
              className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
            />
            <Button type="submit" size="sm">
              {t("reactivateTutor")}
            </Button>
          </form>
        )}
      </div>

      {/* --- Education --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("educationTitle")}</h2>
        {tutor.education.length === 0 ? (
          <p className="text-sm text-slate">{t("noEducation")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tutor.education.map((edu) => (
              <div key={edu.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-navy">
                    {edu.institution}
                    {edu.degree ? ` — ${edu.degree}` : ""}
                  </p>
                  <Badge variant={edu.verificationStatus === "VERIFIED" ? "mint" : "outline"}>
                    {t(`verificationStatus.${edu.verificationStatus}`)}
                  </Badge>
                </div>
                {edu.fieldOfStudy && <p className="text-sm text-slate">{edu.fieldOfStudy}</p>}
                {edu.verificationStatus === "UNVERIFIED" && approvedDocuments.length > 0 && (
                  <form action={verifyEducationAction.bind(null, edu.id)} className="mt-3 flex flex-wrap items-center gap-2">
                    <Select name="documentId" required className="h-9 text-sm" containerClassName="w-auto max-w-full">
                      <option value="">{t("selectDocument")}</option>
                      {approvedDocuments.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {tDocType(doc.type)} — {doc.originalFileName}
                        </option>
                      ))}
                    </Select>
                    <label className="flex items-center gap-1.5 text-sm text-navy">
                      <input type="checkbox" name="isRelevantToSubjects" />
                      {t("relevantToSubjects")}
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      {t("verify")}
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Certifications --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("certificationsTitle")}</h2>
        {tutor.certifications.length === 0 ? (
          <p className="text-sm text-slate">{t("noCertifications")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tutor.certifications.map((cert) => (
              <div key={cert.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-navy">{cert.name}</p>
                  <Badge variant={cert.verificationStatus === "VERIFIED" ? "mint" : "outline"}>
                    {t(`verificationStatus.${cert.verificationStatus}`)}
                  </Badge>
                </div>
                {cert.issuer && <p className="text-sm text-slate">{cert.issuer}</p>}
                {cert.verificationStatus === "UNVERIFIED" && approvedDocuments.length > 0 && (
                  <form
                    action={verifyCertificationAction.bind(null, cert.id)}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <Select name="documentId" required className="h-9 text-sm" containerClassName="w-auto max-w-full">
                      <option value="">{t("selectDocument")}</option>
                      {approvedDocuments.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {tDocType(doc.type)} — {doc.originalFileName}
                        </option>
                      ))}
                    </Select>
                    <label className="flex items-center gap-1.5 text-sm text-navy">
                      <input type="checkbox" name="isRelevantToSubjects" />
                      {t("relevantToSubjects")}
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      {t("verify")}
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Documents --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("documentsTitle")}</h2>
        {tutor.documents.length === 0 ? (
          <p className="text-sm text-slate">{t("noDocuments")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tutor.documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy">{tDocType(doc.type)}</p>
                    <a
                      href={`/api/documents/${doc.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue underline"
                    >
                      {doc.originalFileName}
                    </a>
                  </div>
                  <Badge variant={doc.status === "APPROVED" ? "mint" : "outline"}>{tDocStatus(doc.status)}</Badge>
                </div>
                {doc.status === "PENDING_REVIEW" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={approveDocumentAction.bind(null, doc.id)}>
                      <Button type="submit" size="sm">
                        {t("approveDocument")}
                      </Button>
                    </form>
                    <form action={rejectDocumentAction.bind(null, doc.id)} className="flex gap-2">
                      <input
                        type="text"
                        name="reason"
                        required
                        placeholder={t("reasonPlaceholder")}
                        className="h-9 rounded-md border border-neutral-300 px-2 text-sm"
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {t("rejectDocument")}
                      </Button>
                    </form>
                  </div>
                )}
                {doc.rejectionReason && <p className="mt-2 text-sm text-error">{doc.rejectionReason}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Interview --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("interviewTitle")}</h2>
        {status === "INTERVIEW_REQUIRED" || latestInterview ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <form action={scheduleInterviewAction.bind(null, tutor.id)} className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                name="scheduledAt"
                defaultValue={latestInterview?.scheduledAt?.toISOString().slice(0, 16)}
                className="h-9 rounded-md border border-neutral-300 px-2 text-sm"
              />
              <Button type="submit" variant="outline" size="sm">
                {t("scheduleInterview")}
              </Button>
            </form>
            {latestInterview && (
              <div className="mt-4">
                <InterviewRubricForm
                  tutorInterviewId={latestInterview.id}
                  existingScores={Object.fromEntries(
                    latestInterview.evaluations.map((e) => [e.criterion, { score: e.score, notes: e.notes }])
                  )}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate">{t("interviewNotYet")}</p>
        )}
      </section>

      {/* --- Training --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("trainingTitle")}</h2>
        <div className="flex flex-col gap-2">
          {trainingModules.map((mod) => {
            const progress = tutor.trainingProgress.find((p) => p.trainingModuleId === mod.id);
            return (
              <div
                key={mod.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="text-sm font-semibold text-navy">{mod.title}</p>
                <Badge variant={progress?.completedAt ? "mint" : "outline"}>
                  {progress?.completedAt ? t("completed") : t("notCompleted")}
                </Badge>
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Exam attempts --- */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("examTitle")}</h2>
        {tutor.examAttempts.length === 0 ? (
          <p className="text-sm text-slate">{t("noExamAttempts")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tutor.examAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 text-sm"
              >
                <span>{t("attemptNumber", { number: attempt.attemptNumber })}</span>
                <span className="font-semibold text-navy">{attempt.score}%</span>
                <Badge variant={attempt.passed ? "mint" : "outline"}>
                  {attempt.passed ? t("passed") : t("failed")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Score --- */}
      {score && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy">{t("scoreTitle")}</h2>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-extrabold text-navy">{score.score}/100</p>
            <p className="text-sm text-slate">
              {t("confidence", { level: score.confidence })} · {score.scoreVersion}
            </p>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
