import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Mirrors src/content/subjects.ts and the gradeLevels.* keys used in
// messages/*.json — kept in sync manually since one lives in the DB and the
// other in the static marketing site's translation files.
const SUBJECT_SLUGS = [
  "math",
  "english",
  "french",
  "science",
  "chemistry",
  "physics",
  "biology",
  "computer-science",
  "exam-prep",
  "elementary",
];

const ACADEMIC_LEVEL_SLUGS = [
  "elementary",
  "middleSchool",
  "highSchool",
  "cegepCollege",
  "university",
  "adultLearner",
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seedUser(email: string, password: string, name: string, role: "STUDENT" | "TUTOR" | "SUPER_ADMIN") {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  for (const [index, slug] of SUBJECT_SLUGS.entries()) {
    await prisma.subject.upsert({
      where: { slug },
      update: { sortOrder: index },
      create: { slug, sortOrder: index },
    });
  }

  for (const [index, slug] of ACADEMIC_LEVEL_SLUGS.entries()) {
    await prisma.academicLevel.upsert({
      where: { slug },
      update: { sortOrder: index },
      create: { slug, sortOrder: index },
    });
  }

  console.log(
    `Seeded ${SUBJECT_SLUGS.length} subjects and ${ACADEMIC_LEVEL_SLUGS.length} academic levels.`
  );

  // --- Dev-only test accounts, one per role. Never seeded in production. ---

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await seedUser(adminEmail, adminPassword, "FutureTutor Admin", "SUPER_ADMIN");
    console.log(`Seeded SUPER_ADMIN: ${adminEmail} / ${adminPassword}`);
  } else {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed.");
  }

  const studentEmail = "student@futuretutor.local";
  const studentPassword = "TestPass123!";
  const studentUser = await seedUser(studentEmail, studentPassword, "Sam Student", "STUDENT");
  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      firstName: "Sam",
      lastName: "Student",
      city: "Toronto",
      province: "ON",
      tutoringMode: "BOTH",
    },
  });
  console.log(`Seeded STUDENT: ${studentEmail} / ${studentPassword}`);

  const tutorEmail = "tutor@futuretutor.local";
  const tutorPassword = "TestPass123!";
  const tutorUser = await seedUser(tutorEmail, tutorPassword, "Taylor Tutor", "TUTOR");
  const [mathId, physicsId] = await Promise.all([
    prisma.subject.findUniqueOrThrow({ where: { slug: "math" } }),
    prisma.subject.findUniqueOrThrow({ where: { slug: "physics" } }),
  ]);
  const [highSchoolId, cegepId] = await Promise.all([
    prisma.academicLevel.findUniqueOrThrow({ where: { slug: "highSchool" } }),
    prisma.academicLevel.findUniqueOrThrow({ where: { slug: "cegepCollege" } }),
  ]);

  const tutorProfile = await prisma.tutorProfile.upsert({
    where: { userId: tutorUser.id },
    update: {},
    create: {
      userId: tutorUser.id,
      slug: "taylor-tutor",
      headline: "Math & Physics Tutor — 6 years of experience",
      bio: "I help high school and CEGEP students build real confidence in math and physics through worked examples and practice sets. Patient, structured, and focused on your actual exam material.",
      hourlyRateCents: 4000,
      yearsExperience: 6,
      city: "Toronto",
      province: "ON",
      learningMode: "BOTH",
      applicationStatus: "APPROVED",
      // Approved under the old, simpler pre-Phase-D process — real (dev)
      // migration data also backfills this for any row already APPROVED,
      // this is just here so `seed.ts` stays self-documenting.
      validationVersion: 1,
    },
  });
  await prisma.tutorSubject.createMany({
    data: [
      { tutorProfileId: tutorProfile.id, subjectId: mathId.id },
      { tutorProfileId: tutorProfile.id, subjectId: physicsId.id },
    ],
    skipDuplicates: true,
  });
  await prisma.tutorLevel.createMany({
    data: [
      { tutorProfileId: tutorProfile.id, academicLevelId: highSchoolId.id },
      { tutorProfileId: tutorProfile.id, academicLevelId: cegepId.id },
    ],
    skipDuplicates: true,
  });
  await prisma.tutorLanguage.createMany({
    data: [{ tutorProfileId: tutorProfile.id, language: "en" }],
    skipDuplicates: true,
  });
  console.log(`Seeded TUTOR (pre-approved): ${tutorEmail} / ${tutorPassword}`);

  // --- Phase D: Tutor Validation Depth — required training modules + the
  // single seeded platform exam. Content lives here (not an authoring UI)
  // per the deliberate scope simplification in the Phase D plan. ---

  const TRAINING_MODULES = [
    {
      slug: "platform-basics",
      title: "Platform Basics",
      description:
        "How FutureTutor works: booking, messaging, scheduling, and what's expected of you as a tutor on the platform.",
      sortOrder: 0,
    },
    {
      slug: "child-safety-communication",
      title: "Child Safety & Communication",
      description:
        "Guidelines for tutoring minors: keeping communication on-platform, appropriate boundaries, and how to report a safety concern.",
      sortOrder: 1,
    },
    {
      slug: "session-conduct-cancellation",
      title: "Session Conduct & Cancellation Policy",
      description:
        "Punctuality, preparation, FutureTutor's cancellation policy, and how the end-of-session completion code works.",
      sortOrder: 2,
    },
  ];
  for (const module_ of TRAINING_MODULES) {
    await prisma.trainingModule.upsert({
      where: { slug: module_.slug },
      update: { title: module_.title, description: module_.description, sortOrder: module_.sortOrder },
      create: { ...module_, isRequired: true, isActive: true },
    });
  }
  console.log(`Seeded ${TRAINING_MODULES.length} required training modules.`);

  const existingPlatformExam = await prisma.tutorExam.findFirst({ where: { type: "PLATFORM" } });
  if (!existingPlatformExam) {
    await prisma.tutorExam.create({
      data: { type: "PLATFORM", title: "FutureTutor Platform Exam", passingScore: 80 },
    });
    console.log("Seeded PLATFORM tutor exam.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
