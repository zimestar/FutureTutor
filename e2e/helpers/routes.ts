export const publicRoutes = [
  "",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password?token=invalid",
  "/find-tutors",
] as const;

export const studentRoutes = [
  "/dashboard",
  "/dashboard/find-tutors",
  "/dashboard/quick-match",
  "/dashboard/bookings",
  "/dashboard/favorites",
  "/dashboard/profile",
] as const;

export const tutorRoutes = [
  "/tutor/dashboard",
  "/tutor/bookings",
  "/tutor/availability",
  "/tutor/payouts",
  "/tutor/profile",
] as const;

export const adminRoutes = ["/admin", "/admin/payments"] as const;
