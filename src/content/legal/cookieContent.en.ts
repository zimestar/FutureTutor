import type { LegalDocumentContent } from "./types";

/** FG-LEGAL1C — Product-Owner-approved working Cookie Policy V1, integrated
 * faithfully from the approved source text. Remains subject to final
 * external Canadian legal review, per the mission's own instruction. See
 * termsContent.en.ts / privacyContent.en.ts for the parallel Terms of
 * Service and Privacy Policy content and the shared LegalDocument
 * rendering component. */
export const COOKIE_POLICY_VERSION = "2026-08-30";

export const cookieContentEn: LegalDocumentContent = {
  effectiveDate: "August 30, 2026",
  lastUpdated: "August 30, 2026",
  sections: [
    {
      number: 1,
      heading: "What Are Cookies?",
      blocks: [
        {
          type: "p",
          text: "FutureTutor is a tutoring marketplace owned and operated by FYRA SERVICES INC., a corporation federally incorporated in Canada.",
        },
        {
          type: "p",
          text: "This Cookie Policy explains how FYRA SERVICES INC., operating as FutureTutor (“FutureTutor,” “we,” “us,” or “our”), uses cookies and similar technologies when you access or use the FutureTutor website, web application, progressive web application, tutoring marketplace, and related services (collectively, the “Platform”).",
        },
        {
          type: "p",
          text: "This Cookie Policy should be read together with our Privacy Policy and Terms of Service.",
        },
        {
          type: "p",
          text: "Cookies are small pieces of information that websites and web applications may store on a user's browser or device.",
        },
        {
          type: "p",
          text: "Cookies can perform functions such as remembering that a user is signed in, maintaining a secure session, remembering preferences, or helping a website operate correctly.",
        },
        {
          type: "p",
          text: "The Office of the Privacy Commissioner of Canada describes cookies as small pieces of text placed on a user's computer that can preserve information between visits, including preferences and login-related functionality.",
        },
        {
          type: "p",
          text: "Some cookies are necessary for a service to function. Others may be used for purposes such as analytics, personalization, advertising, or tracking.",
        },
        {
          type: "p",
          text: "FutureTutor does not treat all cookies as having the same purpose or privacy impact.",
        },
      ],
    },
    {
      number: 2,
      heading: "Similar Technologies",
      blocks: [
        {
          type: "p",
          text: "In addition to traditional HTTP cookies, the Platform may use similar browser or device technologies, including:",
        },
        {
          type: "ul",
          items: [
            "local storage;",
            "session storage;",
            "authentication tokens or identifiers;",
            "browser-based preferences;",
            "security identifiers;",
            "temporary application state;",
            "other technologies necessary to operate the Platform.",
          ],
        },
        {
          type: "p",
          text: "For simplicity, this Cookie Policy may refer collectively to these technologies as “Cookies” or “cookies and similar technologies.”",
        },
      ],
    },
    {
      number: 3,
      heading: "Our Current Approach",
      partTitle: "Part I — How FutureTutor Uses Cookies",
      blocks: [
        {
          type: "p",
          text: "FutureTutor currently uses, or may use, cookies and similar technologies primarily to provide essential or functional aspects of the Platform.",
        },
        { type: "p", text: "These technologies may be used for purposes such as:" },
        {
          type: "ul",
          items: [
            "authenticating users;",
            "maintaining secure login sessions;",
            "protecting accounts;",
            "preventing unauthorized access;",
            "maintaining application state;",
            "remembering language or locale preferences;",
            "supporting security controls;",
            "routing users appropriately;",
            "supporting the progressive web application;",
            "enabling essential Platform functionality.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor does not currently intend to use cookies for behavioural advertising or remarketing.",
        },
        {
          type: "p",
          text: "FutureTutor does not currently represent that it uses third-party advertising cookies.",
        },
        {
          type: "p",
          text: "FutureTutor does not currently represent that it uses third-party behavioural analytics technologies unless such technologies are specifically implemented and disclosed.",
        },
      ],
    },
    {
      number: 4,
      heading: "Strictly Necessary Cookies",
      blocks: [
        {
          type: "p",
          text: "Strictly necessary cookies and similar technologies are used to provide functions without which the Platform could not operate properly or securely.",
        },
        { type: "p", text: "They may be used for:" },
        {
          type: "ul",
          items: [
            "user authentication;",
            "maintaining logged-in sessions;",
            "account security;",
            "fraud or abuse prevention;",
            "authorization;",
            "routing;",
            "load or application-state management;",
            "security protections;",
            "legal or privacy preference management where applicable.",
          ],
        },
        { type: "p", text: "Disabling these technologies may prevent parts of FutureTutor from functioning correctly." },
      ],
    },
    {
      number: 5,
      heading: "Authentication and Session Technologies",
      blocks: [
        {
          type: "p",
          text: "FutureTutor uses authentication and session technologies to recognize authenticated users and maintain secure access to their accounts.",
        },
        { type: "p", text: "These technologies may help FutureTutor determine:" },
        {
          type: "ul",
          items: [
            "whether a user is signed in;",
            "which account is currently authenticated;",
            "whether a session remains valid;",
            "whether access to a protected area is authorized;",
            "whether a user must authenticate again.",
          ],
        },
        { type: "p", text: "FutureTutor currently uses Auth.js as part of its authentication architecture." },
        {
          type: "p",
          text: "Authentication-related cookies or tokens should not be used by FutureTutor for behavioural advertising.",
        },
      ],
    },
    {
      number: 6,
      heading: "Security Technologies",
      blocks: [
        {
          type: "p",
          text: "FutureTutor may use cookies, tokens, identifiers, or similar mechanisms to support Platform security.",
        },
        { type: "p", text: "These technologies may assist with:" },
        {
          type: "ul",
          items: [
            "authentication;",
            "session integrity;",
            "request validation;",
            "protection against unauthorized access;",
            "detection of suspicious activity;",
            "account protection;",
            "security-related state.",
          ],
        },
        {
          type: "p",
          text: "Security technologies are intended to protect FutureTutor and its users rather than build advertising profiles.",
        },
      ],
    },
    {
      number: 7,
      heading: "Language and Locale",
      partTitle: "Part II — Preferences and Functionality",
      blocks: [
        { type: "p", text: "FutureTutor is a bilingual English/French Platform." },
        { type: "p", text: "Cookies or browser-based technologies may be used to remember:" },
        {
          type: "ul",
          items: ["preferred language;", "locale;", "language routing;", "related interface preferences."],
        },
        { type: "p", text: "This allows the Platform to provide a more consistent English or French experience." },
      ],
    },
    {
      number: 8,
      heading: "Application Preferences",
      blocks: [
        {
          type: "p",
          text: "FutureTutor may use browser storage or similar technologies to remember limited application preferences where supported.",
        },
        { type: "p", text: "Examples may include:" },
        {
          type: "ul",
          items: ["display preferences;", "temporary interface state;", "installation-related state;", "previously selected non-sensitive options."],
        },
        {
          type: "p",
          text: "FutureTutor should not use preference storage as a means of secretly creating behavioural profiles.",
        },
      ],
    },
    {
      number: 9,
      heading: "FutureTutor PWA",
      partTitle: "Part III — Progressive Web Application",
      blocks: [
        { type: "p", text: "FutureTutor can be installed on supported devices as a Progressive Web Application (“PWA”)." },
        {
          type: "p",
          text: "The PWA provides an application-like experience while continuing to use FutureTutor's web application architecture.",
        },
        {
          type: "p",
          text: "The existence of the PWA does not by itself mean that FutureTutor continuously tracks a user's device or location.",
        },
      ],
    },
    {
      number: 10,
      heading: "Offline Caching",
      blocks: [
        {
          type: "p",
          text: "FutureTutor currently does not intentionally implement an aggressive offline caching architecture for private account data.",
        },
        {
          type: "p",
          text: "FutureTutor currently does not use a service worker as a general-purpose private-data caching layer.",
        },
        {
          type: "p",
          text: "If this architecture materially changes in the future, FutureTutor will review the privacy implications and update applicable disclosures where appropriate.",
        },
      ],
    },
    {
      number: 11,
      heading: "Location and Cookies",
      partTitle: "Part IV — Location",
      blocks: [
        {
          type: "p",
          text: "FutureTutor supports in-person tutoring, but FutureTutor does not currently require continuous GPS tracking for ordinary tutoring functionality.",
        },
        {
          type: "p",
          text: "The Platform may process location information that users manually provide, such as an in-person tutoring address.",
        },
        {
          type: "p",
          text: "This information is governed primarily by the FutureTutor Privacy Policy rather than being collected through advertising or tracking cookies.",
        },
      ],
    },
    {
      number: 12,
      heading: "Device Geolocation",
      blocks: [
        {
          type: "p",
          text: "FutureTutor does not currently use cookies to continuously track the physical location of users.",
        },
        {
          type: "p",
          text: "If FutureTutor introduces browser or device geolocation in the future, it will provide appropriate notice and request permission or consent where required.",
        },
        {
          type: "p",
          text: "For Québec users, FutureTutor will consider applicable requirements relating to technologies that include identification, location, or profiling functions.",
        },
        {
          type: "p",
          text: "Québec's Commission d'accès à l'information states that organizations using technologies with identification, location, or profiling functions must inform individuals of the use of the technology and the means available to activate those functions; such functions should not simply be activated by default.",
        },
      ],
    },
    {
      number: 13,
      heading: "Current Analytics Position",
      partTitle: "Part V — Analytics",
      blocks: [
        {
          type: "p",
          text: "FutureTutor may process limited technical information through its own application infrastructure for purposes such as:",
        },
        {
          type: "ul",
          items: ["troubleshooting;", "application performance;", "security;", "reliability;", "error diagnosis;", "operational monitoring."],
        },
        { type: "p", text: "This does not necessarily involve third-party analytics cookies." },
        {
          type: "p",
          text: "At the Effective Date of this Policy, FutureTutor does not represent that it uses third-party behavioural analytics technologies unless they are actually implemented and disclosed.",
        },
      ],
    },
    {
      number: 14,
      heading: "Future Analytics Services",
      blocks: [
        { type: "p", text: "FutureTutor may introduce privacy-appropriate analytics services in the future." },
        {
          type: "p",
          text: "Before introducing analytics technologies that materially expand tracking or processing of personal information, FutureTutor will assess:",
        },
        {
          type: "ul",
          items: [
            "what information is collected;",
            "why it is collected;",
            "whether it is necessary;",
            "whether consent is required;",
            "whether users should be able to refuse it;",
            "whether this Cookie Policy or Privacy Policy must be updated.",
          ],
        },
        {
          type: "p",
          text: "Where consent is required, FutureTutor will seek the appropriate consent before activating the relevant technology.",
        },
      ],
    },
    {
      number: 15,
      heading: "Behavioural Advertising",
      partTitle: "Part VI — Advertising and Remarketing",
      blocks: [
        { type: "p", text: "FutureTutor does not currently use cookies for behavioural advertising." },
        { type: "p", text: "FutureTutor does not currently use children's personal information for behavioural advertising." },
      ],
    },
    {
      number: 16,
      heading: "Remarketing",
      blocks: [
        {
          type: "p",
          text: "FutureTutor does not currently use remarketing cookies or pixels to follow users across unrelated websites for advertising purposes.",
        },
        { type: "p", text: "If this changes, FutureTutor will update this Policy and implement appropriate consent controls where required." },
      ],
    },
    {
      number: 17,
      heading: "Advertising Platforms",
      blocks: [
        {
          type: "p",
          text: "At the Effective Date of this Policy, FutureTutor does not represent that technologies such as the following are active on the Platform:",
        },
        {
          type: "ul",
          items: ["Meta Pixel;", "TikTok Pixel;", "advertising-oriented Google tags;", "LinkedIn Insight Tag;", "other behavioural advertising pixels."],
        },
        {
          type: "p",
          text: "If any such technology is introduced, this Policy must be updated before or when it becomes operational, as required by applicable law.",
        },
      ],
    },
    {
      number: 18,
      heading: "Third-Party Technologies",
      partTitle: "Part VII — Third-Party Services",
      blocks: [
        { type: "p", text: "FutureTutor uses third-party service providers to operate portions of the Platform." },
        {
          type: "p",
          text: "These providers may use their own cookies, tokens, browser technologies, or other technical mechanisms where necessary to provide their services.",
        },
        { type: "p", text: "Current providers include:" },
        {
          type: "ul",
          items: [
            "Stripe — payments and Tutor payout infrastructure;",
            "Daily — Virtual Classroom/video infrastructure;",
            "Resend — transactional email delivery;",
            "Railway — application/infrastructure hosting;",
            "Supabase — database infrastructure.",
          ],
        },
        {
          type: "p",
          text: "The mere use of a service provider does not necessarily mean that the provider places a cookie on every FutureTutor user's device.",
        },
      ],
    },
    {
      number: 19,
      heading: "Stripe",
      blocks: [
        { type: "p", text: "FutureTutor uses Stripe for payment processing and related financial infrastructure." },
        {
          type: "p",
          text: "When a user interacts with payment functionality, Stripe may process technical information or use technologies necessary to:",
        },
        {
          type: "ul",
          items: ["process transactions;", "authenticate payment activity;", "prevent fraud;", "maintain security;", "comply with legal obligations."],
        },
        { type: "p", text: "Stripe's own privacy practices may apply to information it independently processes." },
      ],
    },
    {
      number: 20,
      heading: "Daily",
      blocks: [
        { type: "p", text: "FutureTutor currently uses Daily to provide Virtual Classroom technology." },
        {
          type: "p",
          text: "Daily may use technical identifiers or other technologies necessary to establish and maintain online tutoring sessions.",
        },
        { type: "p", text: "FutureTutor does not use the Virtual Classroom as a behavioural advertising mechanism." },
      ],
    },
    {
      number: 21,
      heading: "Resend",
      blocks: [
        { type: "p", text: "FutureTutor currently uses Resend for transactional email delivery." },
        {
          type: "p",
          text: "Resend's involvement in sending an email does not necessarily mean that FutureTutor places a tracking cookie on the recipient's device.",
        },
        {
          type: "p",
          text: "FutureTutor should separately assess any email-tracking functionality if such functionality is enabled in the future.",
        },
      ],
    },
    {
      number: 22,
      heading: "Railway and Supabase",
      blocks: [
        { type: "p", text: "FutureTutor uses Railway and Supabase as components of its application and data infrastructure." },
        {
          type: "p",
          text: "These infrastructure providers may process technical information necessary to host, secure, connect, or operate the Platform.",
        },
        {
          type: "p",
          text: "Their presence does not necessarily mean that they place independent advertising cookies on users' devices.",
        },
      ],
    },
    {
      number: 23,
      heading: "Children's Privacy",
      partTitle: "Part VIII — Children",
      blocks: [
        { type: "p", text: "FutureTutor provides tutoring services that may involve minors." },
        { type: "p", text: "FutureTutor seeks to apply heightened privacy protections to children and youth." },
        {
          type: "p",
          text: "Cookies or similar technologies should not be used by FutureTutor to create behavioural advertising profiles of children.",
        },
      ],
    },
    {
      number: 24,
      heading: "Children Under 13",
      blocks: [
        {
          type: "p",
          text: "FutureTutor's broader privacy framework generally requires children under 13 to use the Platform through an authorized Parent or legal Guardian.",
        },
        {
          type: "p",
          text: "Cookie and similar-technology practices involving Guardian-managed accounts must remain consistent with the protections described in the FutureTutor Privacy Policy.",
        },
        {
          type: "p",
          text: "For Québec specifically, applicable rules for minors must also be respected. The Commission d'accès à l'information states that for a minor under 14, consent to the use or disclosure of personal information is generally provided by the parent or holder of parental authority, subject to statutory exceptions.",
        },
      ],
    },
    {
      number: 25,
      heading: "Consent",
      partTitle: "Part IX — Consent and Cookie Choices",
      blocks: [
        {
          type: "p",
          text: "FutureTutor distinguishes between technologies necessary to provide the Platform and optional technologies that may require additional consent.",
        },
        { type: "p", text: "The appropriate form of consent depends on:" },
        {
          type: "ul",
          items: ["the technology;", "the information processed;", "the purpose;", "the sensitivity of the information;", "reasonable user expectations;", "applicable law."],
        },
        {
          type: "p",
          text: "Under Canadian privacy guidance, consent should be meaningful and individuals should understand the purposes for which their information is collected, used, or disclosed.",
        },
      ],
    },
    {
      number: 26,
      heading: "Essential Technologies",
      blocks: [
        {
          type: "p",
          text: "Certain authentication, security, and session technologies are necessary for FutureTutor to provide requested Platform functionality.",
        },
        {
          type: "p",
          text: "Where permitted by applicable law, FutureTutor may use such technologies as necessary to provide the service.",
        },
        { type: "p", text: "Users who prevent these technologies from functioning may be unable to:" },
        {
          type: "ul",
          items: ["sign in;", "remain authenticated;", "access protected dashboards;", "complete certain transactions;", "use other essential Platform features."],
        },
      ],
    },
    {
      number: 27,
      heading: "Optional Technologies",
      blocks: [
        {
          type: "p",
          text: "If FutureTutor introduces non-essential technologies that require consent, FutureTutor will provide an appropriate mechanism to make the required choice.",
        },
        { type: "p", text: "Depending on applicable law and technology, this may include the ability to:" },
        { type: "ul", items: ["accept;", "reject;", "configure preferences;", "withdraw consent."] },
        {
          type: "p",
          text: "FutureTutor should not activate optional tracking technologies by default where applicable law requires prior consent.",
        },
      ],
    },
    {
      number: 28,
      heading: "Cookie Banner",
      blocks: [
        {
          type: "p",
          text: "FutureTutor does not claim that a cookie banner is legally required merely because the Platform uses essential authentication or session technologies.",
        },
        { type: "p", text: "Whether a consent banner is necessary depends on the actual technologies in use and applicable law." },
        {
          type: "p",
          text: "If FutureTutor introduces optional analytics, advertising, remarketing, profiling, or other non-essential tracking technologies requiring consent, an appropriate consent mechanism should be implemented before those technologies are activated.",
        },
      ],
    },
    {
      number: 29,
      heading: "Browser Controls",
      partTitle: "Part X — Managing Cookies",
      blocks: [
        { type: "p", text: "Most browsers allow users to control cookies through browser settings." },
        { type: "p", text: "Depending on the browser, users may be able to:" },
        {
          type: "ul",
          items: ["view cookies;", "block cookies;", "delete cookies;", "restrict third-party cookies;", "clear site data."],
        },
        { type: "p", text: "Disabling necessary cookies may cause FutureTutor to stop functioning correctly." },
      ],
    },
    {
      number: 30,
      heading: "Clearing Application Data",
      blocks: [
        { type: "p", text: "Users may also be able to clear:" },
        { type: "ul", items: ["local storage;", "session storage;", "site data;", "cached browser data;"] },
        { type: "p", text: "through browser or operating-system controls." },
        { type: "p", text: "Doing so may:" },
        {
          type: "ul",
          items: ["sign the user out;", "reset preferences;", "remove locally stored state;", "require the user to authenticate again."],
        },
      ],
    },
    {
      number: 31,
      heading: "Browser Privacy Signals",
      partTitle: "Part XI — Do Not Track and Similar Signals",
      blocks: [
        { type: "p", text: "Browsers and devices may provide privacy signals or tracking-prevention mechanisms." },
        { type: "p", text: "FutureTutor's response to such signals may depend on:" },
        {
          type: "ul",
          items: ["the technology involved;", "applicable law;", "browser capabilities;", "the purposes for which information is processed."],
        },
        {
          type: "p",
          text: "Because FutureTutor does not currently use behavioural advertising or remarketing cookies, some advertising-specific opt-out signals may have limited practical application to the current Platform.",
        },
        {
          type: "p",
          text: "FutureTutor will review its handling of recognized privacy signals if its tracking practices materially change.",
        },
      ],
    },
    {
      number: 32,
      heading: "Information That May Be Associated With Cookies",
      partTitle: "Part XII — Data Generated by Cookies",
      blocks: [
        { type: "p", text: "Depending on the technology, cookies or similar mechanisms may be associated with:" },
        {
          type: "ul",
          items: [
            "session identifiers;",
            "authentication state;",
            "account identifiers;",
            "language preference;",
            "device/browser information;",
            "IP address;",
            "timestamps;",
            "security information;",
            "technical events;",
            "temporary application state.",
          ],
        },
        {
          type: "p",
          text: "Where such information identifies or can reasonably be associated with an individual, FutureTutor handles it in accordance with its Privacy Policy and applicable law.",
        },
      ],
    },
    {
      number: 33,
      heading: "Purpose Limitation",
      blocks: [
        {
          type: "p",
          text: "Information generated through cookies and similar technologies should be used only for legitimate and identified purposes.",
        },
        {
          type: "p",
          text: "FutureTutor does not intend to repurpose essential authentication or security information for unrelated behavioural advertising without appropriate notice and consent where required.",
        },
        {
          type: "p",
          text: "PIPEDA principles require organizations to limit use and disclosure to identified purposes unless further consent or another lawful basis applies.",
        },
      ],
    },
    {
      number: 34,
      heading: "Cookie Duration",
      partTitle: "Part XIII — Retention",
      blocks: [
        { type: "p", text: "Different cookies and browser technologies may remain for different periods." },
        { type: "p", text: "Some may exist only during a browser session." },
        { type: "p", text: "Others may persist for a limited period to maintain authentication, preferences, or security functionality." },
        { type: "p", text: "FutureTutor does not establish fictitious universal expiration periods in this Policy." },
        { type: "p", text: "Actual duration depends on the technology and configuration in use." },
      ],
    },
    {
      number: 35,
      heading: "Retention Principle",
      blocks: [
        {
          type: "p",
          text: "FutureTutor seeks to retain information associated with cookies and similar technologies only for as long as reasonably necessary for the relevant purpose, subject to security, legal, operational, and regulatory requirements.",
        },
        {
          type: "p",
          text: "Canadian privacy principles call on organizations to retain personal information only as long as needed for identified purposes and to establish retention and destruction practices.",
        },
      ],
    },
    {
      number: 36,
      heading: "Processing by Service Providers",
      partTitle: "Part XIV — International Processing",
      blocks: [
        { type: "p", text: "Some service providers supporting FutureTutor may process information outside Canada." },
        {
          type: "p",
          text: "Accordingly, technical information generated through cookies or related technologies may in some circumstances be processed in another jurisdiction and become subject to the laws of that jurisdiction.",
        },
        {
          type: "p",
          text: "Additional information about cross-border processing is provided in the FutureTutor Privacy Policy.",
        },
      ],
    },
    {
      number: 37,
      heading: "Québec Users",
      partTitle: "Part XV — Québec",
      blocks: [
        { type: "p", text: "FutureTutor intends to serve users in Québec." },
        {
          type: "p",
          text: "Where Québec privacy law applies, FutureTutor will take applicable requirements into account when using technologies that collect personal information.",
        },
        { type: "p", text: "This includes requirements relating to:" },
        {
          type: "ul",
          items: [
            "transparency;",
            "necessity;",
            "consent;",
            "privacy by default;",
            "identification technologies;",
            "location technologies;",
            "profiling technologies.",
          ],
        },
        {
          type: "p",
          text: "Québec's privacy regulator emphasizes that necessity must be assessed before consent and that consent, where required, must meet criteria including being manifest, free, informed, specific, understandable, and appropriately distinct.",
        },
      ],
    },
    {
      number: 38,
      heading: "Privacy by Default",
      blocks: [
        {
          type: "p",
          text: "Where required by applicable Québec law, FutureTutor intends to configure privacy settings of public-facing technological products or services to provide a high level of privacy by default.",
        },
        {
          type: "p",
          text: "The Commission d'accès à l'information identifies privacy-by-default requirements among the changes introduced by Québec's privacy reforms.",
        },
      ],
    },
    {
      number: 39,
      heading: "Profiling, Identification and Location",
      blocks: [
        {
          type: "p",
          text: "If FutureTutor introduces technology that enables identification, location, or profiling beyond what is necessary for ordinary Platform operation, FutureTutor will assess applicable disclosure and activation requirements before enabling such functionality.",
        },
        { type: "p", text: "FutureTutor does not currently use cookie-based behavioural profiling for advertising." },
      ],
    },
    {
      number: 40,
      heading: "Future Technologies",
      partTitle: "Part XVI — Changes to Cookie Practices",
      blocks: [
        { type: "p", text: "FutureTutor may change or add technologies as the Platform evolves." },
        { type: "p", text: "Examples could include:" },
        {
          type: "ul",
          items: ["analytics;", "performance monitoring;", "additional fraud-prevention technology;", "optional personalization;", "additional payment technologies."],
        },
        {
          type: "p",
          text: "Before introducing technologies that materially change FutureTutor's privacy practices, FutureTutor will assess applicable notice and consent requirements.",
        },
      ],
    },
    {
      number: 41,
      heading: "Policy Updates",
      blocks: [
        { type: "p", text: "FutureTutor may update this Cookie Policy to reflect:" },
        {
          type: "ul",
          items: ["changes in technology;", "changes to cookies or browser storage;", "new service providers;", "new Platform features;", "legal requirements;", "privacy practices."],
        },
        { type: "p", text: "The Last Updated date at the beginning of this Policy will indicate when it was most recently revised." },
        {
          type: "p",
          text: "Where required by law, FutureTutor will provide additional notice or obtain consent before materially different processing begins.",
        },
      ],
    },
    {
      number: 42,
      heading: "Questions About Cookies",
      partTitle: "Part XVII — Contact",
      blocks: [
        { type: "p", text: "Questions about FutureTutor's use of cookies and similar technologies may be directed to:" },
        {
          type: "p",
          text: "FutureTutor\nOwned and operated by FYRA SERVICES INC.",
        },
        {
          type: "p",
          text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada",
        },
        {
          type: "p",
          text: "Privacy inquiries: legal@futuretutor.ca\nLegal inquiries: legal@futuretutor.ca\nWebsite: futuretutor.ca",
        },
      ],
    },
    {
      number: 43,
      heading: "Privacy Policy",
      partTitle: "Part XVIII — Relationship With Other Policies",
      blocks: [
        { type: "p", text: "The FutureTutor Privacy Policy provides additional information about:" },
        {
          type: "ul",
          items: [
            "personal information FutureTutor collects;",
            "Students;",
            "Parents and Guardians;",
            "Tutors;",
            "minors;",
            "payments;",
            "Virtual Classroom;",
            "in-person tutoring;",
            "location information;",
            "service providers;",
            "retention;",
            "security;",
            "privacy rights;",
            "Québec-specific privacy rights.",
          ],
        },
        {
          type: "p",
          text: "If information collected through a cookie or similar technology constitutes personal information, the Privacy Policy also applies to that information.",
        },
      ],
    },
    {
      number: 44,
      heading: "Terms of Service",
      blocks: [
        { type: "p", text: "Use of FutureTutor is also governed by the FutureTutor Terms of Service." },
        { type: "p", text: "This Cookie Policy does not modify contractual rights or obligations contained in the Terms of Service." },
      ],
    },
    {
      number: 45,
      heading: "Current FutureTutor Position",
      partTitle: "Part XIX — Current Cookie Practices Summary",
      blocks: [
        {
          type: "p",
          text: "As of the Effective Date of this Cookie Policy, FutureTutor's intended cookie posture is:",
        },
        {
          type: "table",
          headers: ["Technology / Purpose", "Current Position"],
          rows: [
            ["Authentication cookies", "Used / necessary where technically applicable"],
            ["Session technologies", "Used / necessary where technically applicable"],
            ["Security technologies", "Used / necessary where technically applicable"],
            ["Language/locale storage", "May be used"],
            ["Functional browser storage", "May be used"],
            ["PWA-related local state", "May be used"],
            ["Continuous GPS tracking", "Not currently used"],
            ["Behavioural advertising cookies", "Not currently used"],
            ["Remarketing cookies", "Not currently used"],
            ["Advertising pixels", "Not currently used"],
            ["Children's behavioural advertising", "Not currently used"],
            ["Routine third-party behavioural analytics", "Not currently represented as used"],
            ["Service-worker private-data caching", "Not currently used"],
          ],
        },
        {
          type: "p",
          text: "This summary reflects FutureTutor's current intended practices and must be kept consistent with the technologies actually deployed on the Platform.",
        },
      ],
    },
    {
      number: 46,
      heading: "Acknowledgement",
      blocks: [
        { type: "p", text: "By using FutureTutor, users acknowledge that they have been provided access to this Cookie Policy." },
        {
          type: "p",
          text: "Where consent is legally required for a particular cookie or similar technology, FutureTutor will provide the applicable consent mechanism before or when required.",
        },
        {
          type: "p",
          text: "Use of strictly necessary technologies may be required for FutureTutor to provide requested Platform functionality, subject to applicable law.",
        },
      ],
    },
  ],
};
