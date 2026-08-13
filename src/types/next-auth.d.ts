import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

// NextAuth's own config types resolve JWT from @auth/core/jwt internally,
// not from the next-auth/jwt re-export — augment both so `token.id`/`token.role`
// are typed everywhere the JWT type shows up (callbacks, etc.).
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
