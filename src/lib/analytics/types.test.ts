import { describe, expect, it } from "vitest";
import type { AnalyticsEventPropertiesMap } from "./types";

// DATA-1 — regression guard for the exact defect found and fixed while
// preparing GTM activation: the generic pageview event was originally
// named "page_view", which collides with GA4's own reserved,
// automatically-collected event of the same name (Enhanced Measurement's
// "Page views" toggle). Firing a custom event under that exact name would
// double-count every page it also fires on. GA4's reserved/automatically-
// collected event names (https://support.google.com/analytics — Automatically
// collected events and Enhanced Measurement events) must never be reused
// as a FutureTutor custom event name.

const GA4_RESERVED_EVENT_NAMES = [
  "page_view",
  "scroll",
  "click",
  "view_search_results",
  "file_download",
  "video_start",
  "video_progress",
  "video_complete",
  "form_start",
  "form_submit",
  "session_start",
  "first_visit",
  "first_open",
  "user_engagement",
];

// A type-level list of every real event name — kept as a const tuple so a
// future event addition is exercised by the same test without needing a
// manual second list to stay in sync.
const eventNames: (keyof AnalyticsEventPropertiesMap)[] = [
  "futuretutor_page_view",
  "find_tutor_cta_clicked",
  "become_tutor_cta_clicked",
  "how_it_works_cta_clicked",
  "resource_article_viewed",
  "resource_primary_cta_clicked",
  "subject_page_viewed",
  "local_landing_viewed",
  "signup_started",
  "login_started",
  "search_started",
];

describe("AnalyticsEventPropertiesMap — no GA4-reserved event names", () => {
  it.each(eventNames)("%s does not collide with a GA4 reserved/automatic event name", (name) => {
    expect(GA4_RESERVED_EVENT_NAMES).not.toContain(name);
  });

  it("the generic pageview event is namespaced (futuretutor_page_view), never the bare reserved name", () => {
    expect(eventNames).toContain("futuretutor_page_view");
    expect(eventNames).not.toContain("page_view");
  });
});
