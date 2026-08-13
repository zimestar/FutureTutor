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

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: "FutureTutor Admin",
        role: "SUPER_ADMIN",
        passwordHash,
      },
    });
    console.log(`Seeded SUPER_ADMIN: ${adminEmail}`);
  } else {
    console.warn(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed."
    );
  }

  console.log(
    `Seeded ${SUBJECT_SLUGS.length} subjects and ${ACADEMIC_LEVEL_SLUGS.length} academic levels.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
