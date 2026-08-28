import type { LegalDocumentContent } from "./types";

/** FG-LEGAL1B — Product-Owner-approved working Privacy Policy V1, integrated
 * faithfully from the approved source text. Remains subject to final
 * external Canadian legal review, per the mission's own instruction. See
 * termsContent.en.ts for the parallel Terms of Service content and the
 * shared LegalDocument rendering component. */
export const PRIVACY_VERSION = "2026-08-30";

export const privacyContentEn: LegalDocumentContent = {
  effectiveDate: "August 30, 2026",
  lastUpdated: "August 30, 2026",
  sections: [
    {
      number: 1,
      heading: "Purpose of This Privacy Policy",
      blocks: [
        {
          type: "p",
          text: "FutureTutor is a tutoring marketplace owned and operated by FYRA SERVICES INC., a corporation federally incorporated in Canada.",
        },
        {
          type: "p",
          text: "This Privacy Policy explains how FYRA SERVICES INC., operating as FutureTutor (“FutureTutor,” “we,” “us,” or “our”), collects, uses, discloses, stores, protects, and otherwise processes personal information when individuals use the FutureTutor website, web application, progressive web application, tutoring marketplace, virtual classroom, and related services (collectively, the “Platform”).",
        },
        {
          type: "p",
          text: "This Privacy Policy should be read together with our Terms of Service and any additional notices provided at the time personal information is collected.",
        },
        {
          type: "p",
          text: "FutureTutor connects Students, Parents or legal Guardians, and Tutors for online and in-person tutoring.",
        },
        {
          type: "p",
          text: "Operating the Platform requires us to process personal information for purposes including:",
        },
        {
          type: "ul",
          items: [
            "account creation;",
            "Tutor verification;",
            "Parent and Guardian authorization;",
            "tutoring requests;",
            "Tutor matching;",
            "bookings;",
            "payments;",
            "virtual tutoring;",
            "in-person tutoring;",
            "customer support;",
            "safety;",
            "fraud prevention;",
            "quality management;",
            "legal compliance; and",
            "Platform administration.",
          ],
        },
        {
          type: "p",
          text: "We are committed to collecting and using personal information only for purposes that a reasonable person would consider appropriate in the circumstances and in accordance with applicable Canadian privacy law.",
        },
        {
          type: "p",
          text: "PIPEDA generally requires private-sector organizations to collect, use, and disclose personal information by fair and lawful means, with consent where required, and only for identified and reasonable purposes.",
        },
      ],
    },
    {
      number: 2,
      heading: "Organization Responsible for Your Personal Information",
      partTitle: "Part I — Accountability",
      blocks: [
        { type: "p", text: "The organization responsible for personal information processed through FutureTutor is:" },
        { type: "p", text: "FYRA SERVICES INC." },
        { type: "p", text: "FutureTutor is a business name and Platform operated by FYRA SERVICES INC." },
        { type: "p", text: "The person designated to oversee FutureTutor's privacy practices may be contacted at:" },
        { type: "p", text: "legal@futuretutor.ca" },
        {
          type: "p",
          text: "FutureTutor may designate additional personnel or service providers to assist in responding to privacy inquiries, but FYRA SERVICES INC. remains responsible for its obligations under applicable law.",
        },
      ],
    },
    {
      number: 3,
      heading: "Privacy Laws",
      blocks: [
        {
          type: "p",
          text: "Depending on the circumstances, FutureTutor's processing of personal information may be subject to privacy legislation including:",
        },
        {
          type: "ul",
          items: [
            "the Personal Information Protection and Electronic Documents Act (PIPEDA);",
            "Alberta's Personal Information Protection Act (PIPA);",
            "Québec's Act respecting the protection of personal information in the private sector;",
            "and other applicable provincial or federal privacy legislation.",
          ],
        },
        { type: "p", text: "Alberta PIPA is the private-sector privacy law applicable to provincially regulated private-sector organizations operating in Alberta." },
        { type: "p", text: "PIPEDA may apply to commercial activities and, in particular, interprovincial or international transfers of personal information where applicable." },
        { type: "p", text: "Nothing in this Policy is intended to reduce rights that applicable law provides to you." },
      ],
    },
    {
      number: 4,
      heading: "Information You Provide Directly",
      partTitle: "Part II — Information We Collect",
      blocks: [
        { type: "p", text: "We may collect information that you provide directly to FutureTutor." },
        { type: "p", text: "Depending on your role, this may include:" },
        {
          type: "p",
          text: "Identity information — first name; last name; preferred name; date of birth or age where required; account role; identity-related information; profile photograph where provided; other information reasonably necessary to identify or manage your account.",
        },
        {
          type: "p",
          text: "Contact information — email address; phone number; mailing address; city; province; postal code; country.",
        },
        {
          type: "p",
          text: "Account information — login credentials; account status; account creation information; language preference; account role; authentication and security information.",
        },
        { type: "p", text: "Passwords are intended to be stored using secure cryptographic techniques rather than in readable form." },
      ],
    },
    {
      number: 5,
      heading: "Student Information",
      blocks: [
        { type: "p", text: "For Students, we may collect information including:" },
        {
          type: "ul",
          items: [
            "name;",
            "age or date of birth;",
            "grade or academic level;",
            "school information;",
            "subjects;",
            "areas where tutoring is requested;",
            "self-assessed difficulty level;",
            "tutoring preferences;",
            "availability;",
            "preferred tutoring mode;",
            "learning objectives;",
            "tutoring request notes;",
            "previous tutoring history on FutureTutor;",
            "session attendance;",
            "booking history;",
            "feedback and ratings;",
            "operational reliability information;",
            "Parent or Guardian relationship;",
            "other information necessary to provide tutoring services.",
          ],
        },
        { type: "p", text: "FutureTutor does not intend Student operational scores to constitute assessments of intelligence, aptitude, personality, or intrinsic academic ability." },
      ],
    },
    {
      number: 6,
      heading: "Parent and Guardian Information",
      blocks: [
        { type: "p", text: "We may collect information about Parents and legal Guardians, including:" },
        {
          type: "ul",
          items: [
            "identity information;",
            "contact details;",
            "relationship to a Student;",
            "account authorization;",
            "linked Student profiles;",
            "consent records;",
            "payment-related information;",
            "tutoring requests;",
            "booking history;",
            "communications;",
            "account permissions;",
            "Guardian invitations and relationship status.",
          ],
        },
        { type: "p", text: "Where multiple Parents or Guardians are connected to a Student, we may maintain records showing who has been authorized to manage that Student." },
      ],
    },
    {
      number: 7,
      heading: "Information About Minors",
      blocks: [
        { type: "p", text: "FutureTutor may provide tutoring services to children and teenagers." },
        { type: "p", text: "We recognize that personal information concerning children and young people requires enhanced care." },
        { type: "p", text: "Where a child cannot provide meaningful consent on their own, FutureTutor requires appropriate consent or authorization from a Parent or legal Guardian." },
        {
          type: "p",
          text: "Canadian privacy regulators have stated that organizations should give particular attention to children's privacy, and the Office of the Privacy Commissioner of Canada has generally considered children under 13 unlikely to be able to meaningfully consent independently except in unusual circumstances.",
        },
        { type: "p", text: "Accordingly, children under 13 using FutureTutor must generally use the Platform through an authorized Parent or legal Guardian." },
        { type: "p", text: "FutureTutor may also restrict the ability of minors to independently:" },
        {
          type: "ul",
          items: [
            "make payments;",
            "provide or change private addresses;",
            "create certain bookings;",
            "manage financial settings;",
            "modify Guardian relationships;",
            "exercise other sensitive account permissions.",
          ],
        },
        { type: "p", text: "Parents and Guardians should provide only information reasonably necessary for tutoring." },
      ],
    },
    {
      number: 8,
      heading: "Tutor Information",
      blocks: [
        { type: "p", text: "We may collect substantial information from individuals applying to become Tutors." },
        { type: "p", text: "This may include:" },
        {
          type: "p",
          text: "Profile information — name; contact information; photograph; biography; languages; tutoring subjects; education; qualifications; experience; availability; tutoring mode; service area.",
        },
        { type: "p", text: "Academic and professional verification — we may collect:" },
        {
          type: "ul",
          items: ["diplomas;", "transcripts;", "certificates;", "educational records;", "professional qualifications;", "supporting documentation;", "issuing institutions;", "verification results."],
        },
        { type: "p", text: "Tutor assessment information — FutureTutor may also collect or generate:" },
        {
          type: "ul",
          items: [
            "interview results;",
            "interview notes;",
            "assessment scores;",
            "training completion information;",
            "examination results;",
            "subject-assessment results;",
            "verification status;",
            "approval status;",
            "quality-review information;",
            "Tutor performance information.",
          ],
        },
        { type: "p", text: "Payment and payout information — we or our payment provider may process:" },
        {
          type: "ul",
          items: [
            "payout account information;",
            "Stripe Connected Account identifiers;",
            "payment status;",
            "transaction information;",
            "payout amounts;",
            "tax-related information where required;",
            "other financial information required to administer Tutor payments.",
          ],
        },
        { type: "p", text: "Full bank or card details may be collected directly by payment processors rather than FutureTutor." },
      ],
    },
    {
      number: 9,
      heading: "Tutor Scores and Ratings",
      blocks: [
        { type: "p", text: "FutureTutor may maintain:" },
        { type: "p", text: "Public Tutor Ratings — these may be based on legitimate feedback provided after eligible sessions." },
        {
          type: "p",
          text: "Internal Tutor Scores — FutureTutor may generate private operational assessments based on information such as qualifications, verification, training, examination results, reliability, attendance, cancellations, Tutor experience, tutoring history, user feedback, and Platform quality measures.",
        },
        { type: "p", text: "These internal scores are intended to support Platform operations and marketplace quality." },
        { type: "p", text: "FutureTutor may also associate confidence levels or version information with internal scores." },
      ],
    },
    {
      number: 10,
      heading: "Student Reliability Information",
      blocks: [
        { type: "p", text: "FutureTutor may maintain an internal Student Reliability Score or similar operational measure." },
        {
          type: "p",
          text: "This information may be based on factors including attendance, cancellations, no-shows, booking conduct, session history, and Tutor feedback concerning operational reliability.",
        },
        { type: "p", text: "This score is: private; operational; not intended to assess intelligence; not intended to assess academic potential; not intended to diagnose any condition." },
        { type: "p", text: "FutureTutor does not currently use Student Reliability Score as a direct customer-pricing factor." },
      ],
    },
    {
      number: 11,
      heading: "Tutoring Request Information",
      partTitle: "Part III — Tutoring Requests and Matching",
      blocks: [
        { type: "p", text: "When tutoring is requested, we may collect:" },
        {
          type: "ul",
          items: ["subject;", "academic level;", "date;", "time;", "duration;", "tutoring mode;", "learning objectives;", "chapters or concepts to review;", "additional notes;", "language preferences;", "availability;", "location where applicable."],
        },
      ],
    },
    {
      number: 12,
      heading: "Matching Information",
      blocks: [
        { type: "p", text: "FutureTutor uses Platform information to identify appropriate Tutors for tutoring requests." },
        { type: "p", text: "Matching may take into account information including:" },
        {
          type: "ul",
          items: [
            "approved Tutor status;",
            "subjects;",
            "academic level;",
            "availability;",
            "tutoring mode;",
            "language;",
            "existing scheduling commitments;",
            "previous tutoring relationships;",
            "Tutor quality indicators;",
            "approximate geographic information;",
            "marketplace availability;",
            "other legitimate matching factors.",
          ],
        },
        { type: "p", text: "FutureTutor may generate a request-specific Match Score or ranking." },
        { type: "p", text: "Match Scores are operational tools and do not guarantee educational results or personal compatibility." },
      ],
    },
    {
      number: 13,
      heading: "Location Information",
      partTitle: "Part IV — In-Person Tutoring and Location Privacy",
      blocks: [
        { type: "p", text: "When an in-person tutoring session is requested, FutureTutor may collect an exact tutoring location." },
        { type: "p", text: "This can include:" },
        { type: "ul", items: ["street address;", "unit or apartment number;", "city;", "province;", "postal code;", "optional Arrival Instructions."] },
        { type: "p", text: "FutureTutor currently does not require continuous GPS tracking to provide ordinary in-person tutoring functionality." },
        { type: "p", text: "If device-based geolocation is introduced in the future, FutureTutor will provide appropriate notice and obtain consent where required before using it." },
      ],
    },
    {
      number: 14,
      heading: "Location Privacy During Matching",
      blocks: [
        { type: "p", text: "FutureTutor is designed to limit disclosure of exact private addresses during open Tutor matching." },
        { type: "p", text: "Before a Booking is confirmed, prospective Tutors may receive only limited or approximate location information, such as:" },
        { type: "ul", items: ["city;", "province;", "neighbourhood or approximate area;", "partial geographic information."] },
        { type: "p", text: "The exact private tutoring address should not be disclosed to every Tutor who receives a matching opportunity." },
      ],
    },
    {
      number: 15,
      heading: "Exact Address Disclosure",
      blocks: [
        { type: "p", text: "Once a Tutor has been selected and the Booking becomes authoritatively confirmed, FutureTutor may disclose the exact tutoring location to the Tutor assigned to that Booking." },
        { type: "p", text: "That Tutor may also receive applicable Arrival Instructions." },
        { type: "p", text: "The purpose of this disclosure is to enable the confirmed Tutor to perform the requested tutoring service." },
        { type: "p", text: "FutureTutor restricts access to location information according to role and Booking status." },
      ],
    },
    {
      number: 16,
      heading: "Arrival Instructions",
      blocks: [
        { type: "p", text: "Arrival Instructions may contain private details necessary to locate or access the tutoring location." },
        { type: "p", text: "Users should not include sensitive information that is unnecessary for the tutoring session." },
        { type: "p", text: "FutureTutor treats Arrival Instructions as private Booking-related information." },
      ],
    },
    {
      number: 17,
      heading: "Virtual Classroom Information",
      partTitle: "Part V — Online Tutoring",
      blocks: [
        { type: "p", text: "FutureTutor provides online tutoring through an integrated Virtual Classroom." },
        { type: "p", text: "To participate, the Platform may process information related to:" },
        {
          type: "ul",
          items: [
            "participant identity;",
            "role;",
            "Booking;",
            "session;",
            "video connection;",
            "microphone status;",
            "camera status;",
            "screen sharing;",
            "participation status;",
            "connection events;",
            "session timing.",
          ],
        },
        { type: "p", text: "FutureTutor currently uses Daily as a technology provider for Virtual Classroom functionality." },
      ],
    },
    {
      number: 18,
      heading: "Camera and Microphone",
      blocks: [
        { type: "p", text: "Camera and microphone access requires permission from the user's device or browser." },
        { type: "p", text: "FutureTutor does not activate device permissions outside the capabilities permitted by the applicable browser or operating system." },
        { type: "p", text: "Users may control their camera and microphone during tutoring sessions subject to Platform functionality." },
      ],
    },
    {
      number: 19,
      heading: "Screen Sharing",
      blocks: [
        { type: "p", text: "Students and Tutors may choose to share their screens during a Virtual Classroom session." },
        { type: "p", text: "Screen sharing may expose information visible on the user's screen." },
        { type: "p", text: "Users are responsible for closing private or unnecessary content before sharing their screen." },
      ],
    },
    {
      number: 20,
      heading: "Recording",
      blocks: [
        { type: "p", text: "FutureTutor does not currently provide routine recording of Virtual Classroom sessions." },
        { type: "p", text: "FutureTutor does not intend to record standard tutoring sessions without appropriate notice and any consent required by law." },
        { type: "p", text: "If recording functionality is introduced in the future, this Privacy Policy and relevant notices will be updated before recording is enabled." },
      ],
    },
    {
      number: 21,
      heading: "Parent and Guardian Observers",
      blocks: [
        { type: "p", text: "Where enabled, an authorized Parent or Guardian may join certain Virtual Classroom sessions as an observer." },
        { type: "p", text: "Observer permissions may be technically restricted." },
        { type: "p", text: "Participation information associated with an observer may be processed to manage authorized access and session security." },
      ],
    },
    {
      number: 22,
      heading: "Booking Information",
      partTitle: "Part VI — Bookings and Session Information",
      blocks: [
        { type: "p", text: "We may collect information relating to:" },
        {
          type: "ul",
          items: [
            "tutoring request;",
            "matched Tutor;",
            "Student;",
            "Parent or Guardian;",
            "scheduled date and time;",
            "tutoring mode;",
            "price;",
            "Tutor payout;",
            "payment state;",
            "Booking status;",
            "cancellations;",
            "refunds;",
            "session completion;",
            "location snapshot for in-person sessions.",
          ],
        },
        { type: "p", text: "Certain Booking information is maintained as a historical record of the transaction." },
      ],
    },
    {
      number: 23,
      heading: "Attendance and Check-In",
      blocks: [
        { type: "p", text: "FutureTutor may record:" },
        { type: "ul", items: ["Tutor check-in;", "Student check-in;", "timestamps;", "session start;", "session completion;", "no-show status;", "relevant session lifecycle events."] },
        { type: "p", text: "We use this information for purposes including:" },
        { type: "ul", items: ["administering tutoring sessions;", "resolving disputes;", "applying cancellation rules;", "determining Tutor payouts;", "addressing no-shows;", "maintaining Platform reliability."] },
      ],
    },
    {
      number: 24,
      heading: "Customer Payments",
      partTitle: "Part VII — Payments",
      blocks: [
        { type: "p", text: "FutureTutor uses third-party payment providers, currently including Stripe, to process payments." },
        { type: "p", text: "Payment information processed may include:" },
        {
          type: "ul",
          items: [
            "customer name;",
            "billing information;",
            "transaction amount;",
            "payment authorization;",
            "PaymentIntent identifiers;",
            "payment status;",
            "refunds;",
            "payment-method metadata;",
            "other transaction information.",
          ],
        },
        { type: "p", text: "Payment card information may be submitted directly to Stripe and may not be stored in full by FutureTutor." },
      ],
    },
    {
      number: 25,
      heading: "Tutor Payouts",
      blocks: [
        { type: "p", text: "FutureTutor may use Stripe Connect or related payment infrastructure to administer Tutor payouts." },
        { type: "p", text: "Information related to Tutor payouts may include:" },
        {
          type: "ul",
          items: ["Tutor account identifiers;", "Connected Account identifiers;", "payout status;", "payout amount;", "payment history;", "tax or identity information required by Stripe or applicable law."],
        },
        { type: "p", text: "Stripe may independently collect information required to verify connected accounts." },
      ],
    },
    {
      number: 26,
      heading: "Customer Pricing Information",
      blocks: [
        { type: "p", text: "FutureTutor may create and retain records concerning:" },
        { type: "ul", items: ["customer price;", "pricing components;", "applicable adjustments;", "taxes;", "rule or pricing version;", "booking-specific pricing snapshot."] },
        { type: "p", text: "This information is used to maintain transaction integrity and resolve disputes." },
      ],
    },
    {
      number: 27,
      heading: "Tutor Compensation Information",
      blocks: [
        { type: "p", text: "FutureTutor may retain records concerning:" },
        { type: "ul", items: ["Tutor payout;", "payout rules;", "incentives;", "travel considerations;", "qualifications or tier information relevant to the payout;", "Booking-specific payout snapshot."] },
        { type: "p", text: "Customer price and Tutor payout are calculated independently." },
      ],
    },
    {
      number: 28,
      heading: "Purposes of Collection and Use",
      partTitle: "Part VIII — How We Use Personal Information",
      blocks: [
        { type: "p", text: "FutureTutor may use personal information to:" },
        {
          type: "ul",
          items: [
            "create and authenticate accounts;",
            "maintain user profiles;",
            "verify identity;",
            "verify Tutor qualifications;",
            "administer Tutor interviews and assessments;",
            "approve or reject Tutor applications;",
            "manage Student and Parent relationships;",
            "obtain Guardian authorization;",
            "provide tutoring;",
            "match Students with Tutors;",
            "manage Quick Match;",
            "create Bookings;",
            "process payments;",
            "process Tutor payouts;",
            "administer cancellations and refunds;",
            "provide Virtual Classroom functionality;",
            "manage in-person tutoring;",
            "disclose confirmed tutoring addresses to authorized Tutors;",
            "manage attendance;",
            "detect no-shows;",
            "provide customer support;",
            "communicate service information;",
            "maintain Platform safety;",
            "detect fraud or abuse;",
            "enforce Terms;",
            "resolve disputes;",
            "improve reliability;",
            "troubleshoot technical issues;",
            "maintain security;",
            "satisfy tax, accounting, and regulatory requirements;",
            "comply with applicable law.",
          ],
        },
      ],
    },
    {
      number: 29,
      heading: "Consent",
      blocks: [
        { type: "p", text: "Where consent is required, FutureTutor seeks consent that is meaningful and appropriate to the sensitivity of the information and the circumstances." },
        {
          type: "p",
          text: "Canadian privacy guidance emphasizes that individuals should understand key elements such as what personal information is being collected, the purposes for which it will be used, the parties to whom it may be disclosed, and meaningful risks or consequences.",
        },
        { type: "p", text: "Consent may be:" },
        { type: "ul", items: ["express;", "implied where legally permitted;", "provided by an authorized Parent or Guardian;", "otherwise obtained in accordance with applicable law."] },
        { type: "p", text: "Some processing may be permitted or required without consent under applicable legislation." },
      ],
    },
    {
      number: 30,
      heading: "Withdrawing Consent",
      blocks: [
        { type: "p", text: "Where processing is based on consent, you may withdraw consent subject to:" },
        { type: "ul", items: ["legal restrictions;", "contractual requirements;", "reasonable notice;", "information FutureTutor must retain to complete existing transactions or comply with law."] },
        { type: "p", text: "Withdrawal may prevent FutureTutor from continuing to provide certain Platform functions." },
        { type: "p", text: "FutureTutor will explain material consequences of withdrawal where appropriate." },
      ],
    },
    {
      number: 31,
      heading: "Other Platform Users",
      partTitle: "Part IX — Disclosure of Personal Information",
      blocks: [
        { type: "p", text: "FutureTutor may disclose limited personal information between Platform participants where necessary to facilitate tutoring." },
        { type: "p", text: "For example:" },
        {
          type: "p",
          text: "A Student or Parent may receive Tutor name; profile; qualifications; ratings; relevant availability; other information intended to help select or identify the Tutor.",
        },
        {
          type: "p",
          text: "A prospective Tutor may receive tutoring subject; academic level; requested date/time; tutoring mode; approximate location where applicable; limited information reasonably necessary to evaluate the request.",
        },
        {
          type: "p",
          text: "A confirmed Tutor may receive Student information reasonably necessary to provide tutoring; confirmed session details; exact in-person tutoring address where applicable; Arrival Instructions where applicable.",
        },
        { type: "p", text: "FutureTutor seeks to limit disclosures to what is reasonably necessary for the transaction." },
      ],
    },
    {
      number: 32,
      heading: "Service Providers",
      blocks: [
        { type: "p", text: "FutureTutor may disclose personal information to service providers that perform services on our behalf." },
        { type: "p", text: "These providers may include companies providing:" },
        { type: "ul", items: ["cloud infrastructure;", "database hosting;", "payments;", "video communications;", "email delivery;", "application hosting;", "logging;", "security;", "technical support."] },
        { type: "p", text: "Known providers currently used by FutureTutor include:" },
        {
          type: "ul",
          items: [
            "Stripe — payment processing and Tutor payout infrastructure;",
            "Daily — Virtual Classroom/video infrastructure;",
            "Resend — transactional email delivery;",
            "Railway — application/infrastructure hosting;",
            "Supabase — database infrastructure.",
          ],
        },
        { type: "p", text: "Service providers receive information only as reasonably necessary to perform the services for which FutureTutor engages them, subject to applicable contractual and legal safeguards." },
      ],
    },
    {
      number: 33,
      heading: "Legal Disclosures",
      blocks: [
        { type: "p", text: "FutureTutor may disclose personal information where permitted or required by law, including where reasonably necessary to:" },
        {
          type: "ul",
          items: ["comply with a court order;", "respond to lawful government requests;", "investigate fraud;", "protect individuals from serious harm;", "protect a minor;", "respond to emergencies;", "enforce legal rights;", "investigate serious Platform misconduct."],
        },
        { type: "p", text: "Where appropriate and legally permitted, FutureTutor will seek to limit such disclosures to the information reasonably necessary." },
      ],
    },
    {
      number: 34,
      heading: "Corporate Transactions",
      blocks: [
        { type: "p", text: "Personal information may be disclosed in connection with:" },
        { type: "ul", items: ["financing;", "investment;", "corporate reorganization;", "merger;", "acquisition;", "sale of business assets;", "due diligence."] },
        { type: "p", text: "Where required by law, appropriate safeguards and confidentiality restrictions will apply." },
      ],
    },
    {
      number: 35,
      heading: "We Do Not Sell Personal Information as a Data Product",
      blocks: [
        { type: "p", text: "FutureTutor does not currently sell Students', Parents', Guardians', or Tutors' personal information as a standalone commercial data product." },
        { type: "p", text: "FutureTutor does not currently use children's personal information for behavioural advertising." },
        { type: "p", text: "If FutureTutor materially changes these practices in the future, we will update this Privacy Policy and obtain consent where required." },
      ],
    },
    {
      number: 36,
      heading: "Transactional Communications",
      partTitle: "Part X — Communications",
      blocks: [
        { type: "p", text: "FutureTutor may send service-related communications concerning:" },
        {
          type: "ul",
          items: ["account creation;", "password recovery;", "security;", "Bookings;", "Tutor matching;", "payments;", "cancellations;", "refunds;", "administrative invitations;", "account status;", "Platform changes;", "safety;", "customer support."],
        },
        { type: "p", text: "Transactional communications may be necessary to provide the Platform and may not always be optional." },
      ],
    },
    {
      number: 37,
      heading: "Marketing Communications",
      blocks: [
        { type: "p", text: "FutureTutor does not intend to treat essential transactional messages as marketing messages." },
        { type: "p", text: "Where FutureTutor sends commercial electronic messages for marketing purposes, we will obtain and manage consent as required by applicable law and provide an unsubscribe mechanism where required." },
      ],
    },
    {
      number: 38,
      heading: "Cookies",
      partTitle: "Part XI — Cookies and Technologies",
      blocks: [
        { type: "p", text: "FutureTutor may use cookies, browser storage, session identifiers, or similar technologies necessary to:" },
        {
          type: "ul",
          items: ["authenticate users;", "maintain sessions;", "protect accounts;", "remember preferences;", "support language selection;", "provide security;", "operate essential Platform functionality."],
        },
        { type: "p", text: "FutureTutor may provide additional details in a separate Cookie Policy." },
      ],
    },
    {
      number: 39,
      heading: "Analytics",
      blocks: [
        { type: "p", text: "FutureTutor may use limited technical information to understand system performance and troubleshoot the Platform." },
        { type: "p", text: "If FutureTutor introduces additional analytics, advertising, remarketing, or cross-site tracking technologies, this Privacy Policy and Cookie Policy will be updated where required." },
        { type: "p", text: "FutureTutor does not currently represent that it uses behavioural advertising or remarketing services unless they are specifically introduced." },
      ],
    },
    {
      number: 40,
      heading: "Automatically Collected Information",
      partTitle: "Part XII — Technical Information",
      blocks: [
        { type: "p", text: "When users access FutureTutor, technical systems may automatically collect information such as:" },
        {
          type: "ul",
          items: [
            "IP address;",
            "browser type;",
            "operating system;",
            "device type;",
            "request timestamps;",
            "application logs;",
            "session identifiers;",
            "security events;",
            "authentication events;",
            "error information;",
            "performance information.",
          ],
        },
        { type: "p", text: "This information may constitute personal information where it can identify or be associated with an individual." },
      ],
    },
    {
      number: 41,
      heading: "Purposes for Technical Information",
      blocks: [
        { type: "p", text: "Technical information may be used to:" },
        {
          type: "ul",
          items: ["operate the Platform;", "authenticate users;", "detect security incidents;", "prevent fraud;", "diagnose failures;", "maintain reliability;", "protect accounts;", "investigate misuse;", "support users."],
        },
      ],
    },
    {
      number: 42,
      heading: "Processing Outside Canada",
      partTitle: "Part XIII — International Processing",
      blocks: [
        { type: "p", text: "Some FutureTutor service providers may process or store personal information outside Canada." },
        {
          type: "p",
          text: "As a result, personal information may be subject to the laws of the jurisdiction where it is processed and may be accessible to courts, law enforcement, or government authorities in accordance with those laws.",
        },
        { type: "p", text: "FutureTutor remains responsible for personal information transferred to service providers to the extent required by applicable Canadian privacy law." },
        { type: "p", text: "Where appropriate, FutureTutor uses contractual or organizational measures designed to protect transferred information." },
      ],
    },
    {
      number: 43,
      heading: "How Long We Retain Personal Information",
      partTitle: "Part XIV — Retention",
      blocks: [
        { type: "p", text: "FutureTutor retains personal information only for as long as reasonably necessary for:" },
        {
          type: "ul",
          items: [
            "the purposes described in this Policy;",
            "operation of an active account;",
            "performance of tutoring services;",
            "transaction history;",
            "payment reconciliation;",
            "Tutor payout administration;",
            "tax and accounting requirements;",
            "dispute resolution;",
            "safety investigations;",
            "fraud prevention;",
            "legal claims;",
            "regulatory requirements.",
          ],
        },
        { type: "p", text: "Different types of information may have different retention periods." },
      ],
    },
    {
      number: 44,
      heading: "Account Deletion",
      blocks: [
        { type: "p", text: "Users may request account deletion or deletion of personal information by contacting:" },
        { type: "p", text: "legal@futuretutor.ca" },
        { type: "p", text: "Deletion requests are subject to information FutureTutor is permitted or required to retain." },
        { type: "p", text: "For example, we may need to retain certain:" },
        { type: "ul", items: ["financial records;", "tax records;", "Booking records;", "fraud-prevention records;", "legal or dispute records;", "safety records;", "consent records."] },
        { type: "p", text: "FutureTutor may delete, anonymize, or securely archive information once retention is no longer necessary." },
      ],
    },
    {
      number: 45,
      heading: "Minor Data Retention",
      blocks: [
        { type: "p", text: "FutureTutor intends to apply particular caution to information concerning minors." },
        { type: "p", text: "Information concerning a minor should not be retained indefinitely merely because the user was once registered on the Platform." },
        { type: "p", text: "Legal counsel should validate FutureTutor's formal retention schedule before broad public launch." },
      ],
    },
    {
      number: 46,
      heading: "Security Safeguards",
      partTitle: "Part XV — Security",
      blocks: [
        { type: "p", text: "FutureTutor uses administrative, technical, and organizational safeguards designed to protect personal information from risks including:" },
        { type: "ul", items: ["unauthorized access;", "unauthorized disclosure;", "loss;", "misuse;", "alteration;", "destruction."] },
        { type: "p", text: "Safeguards may include:" },
        {
          type: "ul",
          items: [
            "access controls;",
            "authentication;",
            "password hashing;",
            "role-based authorization;",
            "protected server-side operations;",
            "encrypted network communications;",
            "secret-management controls;",
            "restricted access to private address information;",
            "webhook signature verification;",
            "database controls;",
            "monitoring and logging;",
            "payment-provider security measures.",
          ],
        },
        { type: "p", text: "No system is completely secure, and FutureTutor cannot guarantee absolute security." },
      ],
    },
    {
      number: 47,
      heading: "Access Controls",
      blocks: [
        { type: "p", text: "FutureTutor seeks to limit access to personal information according to legitimate business and Platform roles." },
        { type: "p", text: "For example:" },
        {
          type: "ul",
          items: [
            "prospective Tutors should not receive exact private addresses during open matching;",
            "unrelated Tutors should not access another Booking's private location information;",
            "Guardian-managed Student actions may be restricted;",
            "administrative access is role-controlled.",
          ],
        },
      ],
    },
    {
      number: 48,
      heading: "Payment Security",
      blocks: [
        { type: "p", text: "FutureTutor uses third-party payment processors to reduce the need for FutureTutor to directly handle full card information." },
        { type: "p", text: "FutureTutor does not intend to store complete payment-card numbers where Stripe or another compliant provider directly processes those details." },
      ],
    },
    {
      number: 49,
      heading: "Security Incidents",
      partTitle: "Part XVI — Privacy Breaches",
      blocks: [
        { type: "p", text: "FutureTutor maintains procedures intended to identify, assess, contain, and respond to privacy and security incidents." },
        { type: "p", text: "Where an incident involving personal information occurs, FutureTutor may:" },
        {
          type: "ul",
          items: ["investigate the incident;", "contain the incident;", "assess affected information;", "assess potential harm;", "notify affected individuals;", "notify privacy regulators;", "retain required breach records;", "take remediation measures."],
        },
      ],
    },
    {
      number: 50,
      heading: "Breach Notification",
      blocks: [
        { type: "p", text: "Where applicable law requires notification or reporting, FutureTutor will comply with those requirements." },
        { type: "p", text: "Under PIPEDA, organizations subject to the Act must report certain breaches of security safeguards where there is a real risk of significant harm and notify affected individuals as required." },
        { type: "p", text: "Different provincial requirements may also apply." },
      ],
    },
    {
      number: 51,
      heading: "Access to Personal Information",
      partTitle: "Part XVII — Your Privacy Rights",
      blocks: [
        { type: "p", text: "Subject to applicable law, individuals may request access to personal information FutureTutor holds about them." },
        { type: "p", text: "FutureTutor may ask for information reasonably necessary to verify identity before providing access." },
        { type: "p", text: "Certain exceptions may apply, including information involving:" },
        { type: "ul", items: ["another individual's privacy;", "solicitor-client privilege;", "confidential commercial information;", "legal restrictions;", "safety concerns."] },
      ],
    },
    {
      number: 52,
      heading: "Correction",
      blocks: [
        { type: "p", text: "If personal information held by FutureTutor is inaccurate or incomplete, you may request correction." },
        { type: "p", text: "Where appropriate, FutureTutor will correct or annotate the information." },
      ],
    },
    {
      number: 53,
      heading: "Withdrawal of Consent",
      blocks: [
        { type: "p", text: "Where legally applicable, you may request withdrawal of consent for future processing." },
        { type: "p", text: "See Section 30." },
      ],
    },
    {
      number: 54,
      heading: "Deletion",
      blocks: [
        { type: "p", text: "You may request deletion of eligible personal information." },
        { type: "p", text: "FutureTutor will evaluate requests subject to applicable legal, transactional, safety, and retention requirements." },
      ],
    },
    {
      number: 55,
      heading: "Data Portability and Other Rights",
      blocks: [
        { type: "p", text: "Certain jurisdictions may provide additional rights concerning:" },
        {
          type: "ul",
          items: ["portability;", "automated decision-making;", "disclosure;", "correction;", "de-indexation;", "cessation of dissemination;", "withdrawal of consent."],
        },
        { type: "p", text: "FutureTutor will respond to valid requests as required by applicable law." },
      ],
    },
    {
      number: 56,
      heading: "Québec Residents",
      partTitle: "Part XVIII — Québec Privacy Rights",
      blocks: [
        { type: "p", text: "Residents of Québec may have additional rights under Québec privacy legislation." },
        { type: "p", text: "Subject to applicable requirements and exceptions, these may include rights concerning:" },
        {
          type: "ul",
          items: [
            "access;",
            "correction;",
            "withdrawal of consent;",
            "cessation of dissemination;",
            "de-indexation or re-indexation in certain circumstances;",
            "portability where applicable;",
            "information concerning automated decision-making where applicable.",
          ],
        },
        { type: "p", text: "FutureTutor will apply mandatory Québec privacy protections to eligible Québec residents." },
      ],
    },
    {
      number: 57,
      heading: "Privacy Impact Assessments",
      blocks: [
        {
          type: "p",
          text: "Where required by Québec law or otherwise appropriate, FutureTutor may conduct privacy impact assessments for projects involving personal information.",
        },
        { type: "p", text: "This may include evaluation of information systems, service providers, technology changes, or transfers of information outside Québec where applicable." },
      ],
    },
    {
      number: 58,
      heading: "Québec Privacy Responsibility",
      blocks: [
        {
          type: "p",
          text: "The person exercising the highest authority within FYRA SERVICES INC., or another appropriately delegated person, may exercise functions required by applicable Québec privacy legislation.",
        },
        { type: "p", text: "Privacy inquiries may be submitted to:" },
        { type: "p", text: "legal@futuretutor.ca" },
        { type: "p", text: "This clause should be validated by Québec counsel before public launch to ensure the formal privacy-officer designation and publication requirements are properly implemented." },
      ],
    },
    {
      number: 59,
      heading: "Special Protection for Children",
      partTitle: "Part XIX — Children's Privacy",
      blocks: [
        { type: "p", text: "FutureTutor recognizes children and youth as a population requiring heightened privacy protection." },
        { type: "p", text: "We seek to:" },
        {
          type: "ul",
          items: [
            "limit collection to information reasonably necessary for tutoring;",
            "use information for understandable and legitimate purposes;",
            "avoid behavioural advertising directed at children;",
            "use Parent or Guardian authorization where appropriate;",
            "limit private-address disclosure;",
            "protect tutoring-session information;",
            "avoid unnecessary public disclosure;",
            "provide reasonable privacy information to Parents and Guardians.",
          ],
        },
        { type: "p", text: "Canadian privacy regulators have increasingly emphasized privacy-by-design and children's best interests in digital and educational environments." },
      ],
    },
    {
      number: 60,
      heading: "Children Under 13",
      blocks: [
        { type: "p", text: "A child under 13 should not independently create or operate an unrestricted FutureTutor account." },
        { type: "p", text: "FutureTutor requires appropriate Parent or Guardian involvement and consent for such users, except where applicable law permits another arrangement." },
        { type: "p", text: "Where FutureTutor learns that personal information was collected from a child contrary to Platform requirements, we may:" },
        { type: "ul", items: ["suspend the account;", "seek Parent or Guardian authorization;", "restrict functionality;", "delete information where appropriate."] },
      ],
    },
    {
      number: 61,
      heading: "Parent and Guardian Requests",
      blocks: [
        { type: "p", text: "An authorized Parent or legal Guardian may contact FutureTutor regarding information associated with a Guardian-managed child." },
        { type: "p", text: "FutureTutor may verify identity and authority before providing access or making changes." },
        { type: "p", text: "FutureTutor may also need to consider the minor's own privacy interests depending on age, capacity, applicable law, and circumstances." },
      ],
    },
    {
      number: 62,
      heading: "Matching and Scoring Systems",
      partTitle: "Part XX — Automated and Rule-Based Decisions",
      blocks: [
        { type: "p", text: "FutureTutor uses software and rules to help:" },
        {
          type: "ul",
          items: ["rank Tutors;", "match tutoring requests;", "calculate customer prices;", "determine Tutor payouts;", "maintain operational reliability information;", "administer Platform workflows."],
        },
        { type: "p", text: "These systems may use personal information." },
        { type: "p", text: "FutureTutor does not currently use artificial intelligence to independently make general educational judgments about Students." },
      ],
    },
    {
      number: 63,
      heading: "Match Score",
      blocks: [
        { type: "p", text: "FutureTutor may calculate a Match Score using factors such as:" },
        { type: "ul", items: ["Tutor eligibility;", "subject;", "academic level;", "availability;", "mode;", "language;", "scheduling conflicts;", "quality indicators;", "approximate location where relevant."] },
        { type: "p", text: "This score assists in determining which eligible Tutor receives an opportunity." },
      ],
    },
    {
      number: 64,
      heading: "Pricing",
      blocks: [
        { type: "p", text: "FutureTutor may automatically calculate customer pricing using transactional factors." },
        { type: "p", text: "The Student Reliability Score is not currently used as a direct pricing factor." },
        { type: "p", text: "Pricing information is presented before the user commits to a paid Booking." },
      ],
    },
    {
      number: 65,
      heading: "Human Review",
      blocks: [
        { type: "p", text: "Where appropriate, FutureTutor may permit administrative review or correction of certain decisions or records, particularly where:" },
        { type: "ul", items: ["information is inaccurate;", "fraud is suspected;", "a technical error occurred;", "a safety issue exists;", "exceptional circumstances justify review."] },
      ],
    },
    {
      number: 66,
      heading: "Third-Party Services",
      partTitle: "Part XXI — Third-Party Links and Services",
      blocks: [
        { type: "p", text: "The Platform may contain links or integrations involving third parties." },
        { type: "p", text: "Third parties have their own privacy practices." },
        {
          type: "p",
          text: "FutureTutor's Privacy Policy does not govern information independently collected by another organization where that organization is acting for its own purposes rather than as FutureTutor's service provider.",
        },
        { type: "p", text: "Users should review relevant third-party policies where appropriate." },
      ],
    },
    {
      number: 67,
      heading: "Updates",
      partTitle: "Part XXII — Changes to This Policy",
      blocks: [
        { type: "p", text: "FutureTutor may update this Privacy Policy to reflect:" },
        { type: "ul", items: ["changes to the Platform;", "new services;", "legal requirements;", "security practices;", "service providers;", "privacy practices."] },
        { type: "p", text: "The effective date and last-updated date will appear at the top of the Policy." },
        { type: "p", text: "Where changes are material, FutureTutor will provide notice or obtain consent where required by law." },
      ],
    },
    {
      number: 68,
      heading: "Contact FutureTutor",
      partTitle: "Part XXIII — Contact and Complaints",
      blocks: [
        { type: "p", text: "Questions, access requests, correction requests, deletion requests, or other privacy inquiries may be directed to:" },
        { type: "p", text: "FutureTutor — owned and operated by FYRA SERVICES INC." },
        { type: "p", text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada" },
        { type: "p", text: "Privacy: legal@futuretutor.ca" },
        { type: "p", text: "Legal: legal@futuretutor.ca" },
        { type: "p", text: "Website: futuretutor.ca" },
      ],
    },
    {
      number: 69,
      heading: "Complaints",
      blocks: [
        { type: "p", text: "If you have a privacy concern, we encourage you to contact FutureTutor first so that we can investigate and respond." },
        { type: "p", text: "You may also have the right to contact the applicable privacy regulator, including, depending on jurisdiction:" },
        {
          type: "ul",
          items: [
            "the Office of the Privacy Commissioner of Canada;",
            "the Office of the Information and Privacy Commissioner of Alberta;",
            "the Commission d'accès à l'information du Québec;",
            "another applicable provincial privacy authority.",
          ],
        },
      ],
    },
    {
      number: 70,
      heading: "Acknowledgement",
      partTitle: "Part XXIV — Acknowledgement",
      blocks: [
        { type: "p", text: "By using FutureTutor, you acknowledge that you have been provided access to this Privacy Policy." },
        { type: "p", text: "Where consent is required, FutureTutor will request consent through the appropriate Platform process." },
        { type: "p", text: "If you are a Parent or legal Guardian providing consent on behalf of a minor, you represent that you have the authority to do so." },
      ],
    },
  ],
};
