import type { LegalDocumentContent } from "./types";

/** FG-LEGAL1A — Product-Owner-approved working Terms of Service, integrated
 * faithfully from the approved source text. The only substantive departures
 * from the approved source are the two explicitly-requested Québec/Law 96
 * adjustments (Governing Law, §54; Language, §61) and filling in the
 * previously-bracketed placeholders (entity name, address, dates) with the
 * now-confirmed official business information. Remains subject to final
 * external legal review, per the mission's own instruction.
 */
export const TERMS_VERSION = "2026-08-30";

export const termsContentEn: LegalDocumentContent = {
  effectiveDate: "August 30, 2026",
  lastUpdated: "August 30, 2026",
  sections: [
    {
      number: 1,
      heading: "About FutureTutor",
      blocks: [
        {
          type: "p",
          text: "These Terms of Service (“Terms”) constitute a legally binding agreement between you and FYRA SERVICES INC., a corporation incorporated under the laws of Canada (“FutureTutor,” “we,” “us,” or “our”).",
        },
        {
          type: "p",
          text: "These Terms govern your access to and use of the FutureTutor website, web application, progressive web application, related services, communications, tutoring marketplace, virtual classroom, and any other services made available by FutureTutor (collectively, the “Platform”).",
        },
        { type: "p", text: "Please read these Terms carefully." },
        {
          type: "p",
          text: "By creating an account, accessing or using the Platform, requesting or providing tutoring services, making or receiving a payment through the Platform, or otherwise using the Services, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.",
        },
        { type: "p", text: "If you do not agree to these Terms, you must not use the Platform." },
        {
          type: "p",
          text: "FutureTutor operates a technology-enabled tutoring marketplace that facilitates connections between students, parents or legal guardians, and tutors.",
        },
        { type: "p", text: "Through the Platform, eligible users may, among other things:" },
        {
          type: "ul",
          items: [
            "create and manage accounts and profiles;",
            "create or manage student profiles;",
            "request tutoring services;",
            "be matched with eligible tutors;",
            "browse tutors where available;",
            "schedule tutoring sessions;",
            "participate in online tutoring sessions;",
            "arrange in-person tutoring sessions;",
            "make and receive payments;",
            "manage bookings;",
            "provide ratings or feedback;",
            "receive Platform communications; and",
            "use other functionality made available by FutureTutor.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor may determine which features are available to particular users, account types, geographic regions, or stages of the Platform.",
        },
      ],
    },
    {
      number: 2,
      heading: "Nature of the Marketplace",
      blocks: [
        {
          type: "p",
          text: "FutureTutor facilitates the organization and delivery of tutoring services through a managed marketplace.",
        },
        {
          type: "p",
          text: "Unless otherwise required by applicable law or expressly agreed in writing, Tutors provide tutoring services as independent service providers and are not employees of FutureTutor solely by virtue of using the Platform.",
        },
        {
          type: "p",
          text: "Unless otherwise required by applicable law or expressly agreed in writing, nothing in these Terms creates a partnership, joint venture, fiduciary relationship, franchise, or agency relationship between a Tutor and a Student or Parent.",
        },
        {
          type: "p",
          text: "The precise legal relationship between FutureTutor and Tutors, including contractor classification, taxation, payment administration, and other obligations, may also be governed by a separate Tutor Agreement made available to Tutors.",
        },
        {
          type: "p",
          text: "FutureTutor may establish and enforce marketplace standards relating to Tutor eligibility, verification, pricing, matching, quality, safety, payment processing, cancellations, and other aspects of the Platform.",
        },
      ],
    },
    {
      number: 3,
      heading: "Eligibility",
      blocks: [
        {
          type: "p",
          text: "You may use the Platform only if you are legally capable of entering into the agreement applicable to your use of the Platform or are using the Platform through an authorized Parent or Guardian as permitted by FutureTutor.",
        },
        { type: "p", text: "You must provide accurate information regarding your identity, age, role, and authority." },
        { type: "p", text: "FutureTutor may refuse, restrict, suspend, or terminate access where eligibility requirements are not satisfied." },
      ],
    },
    {
      number: 4,
      heading: "Children and Minors",
      blocks: [
        { type: "p", text: "FutureTutor may provide tutoring services to minors." },
        {
          type: "p",
          text: "The Platform distinguishes, where applicable, between independently managed Student accounts and Student profiles managed by a Parent or legal Guardian.",
        },
        {
          type: "p",
          text: "A child who does not have the legal or practical capacity to provide meaningful consent or enter into the relevant agreement must use FutureTutor through an authorized Parent or legal Guardian.",
        },
        {
          type: "p",
          text: "In particular, FutureTutor requires a Parent or legal Guardian to provide or authorize the required consent for a child under 13, except where FutureTutor determines that another approach is legally permitted and appropriate.",
        },
        {
          type: "p",
          text: "This reflects Canadian privacy guidance, under which parental or guardian consent should be obtained when a child cannot provide meaningful consent; the Office of the Privacy Commissioner of Canada generally takes the position that this includes children under 13, subject to exceptional circumstances.",
        },
        { type: "p", text: "FutureTutor may impose additional restrictions on minor accounts, including restrictions relating to:" },
        {
          type: "ul",
          items: [
            "payments;",
            "tutoring requests;",
            "in-person tutoring locations;",
            "changes to private location information;",
            "account administration;",
            "consent;",
            "communications; and",
            "other safety-sensitive activities.",
          ],
        },
        { type: "p", text: "A Parent or Guardian who creates or manages a Student profile represents and warrants that they have lawful authority to act on behalf of that Student." },
        { type: "p", text: "FutureTutor may request reasonable evidence of that authority." },
      ],
    },
    {
      number: 5,
      heading: "Parent and Guardian Accounts",
      blocks: [
        { type: "p", text: "Parents and legal Guardians may create and manage Student profiles as permitted by the Platform." },
        { type: "p", text: "A Parent or Guardian may be required to:" },
        {
          type: "ul",
          items: [
            "provide information about the Student;",
            "authorize tutoring requests;",
            "provide payment;",
            "select online or in-person tutoring;",
            "provide tutoring locations;",
            "provide relevant consent;",
            "manage bookings; and",
            "exercise other permissions associated with a guardian-managed Student.",
          ],
        },
        { type: "p", text: "Where multiple Parents or Guardians are associated with a Student, their permissions may depend on the relationship and authorization status recorded by the Platform." },
        { type: "p", text: "Users must not falsely claim parental or guardianship authority." },
        { type: "p", text: "FutureTutor may revoke or restrict a Parent-Student or Guardian-Student relationship where authorization is withdrawn, disputed, expired, fraudulent, or otherwise invalid." },
      ],
    },
    {
      number: 6,
      heading: "Account Registration",
      blocks: [
        { type: "p", text: "Certain Platform features require an account." },
        { type: "p", text: "You agree to:" },
        {
          type: "ul",
          items: [
            "provide accurate, current, and complete information;",
            "maintain the accuracy of that information;",
            "maintain the confidentiality of your credentials;",
            "use reasonable security measures to protect your account;",
            "not share credentials with unauthorized persons; and",
            "notify FutureTutor promptly if you suspect unauthorized access.",
          ],
        },
        { type: "p", text: "You are responsible for activity conducted through your account to the extent permitted by applicable law." },
        { type: "p", text: "You may not impersonate another person, create fraudulent accounts, or misrepresent your identity, qualifications, age, or authority." },
      ],
    },
    {
      number: 7,
      heading: "Account Types",
      blocks: [
        { type: "p", text: "FutureTutor may provide account types including:" },
        { type: "ul", items: ["Student;", "Parent or Guardian;", "Tutor;", "Administrator; and", "other account types introduced by FutureTutor."] },
        { type: "p", text: "Different permissions and obligations apply to different account types." },
        { type: "p", text: "Possession of an account does not automatically provide access to all Platform functionality." },
      ],
    },
    {
      number: 8,
      heading: "Tutor Application and Approval",
      partTitle: "Part II — Tutors",
      blocks: [
        { type: "p", text: "Tutors are subject to FutureTutor's eligibility and approval process." },
        { type: "p", text: "Depending on the Platform's current requirements, this may include:" },
        {
          type: "ul",
          items: [
            "identity and profile information;",
            "educational information;",
            "academic records;",
            "diplomas;",
            "certifications;",
            "supporting documentation;",
            "administrative review;",
            "interviews;",
            "training modules;",
            "examinations;",
            "subject assessments;",
            "verification procedures;",
            "quality assessments; and",
            "other reasonable requirements.",
          ],
        },
        { type: "p", text: "Submitting an application does not guarantee approval." },
        { type: "p", text: "FutureTutor may approve, reject, suspend, place under review, or deactivate a Tutor in accordance with Platform standards and applicable law." },
        { type: "p", text: "Only Tutors who satisfy FutureTutor's applicable eligibility requirements may be permitted to receive tutoring opportunities." },
      ],
    },
    {
      number: 9,
      heading: "Accuracy of Tutor Information",
      blocks: [
        { type: "p", text: "Tutors represent that all information and documents they provide are truthful, authentic, current, and complete." },
        { type: "p", text: "Tutors must not:" },
        {
          type: "ul",
          items: [
            "falsify qualifications;",
            "submit altered academic documents;",
            "misrepresent professional experience;",
            "impersonate another person;",
            "misrepresent their education;",
            "falsely claim certifications; or",
            "provide materially misleading information.",
          ],
        },
        { type: "p", text: "FutureTutor may request additional verification at any time." },
        { type: "p", text: "Fraudulent documentation may result in immediate suspension or termination and may be reported to appropriate authorities where legally appropriate." },
      ],
    },
    {
      number: 10,
      heading: "Tutor Quality and Platform Standards",
      blocks: [
        { type: "p", text: "Tutors agree to:" },
        {
          type: "ul",
          items: [
            "act professionally;",
            "provide tutoring with reasonable care and competence;",
            "attend accepted sessions punctually;",
            "communicate respectfully;",
            "maintain appropriate boundaries with Students;",
            "follow FutureTutor's safety requirements;",
            "comply with applicable laws;",
            "protect confidential information;",
            "avoid discriminatory or abusive conduct;",
            "maintain accurate availability;",
            "avoid unauthorized off-platform activity intended to circumvent Platform obligations; and",
            "comply with additional Tutor standards communicated through the Platform.",
          ],
        },
        { type: "p", text: "FutureTutor may monitor marketplace quality using information such as completed sessions, cancellations, attendance, ratings, feedback, verification results, and other legitimate operational information." },
      ],
    },
    {
      number: 11,
      heading: "Tutor Scores and Ratings",
      blocks: [
        { type: "p", text: "FutureTutor may maintain different evaluation systems." },
        { type: "p", text: "These may include:" },
        { type: "p", text: "Public Tutor Rating — A rating derived from eligible feedback or completed tutoring sessions and potentially visible to Platform users." },
        { type: "p", text: "Internal Tutor Score — A private operational score that may consider relevant factors such as verification, qualifications, performance, reliability, experience, quality, or other Platform criteria." },
        { type: "p", text: "Internal scores, formulas, rankings, confidence measures, and marketplace algorithms are proprietary to FutureTutor and need not be publicly disclosed except where required by law." },
        { type: "p", text: "FutureTutor may correct scores affected by fraud, abuse, technical error, manipulation, or invalid data." },
      ],
    },
    {
      number: 12,
      heading: "Requesting Tutoring",
      partTitle: "Part III — Tutoring Requests and Matching",
      blocks: [
        { type: "p", text: "Eligible Students, Parents, or Guardians may request tutoring by providing information such as:" },
        {
          type: "ul",
          items: [
            "subject;",
            "academic level;",
            "desired date;",
            "desired time;",
            "duration;",
            "online or in-person mode;",
            "learning needs;",
            "relevant comments;",
            "location information where applicable; and",
            "other information requested by the Platform.",
          ],
        },
        { type: "p", text: "Submitting a request does not guarantee that a Tutor will be available." },
      ],
    },
    {
      number: 13,
      heading: "Quick Match",
      blocks: [
        { type: "p", text: "FutureTutor may use an automated or rules-based matching process to identify Tutors who may be suitable for a particular tutoring request." },
        { type: "p", text: "Factors may include, without limitation:" },
        {
          type: "ul",
          items: [
            "Tutor approval status;",
            "subject;",
            "academic level;",
            "availability;",
            "tutoring mode;",
            "language;",
            "scheduling conflicts;",
            "geographic area;",
            "Tutor quality or internal score;",
            "prior relationships;",
            "marketplace conditions; and",
            "other legitimate matching factors.",
          ],
        },
        { type: "p", text: "A Match Score or ranking is request-specific and does not constitute a guarantee regarding Tutor quality, educational results, compatibility, or outcome." },
        { type: "p", text: "FutureTutor may change its matching methodology over time." },
      ],
    },
    {
      number: 14,
      heading: "Tutor Invitations",
      blocks: [
        { type: "p", text: "FutureTutor may offer tutoring opportunities to one or more eligible Tutors." },
        { type: "p", text: "Receiving an invitation does not guarantee a Booking." },
        { type: "p", text: "A Tutor may accept or decline an invitation subject to Platform rules." },
        { type: "p", text: "FutureTutor may impose an acceptance period." },
        { type: "p", text: "If a Tutor declines or does not respond in time, FutureTutor may offer the request to another Tutor." },
        { type: "p", text: "Where multiple Tutors may respond, only the Tutor whose acceptance is validly confirmed by the Platform becomes the Tutor for the applicable Booking." },
      ],
    },
    {
      number: 15,
      heading: "Customer Confirmation",
      blocks: [
        { type: "p", text: "A Tutor's acceptance does not necessarily complete the Booking." },
        { type: "p", text: "FutureTutor may require additional confirmation from the Student, Parent, or Guardian, as well as successful payment authorization, before a Booking becomes confirmed." },
        { type: "p", text: "The Platform's authoritative Booking status determines whether a tutoring session has been confirmed." },
      ],
    },
    {
      number: 16,
      heading: "Pricing",
      partTitle: "Part IV — Pricing and Payments",
      blocks: [
        { type: "p", text: "Tutors do not independently determine the price charged to Students or Parents for sessions booked through FutureTutor unless FutureTutor expressly introduces such functionality." },
        { type: "p", text: "FutureTutor determines customer pricing according to its current pricing system." },
        { type: "p", text: "Prices may consider factors including:" },
        {
          type: "ul",
          items: [
            "subject;",
            "academic level;",
            "session duration;",
            "tutoring mode;",
            "urgency;",
            "Tutor availability;",
            "supply and demand;",
            "location or travel considerations;",
            "date or time; and",
            "other disclosed pricing factors.",
          ],
        },
        { type: "p", text: "Applicable taxes may be added where required." },
        { type: "p", text: "FutureTutor will display the applicable price before the user commits to the paid Booking." },
        { type: "p", text: "FutureTutor will not intentionally impose undisclosed mandatory fees after presenting the final purchase price, subject to government-imposed taxes or charges and lawful adjustments disclosed before purchase." },
        { type: "p", text: "Canadian Competition Bureau guidance identifies unattainable advertised prices caused by later mandatory fees as problematic “drip pricing.”" },
      ],
    },
    {
      number: 17,
      heading: "Payment Authorization",
      blocks: [
        { type: "p", text: "Payments are processed using third-party payment services, currently including Stripe." },
        { type: "p", text: "By providing a payment method, you authorize FutureTutor and its payment processor to perform the transactions necessary to process your Booking, including authorization, capture, refund, or other permitted payment operations." },
        { type: "p", text: "A payment authorization may occur before funds are finally captured." },
        { type: "p", text: "A Booking may remain conditional until the Platform confirms the required payment state." },
        { type: "p", text: "You represent that you are authorized to use the payment method provided." },
      ],
    },
    {
      number: 18,
      heading: "Payment Processors",
      blocks: [
        { type: "p", text: "Payment processing services may be provided by Stripe and are subject to applicable Stripe agreements and policies." },
        { type: "p", text: "FutureTutor does not directly store complete payment card numbers where payment details are collected and tokenized by the payment processor." },
        { type: "p", text: "Stripe Connect may also be used to administer Tutor-related payment flows." },
        { type: "p", text: "Stripe's current Connect terms require platforms to disclose relevant Platform fees and explain certain activities and data use relating to Connected Accounts." },
        { type: "p", text: "Tutors may therefore be required to accept applicable Stripe agreements as part of receiving payouts." },
      ],
    },
    {
      number: 19,
      heading: "Tutor Compensation",
      blocks: [
        { type: "p", text: "FutureTutor determines the compensation offered to Tutors for tutoring opportunities according to its Tutor Payout system." },
        { type: "p", text: "Tutor compensation may consider factors including:" },
        {
          type: "ul",
          items: [
            "session duration;",
            "subject;",
            "academic level;",
            "qualifications;",
            "Tutor tier;",
            "experience;",
            "internal quality information;",
            "travel considerations;",
            "incentives; and",
            "other applicable factors.",
          ],
        },
        { type: "p", text: "The amount paid by the Student or Parent and the amount payable to the Tutor are determined independently." },
        { type: "p", text: "FutureTutor may retain the difference between customer revenue and Tutor compensation, after applicable costs, refunds, taxes, processing expenses, incentives, and other legitimate marketplace amounts." },
        { type: "p", text: "The Tutor will be shown or otherwise provided the applicable compensation for a tutoring opportunity before accepting where required by Platform functionality." },
      ],
    },
    {
      number: 20,
      heading: "Taxes",
      blocks: [
        { type: "p", text: "Users are responsible for taxes for which they are legally responsible." },
        { type: "p", text: "FutureTutor may calculate, collect, withhold, remit, report, or provide information concerning taxes where required by law." },
        { type: "p", text: "Tutors remain responsible for determining their own income-tax, registration, reporting, and other tax obligations except for amounts FutureTutor is legally required to administer." },
        { type: "p", text: "Nothing provided through the Platform constitutes tax advice." },
      ],
    },
    {
      number: 21,
      heading: "Customer Cancellation Policy",
      partTitle: "Part V — Cancellations and Refunds",
      blocks: [
        { type: "p", text: "Unless otherwise disclosed at Booking or required by applicable law, the current standard cancellation policy for pay-per-session Bookings is:" },
        { type: "p", text: "48 hours or more before the scheduled session — 100% refund." },
        { type: "p", text: "24 hours or more but less than 48 hours before the scheduled session — 50% refund." },
        { type: "p", text: "Less than 24 hours before the scheduled session — No refund." },
        { type: "p", text: "The applicable time is determined using the scheduled session time and FutureTutor's authoritative systems." },
        { type: "p", text: "FutureTutor may display the refund amount before cancellation." },
        { type: "p", text: "Nothing in this section limits any non-waivable consumer right or remedy available under applicable law." },
      ],
    },
    {
      number: 22,
      heading: "Tutor Cancellation",
      blocks: [
        { type: "p", text: "Tutors should cancel accepted Bookings only when reasonably necessary." },
        { type: "p", text: "If a Tutor cancels, FutureTutor may attempt to find a replacement Tutor." },
        { type: "p", text: "Where FutureTutor cannot provide an appropriate replacement, FutureTutor may issue the Customer a full refund or restore an applicable credit, subject to the Booking circumstances and applicable law." },
        { type: "p", text: "Repeated Tutor cancellations may affect Tutor eligibility, reliability, ranking, or access to the Platform." },
      ],
    },
    {
      number: 23,
      heading: "Exceptional Circumstances",
      blocks: [
        { type: "p", text: "FutureTutor may make reasonable exceptions to cancellation or refund rules in circumstances including:" },
        { type: "ul", items: ["emergencies;", "serious technical failures;", "duplicate charges;", "fraud;", "safety incidents;", "platform errors;", "force majeure;", "Tutor misconduct; or", "other exceptional circumstances."] },
        { type: "p", text: "FutureTutor may request reasonable evidence." },
      ],
    },
    {
      number: 24,
      heading: "Refund Processing",
      blocks: [
        { type: "p", text: "Approved refunds are generally returned through the original payment method where possible." },
        { type: "p", text: "Processing time may depend on the payment provider or financial institution." },
        { type: "p", text: "FutureTutor is not responsible for delays caused solely by banks, card networks, or payment processors after FutureTutor has properly initiated a refund." },
      ],
    },
    {
      number: 25,
      heading: "Virtual Classroom",
      partTitle: "Part VI — Online Tutoring",
      blocks: [
        { type: "p", text: "FutureTutor may provide an integrated Virtual Classroom through third-party technology providers." },
        { type: "p", text: "The Virtual Classroom may support features including:" },
        { type: "ul", items: ["video;", "audio;", "screen sharing;", "participant identification;", "session timing; and", "related tutoring functionality."] },
        { type: "p", text: "Users must grant device permissions required for features they choose to use." },
      ],
    },
    {
      number: 26,
      heading: "Third-Party Video Services",
      blocks: [
        { type: "p", text: "FutureTutor may use third-party infrastructure, currently including Daily, to provide online communication functionality." },
        { type: "p", text: "Use of such functionality may involve technical processing by the applicable provider in accordance with FutureTutor's Privacy Policy and applicable provider terms." },
        { type: "p", text: "FutureTutor does not guarantee uninterrupted operation of third-party infrastructure." },
      ],
    },
    {
      number: 27,
      heading: "Recording",
      blocks: [
        { type: "p", text: "FutureTutor does not currently provide routine recording of tutoring sessions as part of the standard Virtual Classroom." },
        { type: "p", text: "Users must not secretly record another participant where doing so would violate applicable law or Platform rules." },
        { type: "p", text: "FutureTutor may introduce recording functionality only subject to appropriate notice, consent, and legal requirements." },
      ],
    },
    {
      number: 28,
      heading: "Parent or Guardian Observers",
      blocks: [
        { type: "p", text: "Where supported, an authorized Parent or Guardian may participate in a Virtual Classroom as an observer." },
        { type: "p", text: "Observer permissions may be technically restricted, including restrictions on transmitting audio or video." },
        { type: "p", text: "Observer access does not authorize interference with or disruption of a tutoring session." },
      ],
    },
    {
      number: 29,
      heading: "In-Person Services",
      partTitle: "Part VII — In-Person Tutoring",
      blocks: [
        { type: "p", text: "FutureTutor may facilitate tutoring sessions conducted at an agreed physical location." },
        { type: "p", text: "Users participating in in-person tutoring must exercise reasonable care for their own safety and the safety of others." },
      ],
    },
    {
      number: 30,
      heading: "Location Information",
      blocks: [
        { type: "p", text: "For in-person tutoring, an authorized Student, Parent, or Guardian may provide a tutoring location." },
        { type: "p", text: "FutureTutor may collect:" },
        { type: "ul", items: ["street address;", "unit information;", "city;", "province;", "postal code; and", "optional Arrival Instructions."] },
        { type: "p", text: "Exact location information is treated as private information." },
      ],
    },
    {
      number: 31,
      heading: "Location Privacy During Matching",
      blocks: [
        { type: "p", text: "During open matching, FutureTutor may provide prospective Tutors with only approximate geographic information necessary to evaluate the opportunity." },
        { type: "p", text: "This may include:" },
        { type: "ul", items: ["city;", "province;", "approximate area; or", "partial postal information."] },
        { type: "p", text: "FutureTutor does not intend to disclose the complete private tutoring address to every Tutor who receives an invitation." },
      ],
    },
    {
      number: 32,
      heading: "Disclosure to Confirmed Tutor",
      blocks: [
        { type: "p", text: "Once a Booking is authoritatively confirmed, FutureTutor may disclose the exact tutoring location and applicable Arrival Instructions to the Tutor assigned to that Booking." },
        { type: "p", text: "By requesting in-person tutoring, the authorized Student, Parent, or Guardian authorizes this disclosure for the purpose of delivering the tutoring service." },
      ],
    },
    {
      number: 33,
      heading: "Arrival Instructions",
      blocks: [
        { type: "p", text: "Arrival Instructions are intended solely to facilitate safe and appropriate access to the tutoring location." },
        { type: "p", text: "Users must not include unnecessary sensitive personal information in Arrival Instructions." },
        { type: "p", text: "Tutors must use Arrival Instructions only for the applicable tutoring session and must not disclose them except as required by law or necessary for safety." },
      ],
    },
    {
      number: 34,
      heading: "Safety During In-Person Tutoring",
      blocks: [
        { type: "p", text: "All users must behave safely and professionally." },
        { type: "p", text: "Tutors must maintain appropriate professional boundaries, particularly when working with minors." },
        { type: "p", text: "Parents and Guardians remain responsible for determining an appropriate tutoring environment and level of supervision for their child." },
        { type: "p", text: "FutureTutor may establish additional safety requirements for in-person sessions." },
        { type: "p", text: "Users should immediately report serious safety concerns to FutureTutor and, where necessary, emergency services or appropriate authorities." },
      ],
    },
    {
      number: 35,
      heading: "Attendance",
      partTitle: "Part VIII — Session Attendance",
      blocks: [
        { type: "p", text: "Users are expected to attend confirmed tutoring sessions on time." },
        { type: "p", text: "The Platform may use check-in or attendance functionality to determine participation." },
        { type: "p", text: "Failure to attend may result in cancellation consequences, non-refund, Tutor reliability consequences, or other Platform actions." },
      ],
    },
    {
      number: 36,
      heading: "No-Shows",
      blocks: [
        { type: "p", text: "FutureTutor may establish a check-in window and no-show threshold." },
        { type: "p", text: "A participant who fails to attend within the applicable period may be classified as a no-show." },
        { type: "p", text: "No-show determinations may affect:" },
        { type: "ul", items: ["refunds;", "Tutor compensation;", "reliability metrics;", "account standing; and", "dispute resolution."] },
        { type: "p", text: "FutureTutor may correct an incorrect no-show caused by technical error or exceptional circumstances." },
      ],
    },
    {
      number: 37,
      heading: "Reviews and Feedback",
      partTitle: "Part IX — Reviews, Conduct and Content",
      blocks: [
        { type: "p", text: "Eligible users may submit ratings or feedback after qualifying tutoring sessions." },
        { type: "p", text: "Reviews must reflect genuine experiences." },
        { type: "p", text: "Users must not submit:" },
        {
          type: "ul",
          items: ["fabricated reviews;", "retaliatory reviews;", "discriminatory content;", "threats;", "harassment;", "confidential information;", "defamatory material contrary to applicable law;", "spam; or", "manipulated feedback."],
        },
        { type: "p", text: "FutureTutor may remove, restrict, or investigate content that violates these Terms or applicable law." },
      ],
    },
    {
      number: 38,
      heading: "User Content",
      blocks: [
        { type: "p", text: "Users may provide information, comments, profile information, documents, tutoring requests, feedback, or other content (“User Content”)." },
        { type: "p", text: "You retain ownership of your User Content to the extent you have ownership rights in it." },
        { type: "p", text: "You grant FutureTutor a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, process, display, transmit, and otherwise use User Content to the extent reasonably necessary to:" },
        { type: "ul", items: ["operate the Platform;", "deliver tutoring services;", "facilitate Bookings;", "provide support;", "prevent fraud;", "maintain safety;", "enforce these Terms; and", "comply with law."] },
        { type: "p", text: "This licence does not authorize FutureTutor to sell your private personal information as an independent commercial product." },
        { type: "p", text: "Personal information remains subject to the Privacy Policy and applicable privacy law." },
      ],
    },
    {
      number: 39,
      heading: "Prohibited Conduct",
      blocks: [
        { type: "p", text: "Users must not:" },
        {
          type: "ul",
          items: [
            "commit fraud;",
            "impersonate another person;",
            "harass, threaten, exploit, or abuse another user;",
            "sexually harass or behave inappropriately toward a Student;",
            "exploit a minor;",
            "discriminate unlawfully;",
            "circumvent payment obligations;",
            "manipulate ratings or matching;",
            "submit fraudulent academic credentials;",
            "interfere with Platform security;",
            "access another person's account without authorization;",
            "scrape or systematically extract Platform data without permission;",
            "reverse engineer protected portions of the Platform except where legally permitted;",
            "upload malicious code;",
            "attempt unauthorized access;",
            "use Platform data for unauthorized marketing;",
            "misuse private addresses or Arrival Instructions;",
            "disclose another user's private information without authorization;",
            "use the Platform for illegal activity; or",
            "encourage another person to do any of the above.",
          ],
        },
      ],
    },
    {
      number: 40,
      heading: "Off-Platform Circumvention",
      blocks: [
        { type: "p", text: "Users must not use the Platform primarily to identify another user and then deliberately circumvent FutureTutor's applicable Booking or payment process for the purpose of avoiding Platform obligations or charges." },
        { type: "p", text: "FutureTutor may take reasonable measures against deliberate circumvention." },
        { type: "p", text: "This section does not prohibit lawful relationships outside FutureTutor that were independently established and are unrelated to Platform use." },
      ],
    },
    {
      number: 41,
      heading: "FutureTutor Property",
      partTitle: "Part X — Intellectual Property",
      blocks: [
        { type: "p", text: "The Platform and its associated software, design, branding, trademarks, logos, databases, algorithms, matching systems, scoring methodologies, interfaces, text, graphics, and other proprietary materials are owned by or licensed to FutureTutor and are protected by applicable intellectual property laws." },
        { type: "p", text: "Except for the limited right to use the Platform under these Terms, no rights are transferred to you." },
      ],
    },
    {
      number: 42,
      heading: "Limited Licence",
      blocks: [
        { type: "p", text: "FutureTutor grants you a limited, revocable, non-exclusive, non-transferable licence to access and use the Platform for its intended purposes while your account remains authorized." },
        { type: "p", text: "You may not commercially reproduce, resell, sublicense, or exploit the Platform except with FutureTutor's written authorization." },
      ],
    },
    {
      number: 43,
      heading: "Privacy",
      partTitle: "Part XI — Privacy",
      blocks: [
        { type: "p", text: "FutureTutor's collection, use, disclosure, retention, and protection of personal information are governed by its Privacy Policy and applicable privacy legislation." },
        { type: "p", text: "Canadian privacy guidance emphasizes that meaningful consent requires users to understand what information is collected, with whom it is shared, why it is used, and significant consequences of that processing." },
        { type: "p", text: "The Alberta Personal Information Protection Act regulates the collection, use, and disclosure of personal information by private-sector organizations in Alberta." },
        { type: "p", text: "The Privacy Policy should be read together with these Terms." },
      ],
    },
    {
      number: 44,
      heading: "Service Communications",
      partTitle: "Part XII — Communications",
      blocks: [
        { type: "p", text: "FutureTutor may send transactional or service-related communications necessary to operate the Platform, including communications concerning:" },
        { type: "ul", items: ["account security;", "password recovery;", "Bookings;", "tutoring requests;", "payments;", "cancellations;", "account administration;", "safety;", "policy changes; and", "support."] },
        { type: "p", text: "Where required, marketing communications will be handled separately from essential service communications and subject to applicable consent and unsubscribe requirements." },
      ],
    },
    {
      number: 45,
      heading: "Suspension",
      partTitle: "Part XIII — Suspension and Termination",
      blocks: [
        { type: "p", text: "FutureTutor may temporarily restrict or suspend an account where reasonably necessary to:" },
        {
          type: "ul",
          items: ["investigate suspected fraud;", "protect a minor;", "respond to safety concerns;", "investigate misconduct;", "prevent unauthorized access;", "enforce these Terms;", "comply with law;", "protect users; or", "protect the integrity of the Platform."],
        },
        { type: "p", text: "Where appropriate, FutureTutor may provide notice or an opportunity to respond." },
      ],
    },
    {
      number: 46,
      heading: "Termination by FutureTutor",
      blocks: [
        { type: "p", text: "FutureTutor may terminate an account for material or repeated violations of these Terms, fraud, serious safety violations, unlawful conduct, exploitation of minors, falsified Tutor credentials, payment abuse, or other serious misuse." },
        { type: "p", text: "Termination does not eliminate obligations arising before termination." },
      ],
    },
    {
      number: 47,
      heading: "Termination by User",
      blocks: [
        { type: "p", text: "Users may stop using FutureTutor at any time." },
        { type: "p", text: "Account deletion or deactivation may be subject to procedures communicated by FutureTutor." },
        { type: "p", text: "FutureTutor may retain information where reasonably necessary or legally required for purposes including:" },
        { type: "ul", items: ["financial records;", "tax obligations;", "fraud prevention;", "dispute resolution;", "safety investigations;", "enforcement;", "legal claims; and", "regulatory compliance."] },
        { type: "p", text: "Further information should be provided in the Privacy Policy." },
      ],
    },
    {
      number: 48,
      heading: "User Disputes",
      partTitle: "Part XIV — Disputes Between Platform Users",
      blocks: [
        { type: "p", text: "Users should report disputes concerning tutoring sessions, payments, attendance, conduct, or safety through FutureTutor's support channels." },
        { type: "p", text: "FutureTutor may review relevant Platform records and take reasonable action." },
        { type: "p", text: "FutureTutor's marketplace determination does not prevent a user from exercising rights or remedies that cannot legally be waived." },
      ],
    },
    {
      number: 49,
      heading: "Educational Outcomes",
      partTitle: "Part XV — Disclaimers",
      blocks: [
        { type: "p", text: "Tutoring can support learning but does not guarantee any particular educational outcome." },
        { type: "p", text: "FutureTutor does not guarantee:" },
        { type: "ul", items: ["grades;", "examination results;", "admission to a school or university;", "scholarships;", "academic advancement;", "employment;", "certification; or", "any specific learning result."] },
        { type: "p", text: "Tutor ratings, internal scores, verification, and matching are tools intended to support marketplace quality and are not guarantees of future performance." },
      ],
    },
    {
      number: 50,
      heading: "Platform Availability",
      blocks: [
        { type: "p", text: "FutureTutor aims to provide reliable Platform access but cannot guarantee that the Platform will always be uninterrupted, secure, or error-free." },
        { type: "p", text: "Service may be affected by:" },
        { type: "ul", items: ["maintenance;", "internet outages;", "third-party services;", "payment networks;", "video infrastructure;", "device compatibility;", "emergencies; or", "events beyond FutureTutor's reasonable control."] },
      ],
    },
    {
      number: 51,
      heading: "Third-Party Services",
      blocks: [
        { type: "p", text: "The Platform relies on third-party providers that may include payment processors, video infrastructure, hosting providers, email providers, and other technology services." },
        { type: "p", text: "FutureTutor is not responsible for third-party failures to the extent the failure is outside FutureTutor's reasonable control, subject always to rights and obligations that cannot be excluded under applicable law." },
      ],
    },
    {
      number: 52,
      heading: "Limitation of Liability",
      partTitle: "Part XVI — Limitation of Liability",
      blocks: [
        { type: "p", text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FutureTutor and its directors, officers, employees, contractors, affiliates, and agents will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from use of the Platform." },
        { type: "p", text: "Subject to applicable law, FutureTutor's aggregate liability arising from or relating to a claim concerning the Platform will not exceed the greater of:" },
        {
          type: "ul",
          items: [
            "(a) the amounts paid by the claimant to FutureTutor during the six (6) months preceding the event giving rise to the claim; or",
            "(b) CAD $100.",
          ],
        },
        { type: "p", text: "However, nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability resulting from fraud, wilful misconduct, or other liability that applicable law makes non-excludable." },
        { type: "p", text: "LEGAL REVIEW REQUIRED: Given the involvement of minors and in-person services, Canadian counsel should specifically review this liability cap and all exclusions before publication." },
      ],
    },
    {
      number: 53,
      heading: "Indemnity",
      partTitle: "Part XVII — Indemnification",
      blocks: [
        { type: "p", text: "To the extent permitted by law, you agree to indemnify and hold harmless FutureTutor and its directors, officers, employees, and agents from third-party claims, losses, liabilities, damages, and reasonable costs arising from:" },
        {
          type: "ul",
          items: [
            "your material violation of these Terms;",
            "your unlawful conduct;",
            "fraudulent information supplied by you;",
            "infringement of another person's rights;",
            "misuse of another person's personal information;",
            "your User Content; or",
            "where you are a Tutor, your intentional or unlawful misconduct in providing tutoring services.",
          ],
        },
        { type: "p", text: "This indemnity does not require a consumer to indemnify FutureTutor for FutureTutor's own negligence, breach of law, or conduct for which indemnification cannot lawfully be required." },
      ],
    },
    {
      number: 54,
      heading: "Governing Law",
      partTitle: "Part XVIII — Governing Law",
      blocks: [
        {
          type: "p",
          text: "Except where mandatory laws provide otherwise, these Terms are governed by the laws of the Province of Alberta and the federal laws of Canada applicable therein, without regard to conflict-of-laws principles.",
        },
        {
          type: "p",
          text: "If you are a consumer residing in Québec or another Canadian jurisdiction whose mandatory laws apply to your relationship with FutureTutor, nothing in these Terms is intended to deprive you of any non-waivable protection, remedy, jurisdictional right or consumer right available under those laws.",
        },
      ],
    },
    {
      number: 55,
      heading: "Dispute Resolution and Courts",
      blocks: [
        { type: "p", text: "Before commencing formal proceedings, users and FutureTutor should attempt in good faith to resolve disputes through FutureTutor's support process where appropriate." },
        { type: "p", text: "Subject to any mandatory consumer rights or jurisdictional rules, disputes arising from these Terms or the Platform will be submitted to the courts having jurisdiction in Alberta, Canada." },
        { type: "p", text: "This draft deliberately does not impose mandatory arbitration or a class-action waiver." },
        { type: "p", text: "Those provisions can materially affect consumer rights and should not be introduced without specific Canadian legal advice." },
      ],
    },
    {
      number: 56,
      heading: "Changes to These Terms",
      partTitle: "Part XIX — General Terms",
      blocks: [
        { type: "p", text: "FutureTutor may update these Terms to reflect:" },
        { type: "ul", items: ["changes to the Platform;", "new functionality;", "legal requirements;", "security requirements;", "marketplace changes; or", "operational needs."] },
        { type: "p", text: "Where changes are material, FutureTutor will provide reasonable notice as required by applicable law." },
        { type: "p", text: "Where legally required, FutureTutor will obtain renewed consent." },
        { type: "p", text: "The effective date of the current Terms will be displayed at the beginning of this document." },
      ],
    },
    {
      number: 57,
      heading: "Assignment",
      blocks: [
        { type: "p", text: "You may not assign your rights or obligations under these Terms without FutureTutor's consent." },
        { type: "p", text: "FutureTutor may assign these Terms in connection with a merger, acquisition, corporate reorganization, financing, or sale of all or substantially all relevant business assets, subject to applicable law." },
      ],
    },
    {
      number: 58,
      heading: "Severability",
      blocks: [
        { type: "p", text: "If any provision is determined to be invalid or unenforceable, that provision will be interpreted or limited to the minimum extent necessary, and the remaining provisions will continue in effect." },
      ],
    },
    {
      number: 59,
      heading: "Waiver",
      blocks: [{ type: "p", text: "Failure by FutureTutor to enforce a provision does not constitute a waiver of that provision or any other provision." }],
    },
    {
      number: 60,
      heading: "Entire Agreement",
      blocks: [
        { type: "p", text: "These Terms, together with the Privacy Policy, applicable Booking terms, Tutor-specific terms where applicable, and any additional terms expressly incorporated by reference, constitute the agreement between you and FutureTutor concerning the Platform." },
        { type: "p", text: "In the event of a conflict, more specific terms applicable to a particular service or transaction may prevail over these general Terms to the extent of that conflict." },
      ],
    },
    {
      number: 61,
      heading: "Language",
      blocks: [
        { type: "p", text: "FutureTutor makes these Terms available in English and French." },
        {
          type: "p",
          text: "For users to whom Québec's Charter of the French Language or other applicable language requirements apply, the French version of these Terms and applicable standard clauses will be made available before the user is asked to express a wish to be bound by a version in another language.",
        },
        {
          type: "p",
          text: "Where permitted by law, after being given the opportunity to examine the French version, a user may expressly choose to enter into the agreement in English.",
        },
        {
          type: "p",
          text: "FutureTutor intends the English and French versions to be substantively equivalent. Nothing in this section limits rights that cannot be waived under applicable language or consumer-protection legislation.",
        },
      ],
    },
    {
      number: 62,
      heading: "Electronic Agreement",
      blocks: [
        { type: "p", text: "You agree that these Terms may be accepted electronically." },
        { type: "p", text: "Electronic acceptance, including through a checkbox, button, account registration, Booking confirmation, or other electronic process, may constitute your agreement to these Terms to the extent permitted by law." },
        { type: "p", text: "FutureTutor may retain electronic records of acceptance." },
      ],
    },
    {
      number: 63,
      heading: "Force Majeure",
      blocks: [
        { type: "p", text: "FutureTutor will not be responsible for delay or failure caused by circumstances beyond its reasonable control, including natural disasters, severe weather, government action, widespread telecommunications failures, labour disruptions, war, civil unrest, epidemics, or major third-party infrastructure failures, except where applicable law provides otherwise." },
      ],
    },
    {
      number: 64,
      heading: "Contact FutureTutor",
      partTitle: "Part XX — Contact",
      blocks: [
        { type: "p", text: "Questions about these Terms may be directed to:" },
        {
          type: "p",
          text: "FutureTutor — Operated and owned by FYRA SERVICES INC., federally incorporated in Canada.",
        },
        { type: "p", text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, AB T6E 0C8\nCanada" },
        { type: "p", text: "Legal: legal@futuretutor.ca" },
        { type: "p", text: "Privacy inquiries: legal@futuretutor.ca" },
        { type: "p", text: "Website: futuretutor.ca" },
        { type: "p", text: "Province: Alberta" },
        { type: "p", text: "Country: Canada" },
      ],
    },
    {
      number: 65,
      heading: "Acknowledgement",
      partTitle: "Part XXI — Acknowledgement",
      blocks: [
        { type: "p", text: "BY CREATING AN ACCOUNT OR OTHERWISE ACCEPTING THESE TERMS THROUGH THE PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THESE TERMS AND AGREE TO BE BOUND BY THEM." },
        { type: "p", text: "IF YOU ARE ACCEPTING THESE TERMS ON BEHALF OF A MINOR OR AN ORGANIZATION, YOU REPRESENT THAT YOU HAVE AUTHORITY TO DO SO." },
      ],
    },
  ],
};
