export interface Benefit {
  id: "target" | "route" | "calendarClock" | "lineChart";
  icon: "target" | "route" | "calendar-clock" | "line-chart";
}

/** Titles/descriptions live in messages/*.json under `benefits.items.<id>`. */
export const benefits: Benefit[] = [
  { id: "target", icon: "target" },
  { id: "route", icon: "route" },
  { id: "calendarClock", icon: "calendar-clock" },
  { id: "lineChart", icon: "line-chart" },
];

/** Labels live in messages/*.json under `trustStrip.<id>`. */
export const trustMarkerIds = ["personalized", "onlineInPerson", "flexible", "verification"] as const;
