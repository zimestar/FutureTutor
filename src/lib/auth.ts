import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/schemas/auth";
import { checkActionRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { isEmailVerificationRequiredForUser } from "@/lib/emailVerificationConfig";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials provider requires JWT sessions — it intentionally isn't
  // persisted through an adapter. See node_modules/@auth/core's own docs on
  // the Credentials provider for why.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        // BETA-OPS1 — backstop rate-limit gate. This is the single choke
        // point every credential check funnels through (both loginAction's
        // own signIn() call, which has its own earlier, UX-friendly check,
        // and any direct request to the NextAuth callback route) — see
        // src/lib/rateLimit.ts. Returns null (identical to a wrong
        // password) rather than a distinguishable error, since a raw
        // bypass of loginAction doesn't get the nicer localized message
        // either way.
        const ip = getClientIp(request.headers);
        const rateLimit = await checkActionRateLimit({
          action: "login",
          identifier: parsed.data.email,
          ip,
          identifierLimit: RATE_LIMITS.loginByEmail,
          ipLimit: RATE_LIMITS.loginByIp,
        });
        if (!rateLimit.allowed) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !user.passwordHash || user.deactivatedAt) return null;

        const passwordMatches = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!passwordMatches) return null;

        // BETA-EMAILVERIFY1 — checked only after the password has already
        // been confirmed correct, so this rejection is never reachable by
        // someone who doesn't already hold the right credentials (no
        // enumeration signal). Migration-free, createdAt-cutoff gate — see
        // src/lib/emailVerificationConfig.ts's own doc comment for why an
        // emailVerified-only check would have locked out every existing
        // production user, including the platform's own admin account.
        // Returns null uniformly, exactly like every other rejection
        // reason above (wrong password, deactivated, no such user) — this
        // function has never distinguished rejection reasons to its
        // caller, and this doesn't start now.
        if (isEmailVerificationRequiredForUser(user)) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the initial sign-in call; our Credentials
      // `authorize()` above always returns a real `id`, unlike the generic
      // (optional) `User.id` type this callback is typed against.
      if (user?.id) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
