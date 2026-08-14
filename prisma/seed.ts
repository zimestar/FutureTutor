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

  // --- Phase E: Customer Price Engine + Tutor Payout Engine. All cents
  // amounts below are DEV/DEMO configuration only — not FutureTutor's real
  // business pricing, which hasn't been decided. ---

  const existingSettings = await prisma.marketplacePricingSettings.findFirst();
  if (!existingSettings) {
    await prisma.marketplacePricingSettings.create({ data: {} }); // all columns have DEV-labeled schema defaults
    console.log("Seeded MarketplacePricingSettings (DEV defaults).");
  }

  const CUSTOMER_PRICING_VERSION = "CUSTOMER_PRICING_V1";
  const TUTOR_PAYOUT_VERSION = "TUTOR_PAYOUT_V1";

  const existingPriceRules = await prisma.customerBasePriceRule.count();
  if (existingPriceRules === 0) {
    await prisma.customerBasePriceRule.createMany({
      data: [
        // Platform-wide fallback — used when no subject/level-specific rule matches.
        { subjectId: null, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 4500, pricingVersion: CUSTOMER_PRICING_VERSION },
        { subjectId: mathId.id, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 4200, pricingVersion: CUSTOMER_PRICING_VERSION },
        { subjectId: physicsId.id, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 4800, pricingVersion: CUSTOMER_PRICING_VERSION },
      ],
    });
    console.log("Seeded 3 CustomerBasePriceRule rows (DEV defaults).");
  }

  const existingPayoutRules = await prisma.tutorBasePayoutRule.count();
  if (existingPayoutRules === 0) {
    await prisma.tutorBasePayoutRule.createMany({
      data: [
        // Platform-wide fallback per tier.
        { tutorTier: "NEW", subjectId: null, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 3000, payoutVersion: TUTOR_PAYOUT_VERSION },
        { tutorTier: "VERIFIED", subjectId: null, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 3400, payoutVersion: TUTOR_PAYOUT_VERSION },
        { tutorTier: "SENIOR", subjectId: null, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 3800, payoutVersion: TUTOR_PAYOUT_VERSION },
        { tutorTier: "ELITE", subjectId: null, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 4200, payoutVersion: TUTOR_PAYOUT_VERSION },
        { tutorTier: "NEW", subjectId: mathId.id, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 2800, payoutVersion: TUTOR_PAYOUT_VERSION },
        { tutorTier: "NEW", subjectId: physicsId.id, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 3200, payoutVersion: TUTOR_PAYOUT_VERSION },
      ],
    });
    console.log("Seeded 6 TutorBasePayoutRule rows (DEV defaults).");
  }

  // --- Phase F: Quick Match & Tutor Dispatch. Dispatch/ranking numbers below
  // are DEV/DEMO defaults only — see the Phase F plan's "remaining product
  // decisions" for what still needs product sign-off. ---

  const existingRankingSettings = await prisma.tutorRankingSettings.findFirst();
  if (!existingRankingSettings) {
    await prisma.tutorRankingSettings.create({ data: {} }); // all columns have DEV-labeled schema defaults
    console.log("Seeded TutorRankingSettings (DEV defaults).");
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
