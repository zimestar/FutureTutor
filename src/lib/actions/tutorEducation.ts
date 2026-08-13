"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tutorEducationSchema } from "@/schemas/tutorEducation";
import { verifyEducation, verifyCertification } from "@/services/tutorApplicationWorkflow";

export type TutorEducationActionState = { error?: string; success?: boolean } | undefined;

async function requireTutorProfile() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return null;
  return db.tutorProfile.findUnique({ where: { userId: session.user.id } });
}

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

function readIndexedRows(formData: FormData, prefix: string, fields: string[], count: number) {
  return Array.from({ length: count }, (_, i) => {
    const row: Record<string, string> = {};
    for (const field of fields) {
      row[field] = String(formData.get(`${prefix}-${i}-${field}`) ?? "");
    }
    return row;
  });
}

export async function saveTutorEducationAction(
  _prevState: TutorEducationActionState,
  formData: FormData
): Promise<TutorEducationActionState> {
  const t = await getTranslations("tutorEducationForm.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const educationCount = Number(formData.get("educationCount") ?? 0);
  const certificationCount = Number(formData.get("certificationCount") ?? 0);

  const education = readIndexedRows(formData, "education", ["institution", "degree", "fieldOfStudy", "startYear", "endYear"], educationCount);
  const certifications = readIndexedRows(formData, "certification", ["name", "issuer", "issueYear", "credentialUrl"], certificationCount);

  const parsed = tutorEducationSchema.safeParse({ education, certifications });
  if (!parsed.success) return { error: t("invalidInput") };

  await db.$transaction([
    db.tutorEducation.deleteMany({ where: { tutorProfileId: tutorProfile.id } }),
    db.tutorEducation.createMany({
      data: parsed.data.education
        .filter((row) => row.institution)
        .map((row) => ({
          tutorProfileId: tutorProfile.id,
          institution: row.institution,
          degree: row.degree || null,
          fieldOfStudy: row.fieldOfStudy || null,
          startYear: row.startYear || null,
          endYear: row.endYear || null,
        })),
    }),
    db.tutorCertification.deleteMany({ where: { tutorProfileId: tutorProfile.id } }),
    db.tutorCertification.createMany({
      data: parsed.data.certifications
        .filter((row) => row.name)
        .map((row) => ({
          tutorProfileId: tutorProfile.id,
          name: row.name,
          issuer: row.issuer || null,
          issueYear: row.issueYear || null,
          credentialUrl: row.credentialUrl || null,
        })),
    }),
  ]);

  revalidatePath("/tutor/profile");
  return { success: true };
}

export async function verifyEducationAction(educationId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const education = await db.tutorEducation.findUnique({ where: { id: educationId } });
  if (!education) return;
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;
  const isRelevantToSubjects = formData.get("isRelevantToSubjects") === "on";
  await verifyEducation(educationId, documentId, admin.id, isRelevantToSubjects);
  revalidatePath(`/admin/tutors/${education.tutorProfileId}`);
}

export async function verifyCertificationAction(certificationId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const certification = await db.tutorCertification.findUnique({ where: { id: certificationId } });
  if (!certification) return;
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;
  const isRelevantToSubjects = formData.get("isRelevantToSubjects") === "on";
  await verifyCertification(certificationId, documentId, admin.id, isRelevantToSubjects);
  revalidatePath(`/admin/tutors/${certification.tutorProfileId}`);
}
