export type E2ERole = "student" | "tutor" | "admin";

const variables = {
  student: ["E2E_STUDENT_EMAIL", "E2E_STUDENT_PASSWORD"],
  tutor: ["E2E_TUTOR_EMAIL", "E2E_TUTOR_PASSWORD"],
  admin: ["E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"],
} as const;

export function credentialsFor(role: E2ERole): { email: string; password: string } | null {
  const [emailName, passwordName] = variables[role];
  const email = process.env[emailName];
  const password = process.env[passwordName];
  if (!email || !password) return null;
  return { email, password };
}
