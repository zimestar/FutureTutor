import type { LegalDocumentContent } from "./types";

/** FG-LEGAL2 — Product-Owner-approved working Tutor Independent Service
 * Provider Agreement V1, integrated faithfully from the approved source
 * text. Remains subject to final external Canadian legal review. See
 * termsContent.en.ts / privacyContent.en.ts / cookieContent.en.ts for the
 * parallel legal documents and the shared LegalDocument rendering
 * component. Sections 157-162 render the source document's six lettered
 * Annexes (A-F) using the same numbered-section shape, each carrying its
 * own partTitle. */
export const TUTOR_AGREEMENT_VERSION = "2026-08-30";

export const tutorAgreementContentEn: LegalDocumentContent = {
  effectiveDate: "August 30, 2026",
  lastUpdated: "August 30, 2026",
  sections: [
    {
      number: 1,
      heading: "Purpose",
      partTitle: "Part I — Purpose and Relationship",
      blocks: [
        {
          type: "p",
          text: "This Tutor Independent Service Provider Agreement (the “Agreement”) is entered into between FYRA SERVICES INC., a corporation incorporated under the federal laws of Canada, operating the tutoring marketplace known as FutureTutor, with a mailing address at 8830 62e Ave NW, Edmonton, Alberta T6E 0C8, Canada (“FutureTutor,” “Company,” “we,” “us,” or “our”), and the individual or legal entity that applies for, maintains, or uses a Tutor account on FutureTutor and accepts this Agreement (“Tutor,” “you,” or “your”).",
        },
        {
          type: "p",
          text: "FutureTutor and Tutor may individually be referred to as a “Party” and collectively as the “Parties.”",
        },
        { type: "p", text: "This Agreement governs the Tutor's provision of tutoring services through the FutureTutor Platform." },
        { type: "p", text: "It should be read together with the FutureTutor:" },
        {
          type: "ul",
          items: [
            "Terms of Service;",
            "Privacy Policy;",
            "Cookie Policy;",
            "applicable Tutor policies, safety standards and Platform rules;",
            "applicable Stripe agreements where payment or payout services are used.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor operates a managed tutoring marketplace through which Students, Parents and legal Guardians may request tutoring services and eligible Tutors may receive, accept and perform tutoring opportunities.",
        },
        { type: "p", text: "Tutoring may be provided:" },
        {
          type: "ul",
          items: ["online through FutureTutor's Virtual Classroom or another approved method; or", "in person at an authorized tutoring location."],
        },
        { type: "p", text: "This Agreement establishes the contractual conditions under which a Tutor may provide tutoring services through FutureTutor." },
      ],
    },
    {
      number: 2,
      heading: "Independent Service Provider Relationship",
      blocks: [
        {
          type: "p",
          text: "Subject to applicable law, the Parties intend that Tutor provide tutoring services as an independent service provider and independent contractor, and not as an employee of FutureTutor.",
        },
        { type: "p", text: "Nothing in this Agreement is intended to create:" },
        {
          type: "ul",
          items: [
            "an employer-employee relationship;",
            "a partnership;",
            "a joint venture;",
            "a fiduciary relationship;",
            "an agency relationship except for limited authority expressly granted;",
            "a franchise;",
            "or any other relationship inconsistent with independent contracting.",
          ],
        },
        {
          type: "p",
          text: "The Parties acknowledge, however, that legal status depends on applicable law and the actual circumstances of the relationship and cannot be determined solely by contractual terminology.",
        },
        {
          type: "p",
          text: "Nothing in this Agreement is intended to waive any non-waivable employment, labour, tax, workers' compensation, occupational health and safety, human rights or other statutory protection that applies as a matter of law.",
        },
      ],
    },
    {
      number: 3,
      heading: "No Authority to Bind FutureTutor",
      blocks: [
        { type: "p", text: "Tutor has no authority to:" },
        {
          type: "ul",
          items: [
            "enter into contracts on behalf of FutureTutor;",
            "incur liabilities on behalf of FutureTutor;",
            "make representations that legally bind FutureTutor;",
            "negotiate FutureTutor's contracts;",
            "extend credit on FutureTutor's behalf;",
            "make warranties on behalf of FutureTutor;",
            "represent themselves as an employee, officer, director or authorized agent of FutureTutor.",
          ],
        },
        { type: "p", text: "Tutor must not state or imply otherwise." },
      ],
    },
    {
      number: 4,
      heading: "No Minimum Hours",
      partTitle: "Part II — Independence of the Tutor",
      blocks: [
        { type: "p", text: "FutureTutor does not guarantee Tutor any minimum number of:" },
        {
          type: "ul",
          items: ["hours;", "tutoring opportunities;", "Students;", "Bookings;", "assignments;", "earnings;", "or revenue."],
        },
        {
          type: "p",
          text: "Tutor is not required to maintain a minimum number of working hours unless a separate written program expressly provides otherwise.",
        },
      ],
    },
    {
      number: 5,
      heading: "Tutor Availability",
      blocks: [
        {
          type: "p",
          text: "Tutor may determine the periods during which Tutor wishes to make themselves available through the Platform, subject to Platform functionality.",
        },
        { type: "p", text: "Tutor is responsible for keeping their availability reasonably accurate." },
        {
          type: "p",
          text: "Once Tutor voluntarily accepts a tutoring opportunity, Tutor is expected to honour the resulting commitment in accordance with this Agreement and applicable cancellation rules.",
        },
      ],
    },
    {
      number: 6,
      heading: "Right to Accept or Decline Opportunities",
      blocks: [
        {
          type: "p",
          text: "Unless otherwise required by a separately accepted program, Tutor may accept or decline tutoring opportunities offered through FutureTutor.",
        },
        {
          type: "p",
          text: "Declining an individual opportunity does not, by itself, create an employment obligation or constitute misconduct.",
        },
        {
          type: "p",
          text: "FutureTutor may nevertheless use legitimate operational information, including availability and accepted Booking performance, when operating its matching system.",
        },
      ],
    },
    {
      number: 7,
      heading: "Non-Exclusivity",
      blocks: [
        { type: "p", text: "Tutor is not required to provide tutoring services exclusively through FutureTutor." },
        {
          type: "p",
          text: "Subject to confidentiality, privacy, intellectual property, non-circumvention and other obligations in this Agreement, Tutor may:",
        },
        {
          type: "ul",
          items: ["tutor independently;", "operate another business;", "work for another company;", "use other tutoring platforms;", "provide services to other clients."],
        },
        { type: "p", text: "Nothing in this Agreement creates a general non-compete obligation." },
      ],
    },
    {
      number: 8,
      heading: "Control Over Tutoring Methods",
      blocks: [
        { type: "p", text: "Subject to:" },
        {
          type: "ul",
          items: [
            "Student needs;",
            "agreed learning objectives;",
            "applicable curriculum requirements;",
            "safety requirements;",
            "Platform rules;",
            "professional standards;",
            "laws;",
            "and the obligations of this Agreement,",
          ],
        },
        { type: "p", text: "Tutor generally determines the professional methods used to deliver tutoring services." },
        {
          type: "p",
          text: "FutureTutor may establish reasonable quality, safety, conduct, privacy and Platform standards without thereby intending to control every pedagogical decision made by Tutor.",
        },
      ],
    },
    {
      number: 9,
      heading: "Basic Eligibility",
      partTitle: "Part III — Tutor Eligibility",
      blocks: [
        { type: "p", text: "To provide tutoring through FutureTutor, Tutor must:" },
        {
          type: "ul",
          items: [
            "satisfy applicable legal age requirements;",
            "have legal capacity to enter into this Agreement;",
            "be legally permitted to provide the relevant services in the jurisdiction where tutoring occurs;",
            "provide accurate information;",
            "successfully complete FutureTutor's applicable validation process;",
            "maintain an eligible Tutor account;",
            "comply with this Agreement and applicable Platform policies.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor may establish additional reasonable eligibility requirements for particular subjects, Student populations, tutoring modes or programs.",
        },
      ],
    },
    {
      number: 10,
      heading: "Accurate Information",
      blocks: [
        { type: "p", text: "Tutor represents that information provided to FutureTutor is truthful, accurate, complete and not misleading." },
        { type: "p", text: "Tutor must promptly update material changes." },
        { type: "p", text: "Tutor must not:" },
        {
          type: "ul",
          items: [
            "falsify qualifications;",
            "falsify education;",
            "falsify experience;",
            "submit altered transcripts;",
            "submit fraudulent certificates;",
            "impersonate another person;",
            "misrepresent professional credentials;",
            "conceal material restrictions affecting Tutor's eligibility.",
          ],
        },
        { type: "p", text: "Material misrepresentation may result in immediate suspension or termination." },
      ],
    },
    {
      number: 11,
      heading: "Validation Process",
      partTitle: "Part IV — Tutor Validation",
      blocks: [
        {
          type: "p",
          text: "FutureTutor may require Tutors to complete a validation process before becoming eligible to receive tutoring opportunities.",
        },
        { type: "p", text: "The process may include:" },
        {
          type: "ul",
          items: [
            "profile completion;",
            "identity information;",
            "educational information;",
            "academic documentation;",
            "qualifications;",
            "certificates;",
            "interviews;",
            "training;",
            "examinations;",
            "subject assessments;",
            "document verification;",
            "administrative review;",
            "other reasonable quality or safety checks.",
          ],
        },
        { type: "p", text: "Successful application does not create employment." },
      ],
    },
    {
      number: 12,
      heading: "Educational Documents",
      blocks: [
        { type: "p", text: "FutureTutor may request documentation including:" },
        {
          type: "ul",
          items: ["diplomas;", "degrees;", "transcripts;", "certificates;", "licences where relevant;", "academic records;", "professional qualifications."],
        },
        {
          type: "p",
          text: "Tutor authorizes FutureTutor to review and, where reasonably necessary and legally permitted, verify submitted information.",
        },
      ],
    },
    {
      number: 13,
      heading: "Interview",
      blocks: [
        { type: "p", text: "FutureTutor may require Tutor to participate in an interview." },
        { type: "p", text: "Assessment criteria may include:" },
        {
          type: "ul",
          items: [
            "communication;",
            "pedagogy;",
            "professionalism;",
            "subject confidence;",
            "Student interaction;",
            "motivation;",
            "alignment with FutureTutor's safety and service standards.",
          ],
        },
        {
          type: "p",
          text: "The interview is part of FutureTutor's marketplace eligibility and quality-control process and does not constitute a job interview for employment unless applicable law determines otherwise.",
        },
      ],
    },
    {
      number: 14,
      heading: "Training",
      blocks: [
        { type: "p", text: "FutureTutor may require Tutors to complete onboarding or Platform training concerning matters such as:" },
        {
          type: "ul",
          items: [
            "Platform use;",
            "safety;",
            "privacy;",
            "tutoring expectations;",
            "protection of minors;",
            "Virtual Classroom operation;",
            "in-person tutoring;",
            "professional conduct.",
          ],
        },
        {
          type: "p",
          text: "Mandatory Platform training is intended to establish safe and consistent marketplace standards and does not grant Tutor employee status.",
        },
      ],
    },
    {
      number: 15,
      heading: "Examinations and Assessments",
      blocks: [
        { type: "p", text: "FutureTutor may require:" },
        {
          type: "ul",
          items: ["general competency assessments;", "Platform assessments;", "subject-specific assessments;", "re-assessment where reasonably necessary."],
        },
        { type: "p", text: "Passing an assessment does not guarantee tutoring opportunities." },
      ],
    },
    {
      number: 16,
      heading: "Approval",
      blocks: [
        {
          type: "p",
          text: "Only Tutors whose status is APPROVED, or an equivalent eligible status established by FutureTutor, may receive tutoring opportunities where Platform rules require approval.",
        },
        {
          type: "p",
          text: "FutureTutor may deny an application where legitimate quality, safety, verification or eligibility requirements are not satisfied.",
        },
      ],
    },
    {
      number: 17,
      heading: "Background Checks",
      partTitle: "Part V — Background and Safety Verification",
      blocks: [
        { type: "p", text: "Where permitted by law and reasonably required because of:" },
        {
          type: "ul",
          items: [
            "work with minors;",
            "in-person tutoring;",
            "safety considerations;",
            "applicable law;",
            "institutional requirements;",
            "or FutureTutor safety policy,",
          ],
        },
        {
          type: "p",
          text: "FutureTutor may require Tutor to complete an appropriate background, criminal record, vulnerable-sector or equivalent verification.",
        },
        {
          type: "p",
          text: "FutureTutor will not represent that a particular type of check is legally mandatory unless it actually is.",
        },
      ],
    },
    {
      number: 18,
      heading: "Continuing Disclosure",
      blocks: [
        {
          type: "p",
          text: "To the extent permitted by law, Tutor must promptly inform FutureTutor of a material change that may legally or reasonably affect Tutor's suitability to provide tutoring, particularly where the change creates a legitimate risk to Student safety.",
        },
        { type: "p", text: "FutureTutor may request additional information where reasonably necessary and legally permitted." },
      ],
    },
    {
      number: 19,
      heading: "Profile",
      partTitle: "Part VI — Tutor Profile",
      blocks: [
        { type: "p", text: "FutureTutor may display selected Tutor information to Students, Parents and Guardians, including:" },
        {
          type: "ul",
          items: [
            "first name or approved display name;",
            "photograph;",
            "biography;",
            "subjects;",
            "languages;",
            "education;",
            "qualifications;",
            "experience;",
            "tutoring modes;",
            "public rating;",
            "relevant verified credentials.",
          ],
        },
        { type: "p", text: "FutureTutor may distinguish verified information from self-reported information." },
      ],
    },
    {
      number: 20,
      heading: "Profile Accuracy",
      blocks: [
        { type: "p", text: "Tutor must maintain an accurate profile." },
        { type: "p", text: "Tutor must not include:" },
        {
          type: "ul",
          items: [
            "false credentials;",
            "misleading claims;",
            "prohibited contact information intended to bypass FutureTutor;",
            "discriminatory statements;",
            "unlawful content;",
            "inappropriate content;",
            "unauthorized personal information belonging to another person.",
          ],
        },
      ],
    },
    {
      number: 21,
      heading: "Matching",
      partTitle: "Part VII — Matching and Tutoring Opportunities",
      blocks: [
        { type: "p", text: "FutureTutor may use software and rule-based systems to identify Tutors for tutoring requests." },
        { type: "p", text: "Matching may consider factors such as:" },
        {
          type: "ul",
          items: [
            "approval status;",
            "subject;",
            "academic level;",
            "availability;",
            "tutoring mode;",
            "language;",
            "schedule conflicts;",
            "quality indicators;",
            "prior tutoring relationships;",
            "approximate location for in-person tutoring;",
            "marketplace availability;",
            "other legitimate operational factors.",
          ],
        },
      ],
    },
    {
      number: 22,
      heading: "Match Score",
      blocks: [
        { type: "p", text: "FutureTutor may generate a request-specific Match Score or ranking." },
        { type: "p", text: "Tutor acknowledges that:" },
        {
          type: "ul",
          items: [
            "Match Scores are operational tools;",
            "rankings may change between requests;",
            "ranking does not guarantee a Booking;",
            "FutureTutor is not required to disclose proprietary formulas or weighting except where required by law.",
          ],
        },
      ],
    },
    {
      number: 23,
      heading: "Offer of an Opportunity",
      blocks: [
        { type: "p", text: "Receiving a tutoring opportunity does not guarantee a Booking." },
        { type: "p", text: "A Booking may require:" },
        {
          type: "ul",
          items: [
            "FutureTutor identifying Tutor as eligible;",
            "Tutor accepting;",
            "Student/Parent confirmation where applicable;",
            "successful payment authorization where required;",
            "authoritative Booking creation.",
          ],
        },
        { type: "p", text: "Tutor must not treat a pending opportunity as a confirmed Booking until the Platform indicates confirmation." },
      ],
    },
    {
      number: 24,
      heading: "FutureTutor Determines Tutor Payout",
      partTitle: "Part VIII — Tutor Compensation",
      blocks: [
        { type: "p", text: "FutureTutor operates an independent Tutor Payout Engine." },
        { type: "p", text: "Tutor does not independently set the customer price charged through the Platform." },
        { type: "p", text: "FutureTutor determines the payout offered to Tutor for a particular Booking based on applicable Platform rules." },
      ],
    },
    {
      number: 25,
      heading: "Payout Offer",
      blocks: [
        {
          type: "p",
          text: "Before accepting a paid tutoring opportunity, Tutor should be shown the applicable Tutor payout or sufficient information to determine the compensation associated with the opportunity.",
        },
        { type: "p", text: "By accepting the opportunity, Tutor accepts the offered payout for that Booking, subject to:" },
        {
          type: "ul",
          items: [
            "completion requirements;",
            "cancellation rules;",
            "refund rules;",
            "no-show rules;",
            "fraud prevention;",
            "dispute resolution;",
            "lawful adjustments;",
            "taxes;",
            "other expressly disclosed conditions.",
          ],
        },
      ],
    },
    {
      number: 26,
      heading: "Customer Price Is Separate",
      blocks: [
        { type: "p", text: "The amount paid by the customer may differ from the amount paid to Tutor." },
        { type: "p", text: "FutureTutor's customer pricing and Tutor compensation systems are independent." },
        { type: "p", text: "Tutor acknowledges that FutureTutor may retain the difference between:" },
        { type: "p", text: "Customer Price − Tutor Payout" },
        {
          type: "p",
          text: "as revenue or gross spread, subject to taxes, payment-processing costs, refunds, incentives, operating expenses and other business costs.",
        },
        { type: "p", text: "Tutor has no ownership interest in FutureTutor's spread." },
      ],
    },
    {
      number: 27,
      heading: "No Fixed Commission Representation",
      blocks: [
        {
          type: "p",
          text: "Unless expressly stated for a particular program, Tutor compensation is not necessarily calculated as a fixed percentage of the amount paid by the customer.",
        },
        { type: "p", text: "Tutor's payout may depend on legitimate factors including:" },
        {
          type: "ul",
          items: [
            "tutoring duration;",
            "subject;",
            "academic level;",
            "Tutor qualifications;",
            "Tutor tier;",
            "experience;",
            "quality indicators;",
            "incentives;",
            "in-person considerations;",
            "travel considerations where supported;",
            "applicable payout rules.",
          ],
        },
      ],
    },
    {
      number: 28,
      heading: "Immutable Booking Payout",
      blocks: [
        {
          type: "p",
          text: "Once a Booking is confirmed, FutureTutor may preserve a Booking-specific payout snapshot and applicable rule version.",
        },
        { type: "p", text: "Future changes to general payout rules should not retroactively alter a confirmed Booking except where:" },
        {
          type: "ul",
          items: [
            "correction of a manifest error is required;",
            "fraud occurred;",
            "cancellation/refund rules apply;",
            "the Booking is modified with authorization;",
            "applicable law requires otherwise.",
          ],
        },
      ],
    },
    {
      number: 29,
      heading: "Payment Provider",
      partTitle: "Part IX — Stripe Connect",
      blocks: [
        { type: "p", text: "FutureTutor currently uses Stripe and Stripe Connect for payment and Tutor payout infrastructure." },
        { type: "p", text: "Tutor may be required to establish or connect an eligible Stripe account before receiving payouts." },
      ],
    },
    {
      number: 30,
      heading: "Stripe Agreements",
      blocks: [
        {
          type: "p",
          text: "Tutor's use of Stripe services is subject to applicable Stripe agreements, including the Stripe Connected Account Agreement and incorporated Stripe terms.",
        },
        {
          type: "p",
          text: "Tutor agrees to provide accurate and complete information required for Stripe onboarding, identity verification, payment administration and compliance.",
        },
        {
          type: "p",
          text: "Where required by FutureTutor's Stripe Connect configuration, Tutor authorizes FutureTutor to provide Stripe with information reasonably necessary to administer the connected account and related transactions.",
        },
      ],
    },
    {
      number: 31,
      heading: "Stripe Data",
      blocks: [
        { type: "p", text: "Tutor acknowledges that Stripe may process information concerning:" },
        {
          type: "ul",
          items: [
            "identity;",
            "representatives;",
            "payment activity;",
            "transactions;",
            "connected account;",
            "banking/payout information;",
            "fraud and risk;",
            "other information required by Stripe.",
          ],
        },
        { type: "p", text: "Such processing is also governed by applicable Stripe agreements and privacy terms." },
      ],
    },
    {
      number: 32,
      heading: "Stripe Verification",
      blocks: [
        { type: "p", text: "Tutor is responsible for completing Stripe verification requirements applicable to Tutor." },
        { type: "p", text: "Failure to complete required verification may prevent or delay payouts." },
        { type: "p", text: "FutureTutor is not responsible for delays resulting solely from:" },
        {
          type: "ul",
          items: ["incomplete Tutor information;", "Stripe verification;", "banking issues;", "payment-provider restrictions;", "legal compliance holds;"],
        },
        { type: "p", text: "except to the extent FutureTutor caused the delay or applicable law provides otherwise." },
      ],
    },
    {
      number: 33,
      heading: "Stripe Account Status",
      blocks: [
        { type: "p", text: "Tutor must maintain payment information necessary to receive payouts." },
        {
          type: "p",
          text: "If Tutor's Connected Account becomes restricted, disabled or otherwise incapable of receiving funds, FutureTutor may temporarily hold payout administration until the issue is resolved, subject to applicable law.",
        },
      ],
    },
    {
      number: 34,
      heading: "Tutor Tax Responsibility",
      partTitle: "Part X — Taxes",
      blocks: [
        {
          type: "p",
          text: "Subject to applicable law and the actual legal classification of the relationship, Tutor is responsible for determining and satisfying Tutor's own:",
        },
        {
          type: "ul",
          items: [
            "income tax;",
            "GST/HST;",
            "QST;",
            "provincial sales tax where applicable;",
            "CPP obligations applicable to self-employed persons;",
            "business registration;",
            "tax filings;",
            "permits;",
            "licences;",
            "other governmental obligations.",
          ],
        },
        { type: "p", text: "FutureTutor does not provide personal tax advice to Tutors." },
      ],
    },
    {
      number: 35,
      heading: "GST/HST and Other Sales Taxes",
      blocks: [
        {
          type: "p",
          text: "Tutor is responsible for determining whether Tutor is required to register for, collect, report or remit GST/HST, QST or another applicable tax.",
        },
        { type: "p", text: "Tutor must provide FutureTutor with accurate tax-registration information where required for Platform operations or reporting." },
        { type: "p", text: "Nothing in this Agreement represents that every Tutor is automatically required to register for GST/HST." },
      ],
    },
    {
      number: 36,
      heading: "Tax Documentation",
      blocks: [
        { type: "p", text: "FutureTutor may request or issue tax-related documentation where required by law." },
        { type: "p", text: "Tutor agrees to provide reasonably required accurate tax information." },
        { type: "p", text: "FutureTutor may make legally required deductions, withholding or reporting where applicable." },
      ],
    },
    {
      number: 37,
      heading: "Tutor Expenses",
      partTitle: "Part XI — Expenses and Equipment",
      blocks: [
        {
          type: "p",
          text: "Unless FutureTutor expressly agrees otherwise in writing, Tutor is responsible for Tutor's own ordinary business expenses, including as applicable:",
        },
        {
          type: "ul",
          items: [
            "computer;",
            "internet;",
            "mobile device;",
            "educational supplies;",
            "transportation;",
            "vehicle expenses;",
            "workspace;",
            "professional materials;",
            "insurance;",
            "tax preparation;",
            "business registrations.",
          ],
        },
      ],
    },
    {
      number: 38,
      heading: "Equipment",
      blocks: [
        { type: "p", text: "Tutor generally provides the equipment necessary to perform tutoring services." },
        {
          type: "p",
          text: "FutureTutor may provide access to Platform technology such as the Virtual Classroom without that technology becoming Tutor's property.",
        },
      ],
    },
    {
      number: 39,
      heading: "Travel",
      blocks: [
        {
          type: "p",
          text: "For in-person tutoring, Tutor is responsible for determining whether Tutor can safely and reasonably travel to the approximate area presented before accepting.",
        },
        { type: "p", text: "Where a specific Booking includes a travel-related payout or incentive, the amount shown for that Booking governs." },
        {
          type: "p",
          text: "FutureTutor does not otherwise guarantee reimbursement for mileage, parking, fuel, transit or travel time unless expressly stated.",
        },
      ],
    },
    {
      number: 40,
      heading: "Professional Standard",
      partTitle: "Part XII — Tutoring Obligations",
      blocks: [
        { type: "p", text: "Tutor must provide tutoring services:" },
        {
          type: "ul",
          items: ["competently;", "professionally;", "respectfully;", "safely;", "punctually;", "honestly;", "in good faith;", "consistent with the Student's legitimate educational needs."],
        },
      ],
    },
    {
      number: 41,
      heading: "Preparation",
      blocks: [
        { type: "p", text: "Tutor is responsible for reasonably preparing for accepted sessions." },
        { type: "p", text: "Preparation may include reviewing information voluntarily supplied concerning:" },
        {
          type: "ul",
          items: ["subject;", "academic level;", "learning objectives;", "chapters;", "concepts;", "assignment context."],
        },
      ],
    },
    {
      number: 42,
      heading: "No Guaranteed Results",
      blocks: [
        { type: "p", text: "Tutor must not guarantee:" },
        {
          type: "ul",
          items: ["grades;", "examination results;", "admission;", "scholarships;", "graduation;", "academic ranking;", "employment;", "other specific educational outcomes."],
        },
        { type: "p", text: "Tutor may assist Students but cannot guarantee performance." },
      ],
    },
    {
      number: 43,
      heading: "Academic Integrity",
      blocks: [
        { type: "p", text: "Tutor must support learning rather than academic dishonesty." },
        { type: "p", text: "Tutor must not knowingly:" },
        {
          type: "ul",
          items: [
            "take an examination for a Student;",
            "impersonate a Student;",
            "complete graded work where prohibited;",
            "falsify academic records;",
            "facilitate plagiarism;",
            "circumvent academic integrity systems;",
            "obtain unauthorized examination materials;",
            "assist cheating.",
          ],
        },
        {
          type: "p",
          text: "Tutor may explain concepts, provide examples, review Student work and offer educational guidance consistent with applicable academic rules.",
        },
      ],
    },
    {
      number: 44,
      heading: "Heightened Duty of Conduct",
      partTitle: "Part XIII — Safeguarding Minors",
      blocks: [
        { type: "p", text: "Tutor acknowledges that FutureTutor may facilitate tutoring involving children and youth." },
        { type: "p", text: "Tutors interacting with minors must maintain appropriate professional boundaries at all times." },
      ],
    },
    {
      number: 45,
      heading: "Prohibited Conduct With Minors",
      blocks: [
        { type: "p", text: "Tutor must never engage in:" },
        {
          type: "ul",
          items: [
            "sexual conduct;",
            "sexual communication;",
            "grooming;",
            "romantic solicitation;",
            "sexual jokes;",
            "requests for sexual images;",
            "inappropriate touching;",
            "harassment;",
            "threats;",
            "intimidation;",
            "coercion;",
            "physical punishment;",
            "humiliating treatment;",
            "discriminatory abuse;",
            "exploitation;",
            "manipulation;",
            "unlawful conduct.",
          ],
        },
        { type: "p", text: "This prohibition applies online and in person." },
      ],
    },
    {
      number: 46,
      heading: "Professional Boundaries",
      blocks: [
        { type: "p", text: "Tutor must keep interactions with minors educational and professionally appropriate." },
        {
          type: "p",
          text: "Tutor must not use the tutoring relationship to develop an inappropriate personal, romantic, financial or exploitative relationship.",
        },
      ],
    },
    {
      number: 47,
      heading: "Communication With Minors",
      blocks: [
        { type: "p", text: "Tutor should use FutureTutor-approved communication channels where required." },
        { type: "p", text: "Tutor must not pressure a minor to:" },
        {
          type: "ul",
          items: [
            "communicate secretly;",
            "conceal communications from a Parent/Guardian;",
            "provide unnecessary personal information;",
            "meet privately outside authorized tutoring arrangements;",
            "move communications off-platform for an improper purpose.",
          ],
        },
      ],
    },
    {
      number: 48,
      heading: "Gifts and Money",
      blocks: [
        { type: "p", text: "Tutor must not solicit:" },
        {
          type: "ul",
          items: ["loans;", "personal payments outside authorized Platform transactions;", "significant gifts;", "financial investments;", "donations;", "personal financial assistance"],
        },
        { type: "p", text: "from Students or minors." },
        {
          type: "p",
          text: "Reasonable token gifts initiated by a family may be subject to FutureTutor policy, but Tutors must never pressure a Student or family to provide them.",
        },
      ],
    },
    {
      number: 49,
      heading: "Reporting Safety Concerns",
      blocks: [
        { type: "p", text: "Tutor must promptly report to FutureTutor any serious concern involving:" },
        {
          type: "ul",
          items: [
            "suspected abuse;",
            "exploitation;",
            "grooming;",
            "threats;",
            "serious harassment;",
            "immediate safety risks;",
            "unauthorized access to a minor;",
            "serious Platform misconduct.",
          ],
        },
        { type: "p", text: "Nothing in this Agreement replaces any mandatory reporting obligation imposed directly on Tutor by applicable law." },
        {
          type: "p",
          text: "Where immediate danger exists, Tutor should contact appropriate emergency or protective authorities as required by the circumstances and law.",
        },
      ],
    },
    {
      number: 50,
      heading: "In-Person Safety",
      partTitle: "Part XIV — In-Person Tutoring",
      blocks: [
        { type: "p", text: "Tutor must exercise reasonable judgment when providing in-person tutoring." },
        { type: "p", text: "Tutor may decline an opportunity before acceptance if Tutor is uncomfortable with the approximate location or circumstances." },
      ],
    },
    {
      number: 51,
      heading: "Location Privacy",
      blocks: [
        { type: "p", text: "During open matching, Tutor may receive only approximate location information." },
        { type: "p", text: "Tutor must not attempt to circumvent FutureTutor's privacy controls to discover a Student's exact address before authorization." },
      ],
    },
    {
      number: 52,
      heading: "Exact Address",
      blocks: [
        { type: "p", text: "Acceptance of a tutoring opportunity alone does not necessarily authorize Tutor to receive the exact address." },
        { type: "p", text: "The exact tutoring location may be disclosed after authoritative Booking confirmation." },
        { type: "p", text: "Tutor may use the address only for legitimate purposes connected with the confirmed tutoring session." },
      ],
    },
    {
      number: 53,
      heading: "Arrival Instructions",
      blocks: [
        { type: "p", text: "Tutor may receive private Arrival Instructions after confirmation." },
        { type: "p", text: "Tutor must treat Arrival Instructions as confidential." },
        { type: "p", text: "Tutor must not:" },
        { type: "ul", items: ["publish them;", "retain them unnecessarily;", "share them with unrelated persons;", "use them for unrelated purposes."] },
      ],
    },
    {
      number: 54,
      heading: "Access to Private Residences",
      blocks: [
        { type: "p", text: "Where tutoring occurs in a private residence, Tutor must:" },
        {
          type: "ul",
          items: [
            "enter only as authorized;",
            "remain only for legitimate tutoring purposes;",
            "respect household boundaries;",
            "avoid accessing unrelated areas;",
            "leave when the tutoring session or authorized presence ends;",
            "follow reasonable safety instructions.",
          ],
        },
      ],
    },
    {
      number: 55,
      heading: "No Unauthorized Persons",
      blocks: [
        { type: "p", text: "Tutor must not bring another person to an in-person tutoring session without appropriate prior authorization." },
      ],
    },
    {
      number: 56,
      heading: "Transportation of Students",
      blocks: [
        {
          type: "p",
          text: "Unless FutureTutor expressly introduces and authorizes such a service in writing, Tutor must not transport a Student as part of a FutureTutor tutoring service.",
        },
        { type: "p", text: "A Tutor must not represent transportation as a FutureTutor service." },
      ],
    },
    {
      number: 57,
      heading: "Virtual Classroom",
      partTitle: "Part XV — Online Tutoring",
      blocks: [
        { type: "p", text: "FutureTutor may provide an integrated Virtual Classroom through Daily or another approved provider." },
        { type: "p", text: "Tutor must use the Virtual Classroom in accordance with:" },
        { type: "ul", items: ["this Agreement;", "privacy requirements;", "safety rules;", "applicable law."] },
      ],
    },
    {
      number: 58,
      heading: "Camera and Microphone",
      blocks: [
        { type: "p", text: "Tutor is responsible for ensuring that Tutor's environment is reasonably appropriate for professional tutoring." },
        { type: "p", text: "Tutor should avoid exposing unnecessary confidential, inappropriate or private material through camera or microphone." },
      ],
    },
    {
      number: 59,
      heading: "Screen Sharing",
      blocks: [
        { type: "p", text: "Tutor may use screen sharing for legitimate tutoring purposes." },
        { type: "p", text: "Before sharing a screen, Tutor should close unrelated:" },
        { type: "ul", items: ["personal messages;", "confidential documents;", "financial information;", "private communications;", "inappropriate content."] },
      ],
    },
    {
      number: 60,
      heading: "Recording",
      blocks: [
        { type: "p", text: "Tutor must not independently record:" },
        { type: "ul", items: ["audio;", "video;", "screen content;", "screenshots of private tutoring content;"] },
        {
          type: "p",
          text: "except where expressly authorized by FutureTutor and all legally required permissions or consents have been obtained.",
        },
        { type: "p", text: "FutureTutor's current Virtual Classroom does not provide routine recording." },
      ],
    },
    {
      number: 61,
      heading: "Parent/Guardian Observers",
      blocks: [
        { type: "p", text: "Authorized Parents or Guardians may be permitted to observe certain sessions." },
        { type: "p", text: "Tutor must not attempt to disable or circumvent authorized observer functionality." },
      ],
    },
    {
      number: 62,
      heading: "Punctuality",
      partTitle: "Part XVI — Attendance",
      blocks: [
        { type: "p", text: "Tutor is expected to be reasonably punctual for accepted Bookings." },
        { type: "p", text: "Repeated or serious lateness may affect:" },
        { type: "ul", items: ["Tutor Internal Score;", "eligibility;", "matching;", "quality review;", "Platform access."] },
      ],
    },
    {
      number: 63,
      heading: "Check-In",
      blocks: [
        { type: "p", text: "Tutor may be required to complete Platform check-in or equivalent session-verification procedures." },
        { type: "p", text: "Tutor must not falsify:" },
        { type: "ul", items: ["attendance;", "check-in;", "session duration;", "completion;", "Student attendance."] },
      ],
    },
    {
      number: 64,
      heading: "No-Show",
      blocks: [
        {
          type: "p",
          text: "Failure to attend an accepted Booking without valid cancellation or exceptional circumstances may constitute a Tutor no-show.",
        },
        { type: "p", text: "FutureTutor may:" },
        {
          type: "ul",
          items: [
            "attempt to rematch the Student;",
            "withhold payout for an unperformed session;",
            "adjust legitimate reliability/quality information;",
            "conduct quality review;",
            "suspend Tutor for repeated or serious misconduct.",
          ],
        },
      ],
    },
    {
      number: 65,
      heading: "Tutor Cancellation",
      partTitle: "Part XVII — Cancellations",
      blocks: [
        { type: "p", text: "Tutor should cancel an accepted Booking only where reasonably necessary." },
        { type: "p", text: "Tutor must provide as much notice as reasonably possible." },
        { type: "p", text: "Repeated avoidable cancellations may affect Tutor eligibility or quality status." },
      ],
    },
    {
      number: 66,
      heading: "Emergency Cancellation",
      blocks: [
        { type: "p", text: "Where Tutor must cancel because of:" },
        { type: "ul", items: ["illness;", "emergency;", "accident;", "dangerous travel conditions;", "force majeure;", "other legitimate exceptional circumstances,"] },
        { type: "p", text: "Tutor should notify FutureTutor promptly." },
        { type: "p", text: "FutureTutor may request reasonable supporting information where proportionate and legally permissible." },
      ],
    },
    {
      number: 67,
      heading: "Replacement Tutor",
      blocks: [
        { type: "p", text: "When Tutor cancels, FutureTutor may attempt to rematch the Student with another eligible Tutor." },
        { type: "p", text: "Tutor has no entitlement to the replacement Tutor's payout." },
      ],
    },
    {
      number: 68,
      heading: "Customer Cancellation",
      blocks: [
        {
          type: "p",
          text: "Tutor compensation following customer cancellation is governed by the applicable FutureTutor cancellation and payout rules for that Booking.",
        },
        { type: "p", text: "FutureTutor's customer refund and Tutor payout obligations may differ." },
      ],
    },
    {
      number: 69,
      heading: "Public Ratings",
      partTitle: "Part XVIII — Ratings and Quality",
      blocks: [
        { type: "p", text: "Eligible completed tutoring sessions may permit Students, Parents or Guardians to provide ratings or feedback." },
        { type: "p", text: "FutureTutor may display a Tutor's legitimate aggregate public rating." },
      ],
    },
    {
      number: 70,
      heading: "Internal Tutor Score",
      blocks: [
        { type: "p", text: "FutureTutor may maintain a private Tutor Internal Score for quality and operational purposes." },
        { type: "p", text: "Factors may include:" },
        {
          type: "ul",
          items: [
            "validation;",
            "qualifications;",
            "experience;",
            "reliability;",
            "attendance;",
            "cancellations;",
            "completed sessions;",
            "Student/Parent feedback;",
            "quality review;",
            "other legitimate Platform indicators.",
          ],
        },
        { type: "p", text: "FutureTutor is not required to publicly disclose proprietary formulas except where required by law." },
      ],
    },
    {
      number: 71,
      heading: "Quality Review",
      blocks: [
        { type: "p", text: "FutureTutor may place Tutor under quality review where legitimate concerns arise." },
        { type: "p", text: "FutureTutor may request:" },
        { type: "ul", items: ["explanation;", "updated information;", "retraining;", "reassessment;", "additional verification;", "corrective action."] },
      ],
    },
    {
      number: 72,
      heading: "Fairness",
      blocks: [
        { type: "p", text: "FutureTutor should not knowingly manipulate ratings or quality systems for unlawful discriminatory or retaliatory purposes." },
        { type: "p", text: "Tutor may report suspected factual errors through available support channels." },
      ],
    },
    {
      number: 73,
      heading: "Student Information Is Confidential",
      partTitle: "Part XIX — Privacy and Confidentiality",
      blocks: [
        { type: "p", text: "Tutor may receive confidential information concerning Students and families." },
        { type: "p", text: "This may include:" },
        {
          type: "ul",
          items: [
            "name;",
            "academic information;",
            "learning needs;",
            "school information;",
            "tutoring notes;",
            "Parent information;",
            "Booking details;",
            "private addresses;",
            "Arrival Instructions;",
            "communications;",
            "session information.",
          ],
        },
        { type: "p", text: "Tutor must use such information only as necessary to provide authorized tutoring services." },
      ],
    },
    {
      number: 74,
      heading: "Data Minimization",
      blocks: [
        { type: "p", text: "Tutor must not collect unnecessary personal information from Students." },
        { type: "p", text: "Tutor should not request sensitive information unless legitimately necessary and permitted." },
      ],
    },
    {
      number: 75,
      heading: "No Private Databases",
      blocks: [
        { type: "p", text: "Tutor must not create independent databases of FutureTutor Student or Parent information for:" },
        { type: "ul", items: ["marketing;", "solicitation;", "resale;", "profiling;", "unrelated commercial activity."] },
      ],
    },
    {
      number: 76,
      heading: "Security",
      blocks: [
        { type: "p", text: "Tutor must take reasonable steps to protect information accessed through FutureTutor." },
        { type: "p", text: "Tutor must not:" },
        {
          type: "ul",
          items: [
            "share account credentials;",
            "intentionally expose Student information;",
            "leave sensitive information publicly accessible;",
            "use compromised accounts;",
            "intentionally bypass Platform security.",
          ],
        },
      ],
    },
    {
      number: 77,
      heading: "Security Incidents",
      blocks: [
        { type: "p", text: "Tutor must promptly notify FutureTutor if Tutor becomes aware of:" },
        {
          type: "ul",
          items: [
            "unauthorized account access;",
            "loss of sensitive Student information;",
            "unauthorized disclosure;",
            "compromised credentials;",
            "suspected data breach;",
            "material privacy incident.",
          ],
        },
        { type: "p", text: "Notification should be sent through FutureTutor's designated support/privacy channel." },
      ],
    },
    {
      number: 78,
      heading: "Privacy Policy",
      blocks: [
        { type: "p", text: "Tutor's use of FutureTutor is also subject to the FutureTutor Privacy Policy." },
        {
          type: "p",
          text: "Where Tutor independently collects personal information outside FutureTutor for Tutor's own separate business, Tutor may have independent legal privacy obligations.",
        },
      ],
    },
    {
      number: 79,
      heading: "Company Confidential Information",
      partTitle: "Part XX — Confidential FutureTutor Information",
      blocks: [
        { type: "p", text: "Tutor may receive non-public FutureTutor information including:" },
        {
          type: "ul",
          items: [
            "internal procedures;",
            "pricing methodology;",
            "payout methodology;",
            "Match Score information;",
            "internal scoring;",
            "training materials;",
            "business strategy;",
            "security information;",
            "technical information;",
            "non-public product plans;",
            "confidential communications.",
          ],
        },
        { type: "p", text: "Tutor must not improperly disclose or misuse confidential FutureTutor information." },
      ],
    },
    {
      number: 80,
      heading: "Exclusions",
      blocks: [
        { type: "p", text: "Confidential Information does not include information that Tutor can demonstrate:" },
        {
          type: "ul",
          items: [
            "is lawfully public through no breach;",
            "was already lawfully known without confidentiality obligation;",
            "was independently developed without use of confidential information;",
            "was lawfully received from an authorized third party.",
          ],
        },
      ],
    },
    {
      number: 81,
      heading: "Legally Required Disclosure",
      blocks: [
        { type: "p", text: "If Tutor is legally compelled to disclose confidential information, Tutor may do so to the extent legally required." },
        { type: "p", text: "Where legally permitted, Tutor should provide FutureTutor reasonable notice." },
      ],
    },
    {
      number: 82,
      heading: "FutureTutor Property",
      partTitle: "Part XXI — Intellectual Property",
      blocks: [
        { type: "p", text: "FutureTutor retains ownership of its:" },
        {
          type: "ul",
          items: [
            "Platform;",
            "software;",
            "trademarks;",
            "logos;",
            "branding;",
            "interface;",
            "proprietary training;",
            "documentation;",
            "systems;",
            "proprietary methodologies;",
            "original Platform content.",
          ],
        },
        { type: "p", text: "No ownership is transferred to Tutor." },
      ],
    },
    {
      number: 83,
      heading: "Limited Platform Licence",
      blocks: [
        {
          type: "p",
          text: "FutureTutor grants Tutor a limited, revocable, non-exclusive, non-transferable right to use the Platform solely to participate in FutureTutor services while Tutor remains eligible.",
        },
      ],
    },
    {
      number: 84,
      heading: "Tutor Pre-Existing Materials",
      blocks: [
        { type: "p", text: "Tutor retains ownership of original teaching materials created independently before or outside FutureTutor, subject to third-party rights." },
      ],
    },
    {
      number: 85,
      heading: "Tutor Materials Used in Sessions",
      blocks: [
        { type: "p", text: "Where Tutor provides Tutor-owned materials through FutureTutor, Tutor grants FutureTutor only such limited licence as reasonably necessary to:" },
        { type: "ul", items: ["transmit;", "display;", "deliver;", "technically process;"] },
        { type: "p", text: "those materials for the tutoring service." },
        { type: "p", text: "FutureTutor does not thereby acquire ownership of Tutor's independent educational materials." },
      ],
    },
    {
      number: 86,
      heading: "Third-Party Materials",
      blocks: [
        { type: "p", text: "Tutor must respect copyright and other intellectual-property rights." },
        { type: "p", text: "Tutor must not unlawfully distribute:" },
        { type: "ul", items: ["textbooks;", "answer keys;", "paid course materials;", "copyrighted examinations;", "proprietary educational resources."] },
      ],
    },
    {
      number: 87,
      heading: "No Fraud",
      partTitle: "Part XXII — Platform Integrity",
      blocks: [
        { type: "p", text: "Tutor must not engage in:" },
        {
          type: "ul",
          items: [
            "payment fraud;",
            "identity fraud;",
            "fake Bookings;",
            "fabricated attendance;",
            "manipulated reviews;",
            "collusion;",
            "false payout claims;",
            "account sharing;",
            "fraudulent documentation.",
          ],
        },
      ],
    },
    {
      number: 88,
      heading: "No Manipulation",
      blocks: [
        { type: "p", text: "Tutor must not attempt to improperly manipulate:" },
        {
          type: "ul",
          items: [
            "Match Scores;",
            "rankings;",
            "ratings;",
            "payouts;",
            "availability;",
            "cancellations;",
            "session records;",
            "referral systems;",
            "quality systems.",
          ],
        },
      ],
    },
    {
      number: 89,
      heading: "No Scraping or Unauthorized Access",
      blocks: [
        { type: "p", text: "Tutor must not:" },
        {
          type: "ul",
          items: [
            "scrape Student information;",
            "extract Platform databases;",
            "reverse engineer protected systems except where law expressly permits;",
            "bypass access controls;",
            "probe security without authorization;",
            "access another Tutor's account;",
            "access unrelated Bookings.",
          ],
        },
      ],
    },
    {
      number: 90,
      heading: "Protection of Platform-Introduced Relationships",
      partTitle: "Part XXIII — Off-Platform Circumvention",
      blocks: [
        { type: "p", text: "FutureTutor invests resources in:" },
        {
          type: "ul",
          items: ["attracting customers;", "validating Tutors;", "matching;", "payments;", "safety;", "infrastructure;", "customer support;", "Platform operation."],
        },
        {
          type: "p",
          text: "Tutor must not use confidential Platform information or FutureTutor's introduction of a Student solely to fraudulently circumvent amounts legitimately payable to FutureTutor.",
        },
      ],
    },
    {
      number: 91,
      heading: "No Solicitation to Evade the Platform",
      blocks: [
        {
          type: "p",
          text: "Tutor must not encourage a Student, Parent or Guardian to cancel or avoid a FutureTutor Booking for the purpose of recreating substantially the same tutoring arrangement off-platform solely to avoid FutureTutor's legitimate charges or systems.",
        },
        {
          type: "p",
          text: "This provision is intended to protect Platform-introduced transactions, not to create a general prohibition against Tutor operating an independent tutoring business.",
        },
      ],
    },
    {
      number: 92,
      heading: "Reasonable Scope",
      blocks: [
        { type: "p", text: "Nothing in this Agreement prohibits Tutor from:" },
        {
          type: "ul",
          items: [
            "having independent clients;",
            "marketing Tutor's independent business generally;",
            "tutoring persons independently acquired without misuse of FutureTutor confidential information;",
            "working through competing platforms.",
          ],
        },
        { type: "p", text: "Any non-circumvention restriction must be interpreted only to the extent enforceable under applicable law." },
      ],
    },
    {
      number: 93,
      heading: "Respectful Conduct",
      partTitle: "Part XXIV — Professional Conduct",
      blocks: [{ type: "p", text: "Tutor must treat Students, Parents, Guardians, FutureTutor personnel and other users respectfully." }],
    },
    {
      number: 94,
      heading: "Non-Discrimination",
      blocks: [{ type: "p", text: "Tutor must not unlawfully discriminate or harass individuals based on characteristics protected by applicable human rights law." }],
    },
    {
      number: 95,
      heading: "Harassment",
      blocks: [
        { type: "p", text: "Tutor must not engage in:" },
        { type: "ul", items: ["harassment;", "threats;", "stalking;", "intimidation;", "bullying;", "hate speech;", "sexual harassment;", "retaliation."] },
      ],
    },
    {
      number: 96,
      heading: "Substances and Impairment",
      blocks: [
        {
          type: "p",
          text: "Tutor must not provide tutoring while impaired in a manner that makes Tutor unable to safely or professionally perform the service.",
        },
        { type: "p", text: "Tutor must not consume illegal substances during tutoring." },
      ],
    },
    {
      number: 97,
      heading: "Weapons and Dangerous Items",
      blocks: [
        { type: "p", text: "Tutor must not bring unlawful weapons or dangerous items to tutoring sessions." },
        { type: "p", text: "Nothing in this section overrides lawful emergency, occupational or accessibility requirements." },
      ],
    },
    {
      number: 98,
      heading: "Legally Required Insurance",
      partTitle: "Part XXV — Insurance and Legal Compliance",
      blocks: [
        { type: "p", text: "Tutor is responsible for maintaining any insurance legally required for Tutor's independent activities." },
        {
          type: "p",
          text: "FutureTutor does not represent that every Tutor is legally required to maintain a particular commercial insurance policy.",
        },
      ],
    },
    {
      number: 99,
      heading: "Future Program Requirements",
      blocks: [
        { type: "p", text: "FutureTutor may establish reasonable insurance requirements for particular:" },
        { type: "ul", items: ["programs;", "jurisdictions;", "institutional partnerships;", "higher-risk service categories;"] },
        { type: "p", text: "where justified." },
        { type: "p", text: "Where practicable, such requirements will be communicated before Tutor participates in the affected program." },
      ],
    },
    {
      number: 100,
      heading: "Licences and Permits",
      blocks: [
        { type: "p", text: "Tutor is responsible for licences, permits or registrations legally required for Tutor's independent provision of services." },
        { type: "p", text: "FutureTutor does not represent that ordinary tutoring universally requires a professional licence." },
      ],
    },
    {
      number: 101,
      heading: "Tutor Representations",
      partTitle: "Part XXVI — Representations and Warranties",
      blocks: [
        { type: "p", text: "Tutor represents that:" },
        {
          type: "ul",
          items: [
            "Tutor has authority to enter this Agreement;",
            "information supplied is materially accurate;",
            "Tutor will comply with applicable law;",
            "Tutor will provide services professionally;",
            "Tutor will respect privacy and confidentiality;",
            "Tutor will not knowingly violate third-party rights;",
            "Tutor will maintain eligibility requirements;",
            "Tutor will not misuse the Platform.",
          ],
        },
      ],
    },
    {
      number: 102,
      heading: "No Conflicting Obligations",
      blocks: [{ type: "p", text: "Tutor represents that participation in FutureTutor does not knowingly breach another enforceable contractual obligation." }],
    },
    {
      number: 103,
      heading: "Platform Availability",
      partTitle: "Part XXVII — FutureTutor Platform",
      blocks: [
        { type: "p", text: "FutureTutor seeks to provide reliable Platform access but does not guarantee uninterrupted availability." },
        { type: "p", text: "Temporary interruptions may occur because of:" },
        { type: "ul", items: ["maintenance;", "internet failures;", "third-party outages;", "security incidents;", "force majeure;", "technical problems."] },
      ],
    },
    {
      number: 104,
      heading: "No Guarantee of Opportunities",
      blocks: [
        { type: "p", text: "FutureTutor does not guarantee:" },
        { type: "ul", items: ["demand;", "tutoring opportunities;", "Bookings;", "Student retention;", "earnings;", "ranking;", "minimum revenue."] },
      ],
    },
    {
      number: 105,
      heading: "Third-Party Services",
      blocks: [
        { type: "p", text: "FutureTutor relies on third-party services including payment, infrastructure, email and video providers." },
        {
          type: "p",
          text: "FutureTutor is not responsible for every act or omission of an independent third-party provider except where applicable law imposes responsibility on FutureTutor.",
        },
      ],
    },
    {
      number: 106,
      heading: "Temporary Suspension",
      partTitle: "Part XXVIII — Suspension",
      blocks: [
        { type: "p", text: "FutureTutor may temporarily suspend Tutor where reasonably necessary to investigate:" },
        {
          type: "ul",
          items: [
            "safety concerns;",
            "fraud;",
            "serious complaints;",
            "privacy incidents;",
            "payment issues;",
            "identity concerns;",
            "suspected policy violations;",
            "qualification concerns.",
          ],
        },
      ],
    },
    {
      number: 107,
      heading: "Immediate Safety Suspension",
      blocks: [
        { type: "p", text: "FutureTutor may immediately restrict Tutor's Platform access where reasonably necessary to protect:" },
        {
          type: "ul",
          items: ["a child;", "Student;", "Parent;", "Guardian;", "Tutor;", "FutureTutor;", "public safety;", "Platform security."],
        },
        { type: "p", text: "Immediate suspension does not necessarily constitute a final determination of wrongdoing." },
      ],
    },
    {
      number: 108,
      heading: "Quality Review",
      blocks: [
        {
          type: "p",
          text: "FutureTutor may move Tutor into a QUALITY_REVIEW or equivalent status while investigating legitimate performance concerns.",
        },
      ],
    },
    {
      number: 109,
      heading: "Tutor Termination",
      partTitle: "Part XXIX — Termination",
      blocks: [
        {
          type: "p",
          text: "Tutor may stop providing services through FutureTutor and terminate this Agreement by closing or deactivating Tutor's relationship with FutureTutor through available processes or by providing reasonable notice.",
        },
        { type: "p", text: "Tutor remains responsible for existing confirmed Bookings unless they are properly cancelled or transferred." },
      ],
    },
    {
      number: 110,
      heading: "FutureTutor Termination",
      blocks: [
        { type: "p", text: "Subject to applicable law, FutureTutor may terminate Tutor's Platform access for legitimate reasons including:" },
        {
          type: "ul",
          items: [
            "fraud;",
            "serious safety violation;",
            "misconduct involving a minor;",
            "falsified qualifications;",
            "repeated serious no-shows;",
            "material privacy violation;",
            "payment fraud;",
            "harassment;",
            "illegal conduct;",
            "material breach;",
            "inability to satisfy eligibility requirements.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor may also discontinue a Tutor relationship for legitimate business reasons, subject to applicable law and outstanding contractual obligations.",
        },
      ],
    },
    {
      number: 111,
      heading: "Effect of Termination",
      blocks: [
        { type: "p", text: "Termination ends Tutor's right to receive new opportunities through FutureTutor." },
        { type: "p", text: "Termination does not automatically eliminate:" },
        {
          type: "ul",
          items: [
            "earned unpaid amounts;",
            "valid refunds or reversals;",
            "confidentiality obligations;",
            "privacy obligations;",
            "intellectual-property obligations;",
            "tax obligations;",
            "dispute obligations;",
            "liabilities arising before termination;",
            "provisions intended to survive.",
          ],
        },
      ],
    },
    {
      number: 112,
      heading: "Outstanding Payouts",
      blocks: [
        { type: "p", text: "Subject to:" },
        { type: "ul", items: ["fraud review;", "refunds;", "chargebacks;", "legal requirements;", "payment-provider restrictions;"] },
        {
          type: "p",
          text: "FutureTutor will administer legitimate earned outstanding payouts following termination in accordance with applicable rules and law.",
        },
      ],
    },
    {
      number: 113,
      heading: "Payment Reversals",
      partTitle: "Part XXX — Payment Reversals and Disputes",
      blocks: [
        { type: "p", text: "Where a customer payment is lawfully reversed, refunded or charged back, FutureTutor may investigate the transaction." },
        { type: "p", text: "Tutor is not automatically responsible for every customer chargeback." },
        { type: "p", text: "Any adjustment to Tutor compensation must be consistent with:" },
        { type: "ul", items: ["the Booking terms;", "applicable payout rules;", "fraud findings;", "this Agreement;", "applicable law."] },
      ],
    },
    {
      number: 114,
      heading: "Tutor Fraud",
      blocks: [
        {
          type: "p",
          text: "Where FutureTutor reasonably determines that a payout resulted from Tutor fraud, fabricated attendance or intentional misconduct, FutureTutor may seek recovery or offset where permitted by law.",
        },
      ],
    },
    {
      number: 115,
      heading: "Manifest Payment Error",
      blocks: [
        {
          type: "p",
          text: "If an obvious technical or clerical error causes Tutor to receive an amount materially different from the agreed payout, the Parties will cooperate in good faith to correct the error.",
        },
      ],
    },
    {
      number: 116,
      heading: "Tutor Indemnification",
      partTitle: "Part XXXI — Indemnification",
      blocks: [
        {
          type: "p",
          text: "To the extent permitted by applicable law, Tutor agrees to indemnify and hold harmless FYRA SERVICES INC., its directors, officers and representatives from third-party claims, losses, damages, liabilities and reasonable costs arising directly from Tutor's:",
        },
        {
          type: "ul",
          items: [
            "material breach of this Agreement;",
            "unlawful conduct;",
            "fraud;",
            "wilful misconduct;",
            "infringement of third-party intellectual property;",
            "unauthorized disclosure of personal information;",
            "serious violation of Student safety obligations;",
          ],
        },
        {
          type: "p",
          text: "except to the extent caused by FutureTutor's own negligence, wilful misconduct, breach or other responsibility under applicable law.",
        },
        { type: "p", text: "This section must be interpreted subject to applicable law and shall not require indemnification where legally prohibited." },
      ],
    },
    {
      number: 117,
      heading: "Excluded Damages",
      partTitle: "Part XXXII — Limitation of Liability",
      blocks: [
        {
          type: "p",
          text: "To the maximum extent permitted by law, neither Party will be liable to the other for indirect, incidental, special, exemplary or consequential damages arising solely from this Agreement, except where such exclusion is prohibited by law or inconsistent with another express obligation.",
        },
      ],
    },
    {
      number: 118,
      heading: "FutureTutor Liability Cap",
      blocks: [
        { type: "p", text: "To the maximum extent permitted by applicable law, FutureTutor's aggregate liability to Tutor arising from this Agreement will not exceed the greater of:" },
        {
          type: "ol",
          items: [
            "the amounts paid or payable by FutureTutor to Tutor through the Platform during the six months immediately preceding the event giving rise to the claim; or",
            "CAD $100.",
          ],
        },
      ],
    },
    {
      number: 119,
      heading: "Liability Cap Exceptions",
      blocks: [
        { type: "p", text: "The limitation above does not apply where liability cannot lawfully be limited or excluded, including where applicable law provides otherwise in relation to:" },
        {
          type: "ul",
          items: ["fraud;", "wilful misconduct;", "gross negligence where non-excludable;", "bodily injury;", "statutory rights;", "other non-waivable liability."],
        },
        { type: "p", text: "This provision is expressly subject to legal review and applicable provincial law." },
      ],
    },
    {
      number: 120,
      heading: "Good-Faith Resolution",
      partTitle: "Part XXXIII — Disputes",
      blocks: [
        {
          type: "p",
          text: "Before commencing formal proceedings, the Parties should attempt in good faith to resolve ordinary contractual disputes through written communication.",
        },
        { type: "p", text: "This does not prevent urgent legal relief." },
      ],
    },
    {
      number: 121,
      heading: "Contact",
      blocks: [
        { type: "p", text: "Contractual notices or disputes may be sent to:" },
        { type: "p", text: "legal@futuretutor.ca" },
        { type: "p", text: "FutureTutor may provide a dedicated dispute process in the future." },
      ],
    },
    {
      number: 122,
      heading: "No Mandatory Arbitration at This Time",
      blocks: [{ type: "p", text: "This Agreement does not impose mandatory private arbitration unless the Parties later validly agree to it in accordance with applicable law." }],
    },
    {
      number: 123,
      heading: "No Class-Action Waiver",
      blocks: [
        { type: "p", text: "This Agreement does not impose a class-action waiver." },
        { type: "p", text: "FutureTutor reserves the ability to amend dispute-resolution mechanisms prospectively where legally permissible and properly accepted." },
      ],
    },
    {
      number: 124,
      heading: "Alberta Law",
      partTitle: "Part XXXIV — Governing Law",
      blocks: [
        {
          type: "p",
          text: "Subject to mandatory laws that apply notwithstanding contractual choice of law, this Agreement is governed by the laws of the Province of Alberta and the federal laws of Canada applicable therein.",
        },
      ],
    },
    {
      number: 125,
      heading: "Mandatory Local Law",
      blocks: [
        { type: "p", text: "Nothing in the Alberta governing-law clause eliminates rights or obligations that cannot lawfully be excluded under:" },
        {
          type: "ul",
          items: [
            "another province's laws;",
            "employment/labour legislation;",
            "privacy law;",
            "human rights law;",
            "tax law;",
            "occupational health and safety law;",
            "consumer law where applicable;",
            "other mandatory legislation.",
          ],
        },
      ],
    },
    {
      number: 126,
      heading: "Courts",
      blocks: [
        {
          type: "p",
          text: "Subject to mandatory jurisdictional rights under applicable law, disputes that cannot be resolved informally may be brought before courts of competent jurisdiction in Alberta.",
        },
        {
          type: "p",
          text: "Nothing in this section prevents a Party from using a tribunal, regulator, tax authority, employment-status process or other forum that applicable law makes available.",
        },
      ],
    },
    {
      number: 127,
      heading: "Québec Tutors",
      partTitle: "Part XXXV — Québec",
      blocks: [
        { type: "p", text: "Where Tutor resides or provides services in Québec, mandatory Québec law applies to the extent required notwithstanding this Agreement." },
        { type: "p", text: "Nothing in this Agreement is intended to waive non-waivable Québec rights." },
      ],
    },
    {
      number: 128,
      heading: "French Version",
      blocks: [
        { type: "p", text: "FutureTutor intends to make a complete French version of this Agreement available." },
        {
          type: "p",
          text: "Where Québec law requires the French version of a contract of adhesion to be provided before the Parties choose another language, FutureTutor will provide the French version in accordance with applicable requirements.",
        },
      ],
    },
    {
      number: 129,
      heading: "Language Choice",
      blocks: [
        {
          type: "p",
          text: "Where legally applicable, a Tutor who has first been provided the French version and has had the opportunity to examine it may expressly choose to enter into the English version in accordance with applicable Québec law.",
        },
        { type: "p", text: "FutureTutor must not make the French version materially less favourable than the English version." },
      ],
    },
    {
      number: 130,
      heading: "Future Changes",
      partTitle: "Part XXXVI — Changes to the Agreement",
      blocks: [
        { type: "p", text: "FutureTutor may update this Agreement prospectively where reasonably necessary because of:" },
        { type: "ul", items: ["legal changes;", "Platform changes;", "payment-provider requirements;", "safety requirements;", "new services;", "business changes."] },
      ],
    },
    {
      number: 131,
      heading: "Material Changes",
      blocks: [
        { type: "p", text: "Where required by law or appropriate in the circumstances, FutureTutor will provide reasonable notice of material changes." },
        { type: "p", text: "FutureTutor may require Tutor to affirmatively accept a materially revised Agreement before continuing to receive new tutoring opportunities." },
        { type: "p", text: "Changes should not retroactively deprive Tutor of already earned compensation except where required by law or necessary to correct fraud or manifest error." },
      ],
    },
    {
      number: 132,
      heading: "Electronic Acceptance",
      partTitle: "Part XXXVII — Electronic Agreement",
      blocks: [
        { type: "p", text: "Tutor may accept this Agreement electronically." },
        { type: "p", text: "Electronic acceptance has the same intended contractual effect as a handwritten signature to the extent permitted by applicable law." },
      ],
    },
    {
      number: 133,
      heading: "Record of Acceptance",
      blocks: [
        { type: "p", text: "FutureTutor may maintain records concerning:" },
        {
          type: "ul",
          items: [
            "Tutor identity;",
            "Agreement version;",
            "acceptance timestamp;",
            "language;",
            "IP/technical evidence where appropriate and legally permitted;",
            "related consent records.",
          ],
        },
        { type: "p", text: "Such records are handled in accordance with FutureTutor's Privacy Policy." },
      ],
    },
    {
      number: 134,
      heading: "Tutor Assignment",
      partTitle: "Part XXXVIII — Assignment",
      blocks: [
        {
          type: "p",
          text: "Tutor may not transfer Tutor's FutureTutor account or assign the personal performance of accepted tutoring services to another individual without FutureTutor's authorization.",
        },
        { type: "p", text: "This restriction is necessary because Tutor eligibility and qualifications are individually validated." },
      ],
    },
    {
      number: 135,
      heading: "FutureTutor Assignment",
      blocks: [
        { type: "p", text: "FutureTutor may assign this Agreement in connection with:" },
        { type: "ul", items: ["corporate reorganization;", "merger;", "acquisition;", "financing;", "sale of substantially all relevant business assets;", "transfer to an affiliate;"] },
        { type: "p", text: "subject to applicable law." },
      ],
    },
    {
      number: 136,
      heading: "No Unauthorized Substitute Tutor",
      partTitle: "Part XXXIX — Subcontracting",
      blocks: [
        { type: "p", text: "Tutor must personally perform accepted tutoring services unless FutureTutor expressly authorizes another arrangement." },
        { type: "p", text: "Tutor must not send an unverified substitute to a Student." },
        {
          type: "p",
          text: "This restriction protects Student safety, qualification verification and privacy and does not authorize FutureTutor to control Tutor's independent business outside FutureTutor.",
        },
      ],
    },
    {
      number: 137,
      heading: "Force Majeure",
      partTitle: "Part XL — Force Majeure",
      blocks: [
        { type: "p", text: "Neither Party will be responsible for failure to perform caused by circumstances reasonably beyond that Party's control, subject to applicable law." },
        { type: "p", text: "Examples may include:" },
        { type: "ul", items: ["severe weather;", "natural disaster;", "major infrastructure outage;", "governmental restriction;", "widespread communications failure;", "serious emergency."] },
        { type: "p", text: "The affected Party should provide reasonable notice where practicable." },
      ],
    },
    {
      number: 138,
      heading: "Electronic Notices",
      partTitle: "Part XLI — Notices",
      blocks: [
        { type: "p", text: "FutureTutor may provide contractual notices through:" },
        { type: "ul", items: ["email;", "Tutor dashboard;", "Platform notifications;", "other legally permitted electronic methods."] },
        { type: "p", text: "Tutor is responsible for maintaining accurate contact information." },
      ],
    },
    {
      number: 139,
      heading: "Notices to FutureTutor",
      blocks: [
        { type: "p", text: "Formal legal notices may be sent to:" },
        { type: "p", text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada" },
        { type: "p", text: "Email:\nlegal@futuretutor.ca" },
      ],
    },
    {
      number: 140,
      heading: "Entire Agreement",
      partTitle: "Part XLII — General Provisions",
      blocks: [
        {
          type: "p",
          text: "This Agreement, together with documents expressly incorporated into it, constitutes the agreement between FutureTutor and Tutor concerning Tutor's provision of tutoring services through FutureTutor.",
        },
      ],
    },
    {
      number: 141,
      heading: "Order of Precedence",
      blocks: [
        { type: "p", text: "Where documents conflict, the following order should apply unless expressly stated otherwise:" },
        {
          type: "ol",
          items: [
            "mandatory applicable law;",
            "specific written Booking terms concerning a particular transaction;",
            "this Tutor Agreement;",
            "FutureTutor Terms of Service;",
            "applicable Platform policies.",
          ],
        },
        { type: "p", text: "Stripe's own agreements independently govern Tutor's relationship with Stripe." },
      ],
    },
    {
      number: 142,
      heading: "Severability",
      blocks: [
        {
          type: "p",
          text: "If a provision is held unenforceable, it will be interpreted or severed only to the extent necessary, and the remaining provisions will continue to the extent legally permitted.",
        },
      ],
    },
    {
      number: 143,
      heading: "No Waiver",
      blocks: [{ type: "p", text: "Failure to enforce a provision on one occasion does not automatically waive FutureTutor's or Tutor's right to enforce it later." }],
    },
    {
      number: 144,
      heading: "Headings",
      blocks: [{ type: "p", text: "Headings are provided for convenience and do not independently determine legal interpretation." }],
    },
    {
      number: 145,
      heading: "Survival",
      blocks: [
        { type: "p", text: "Provisions concerning:" },
        {
          type: "ul",
          items: [
            "earned compensation;",
            "taxes;",
            "confidentiality;",
            "privacy;",
            "intellectual property;",
            "fraud;",
            "indemnification;",
            "liability;",
            "disputes;",
            "governing law;",
            "obligations intended by their nature to survive",
          ],
        },
        { type: "p", text: "continue after termination as applicable." },
      ],
    },
    {
      number: 146,
      heading: "Independent Business Acknowledgement",
      partTitle: "Part XLIII — Tutor Acknowledgements",
      blocks: [
        {
          type: "p",
          text: "Tutor acknowledges the Parties' intention that Tutor operate as an independent service provider, subject always to the legal classification resulting from the actual relationship and applicable law.",
        },
        { type: "p", text: "Tutor acknowledges that FutureTutor does not guarantee work or earnings." },
      ],
    },
    {
      number: 147,
      heading: "Freedom to Work Elsewhere",
      blocks: [{ type: "p", text: "Tutor acknowledges that this Agreement does not generally prohibit Tutor from working elsewhere or operating Tutor's own independent tutoring business." }],
    },
    {
      number: 148,
      heading: "Opportunity Acceptance",
      blocks: [
        { type: "p", text: "Tutor acknowledges that Tutor generally determines whether to make themselves available and whether to accept individual tutoring opportunities." },
        { type: "p", text: "Once Tutor accepts a confirmed Booking, Tutor assumes contractual obligations associated with that Booking." },
      ],
    },
    {
      number: 149,
      heading: "Payout Acknowledgement",
      blocks: [
        { type: "p", text: "Tutor acknowledges that:" },
        {
          type: "ul",
          items: [
            "FutureTutor determines customer pricing;",
            "FutureTutor determines the offered Tutor payout under its applicable payout rules;",
            "customer price and Tutor payout are separate;",
            "Tutor sees or is informed of the applicable payout before acceptance;",
            "FutureTutor may retain the difference between customer price and Tutor payout.",
          ],
        },
      ],
    },
    {
      number: 150,
      heading: "Tax Acknowledgement",
      blocks: [{ type: "p", text: "Tutor acknowledges responsibility for determining Tutor's own tax, registration and reporting obligations, subject to applicable law." }],
    },
    {
      number: 151,
      heading: "Safety Acknowledgement",
      blocks: [{ type: "p", text: "Tutor acknowledges that tutoring may involve minors and agrees to comply with FutureTutor's child-safety, privacy and professional-boundary requirements." }],
    },
    {
      number: 152,
      heading: "Privacy Acknowledgement",
      blocks: [
        { type: "p", text: "Tutor acknowledges receiving access to:" },
        { type: "ul", items: ["FutureTutor Privacy Policy;", "FutureTutor Cookie Policy;", "applicable privacy requirements relevant to Tutors."] },
      ],
    },
    {
      number: 153,
      heading: "Stripe Acknowledgement",
      blocks: [
        { type: "p", text: "Where Tutor uses Stripe Connect, Tutor acknowledges that payment and payout services are also governed by applicable Stripe agreements." },
        { type: "p", text: "Tutor agrees to complete required Stripe onboarding and provide accurate information." },
      ],
    },
    {
      number: 154,
      heading: "Agreement",
      partTitle: "Part XLIV — Signature and Acceptance",
      blocks: [
        {
          type: "p",
          text: "BY SELECTING “I AGREE,” “ACCEPT,” “BECOME A TUTOR,” OR AN EQUIVALENT ELECTRONIC ACCEPTANCE MECHANISM, OR BY CONTINUING TO PROVIDE TUTORING SERVICES AFTER VALID ACCEPTANCE OF THIS AGREEMENT, TUTOR CONFIRMS THAT:",
        },
        {
          type: "ul",
          items: [
            "Tutor has read this Agreement;",
            "Tutor has had the opportunity to review it before acceptance;",
            "Tutor understands its material terms;",
            "Tutor agrees to be bound by it;",
            "Tutor has had access to applicable incorporated policies;",
            "Tutor has authority to enter into the Agreement;",
            "information provided to FutureTutor is materially accurate.",
          ],
        },
        { type: "p", text: "Where applicable law requires separate consent or acknowledgement, this general acceptance does not replace that requirement." },
      ],
    },
    {
      number: 155,
      heading: "FutureTutor",
      partTitle: "Part XLV — Contact Information",
      blocks: [
        { type: "p", text: "FutureTutor\nOwned and operated by FYRA SERVICES INC." },
        { type: "p", text: "8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada" },
        { type: "p", text: "Legal: legal@futuretutor.ca\nPrivacy: legal@futuretutor.ca\nWebsite: futuretutor.ca" },
      ],
    },
    {
      number: 156,
      heading: "Effective Date",
      partTitle: "Part XLVI — Effective Date",
      blocks: [
        { type: "p", text: "This Tutor Independent Service Provider Agreement is effective:" },
        { type: "p", text: "August 30, 2026" },
        { type: "p", text: "Last Updated:" },
        { type: "p", text: "August 30, 2026" },
      ],
    },
    {
      number: 157,
      heading: "Tutor Code of Conduct",
      partTitle: "Annex A — Tutor Code of Conduct",
      blocks: [
        { type: "p", text: "This Annex forms part of the Agreement." },
        { type: "p", text: "Tutor agrees to:" },
        {
          type: "ul",
          items: [
            "arrive on time;",
            "provide professional tutoring;",
            "maintain appropriate boundaries;",
            "protect Student privacy;",
            "comply with child-safety rules;",
            "maintain academic integrity;",
            "accurately record attendance;",
            "respect Parents and Guardians;",
            "respect Student diversity;",
            "avoid harassment and discrimination;",
            "protect exact tutoring addresses;",
            "protect Arrival Instructions;",
            "use Virtual Classroom features appropriately;",
            "avoid unauthorized recording;",
            "avoid payment circumvention;",
            "avoid fraudulent reviews or Bookings;",
            "report serious safety incidents;",
            "keep qualifications accurate;",
            "safeguard Tutor account credentials;",
            "comply with applicable law.",
          ],
        },
        { type: "p", text: "Serious violation may result in immediate suspension or termination." },
      ],
    },
    {
      number: 158,
      heading: "Child Safety Standard",
      partTitle: "Annex B — Child Safety Standard",
      blocks: [
        { type: "p", text: "Tutor must:" },
        {
          type: "ul",
          items: [
            "Maintain professional boundaries. The tutoring relationship must remain educational and professionally appropriate.",
            "Avoid secret communications. Tutor must not instruct a minor to hide communications from a Parent or Guardian.",
            "Avoid unauthorized meetings. Tutor must not arrange private meetings with minors outside authorized tutoring arrangements for an improper purpose.",
            "Never engage in sexual or romantic conduct.",
            "Never request intimate images.",
            "Never engage in grooming or exploitation.",
            "Never use physical punishment.",
            "Never transport a Student as a FutureTutor service unless FutureTutor expressly introduces and authorizes such functionality.",
            "Respect authorized Parent/Guardian involvement.",
            "Report serious safety concerns.",
          ],
        },
        { type: "p", text: "Where applicable law imposes a mandatory reporting obligation, Tutor remains responsible for complying with that obligation." },
      ],
    },
    {
      number: 159,
      heading: "In-Person Tutoring Standard",
      partTitle: "Annex C — In-Person Tutoring Standard",
      blocks: [
        { type: "p", text: "For in-person Bookings:" },
        { type: "p", text: "Before confirmation" },
        { type: "p", text: "Tutor may receive only approximate location information." },
        { type: "p", text: "After authoritative confirmation" },
        { type: "p", text: "Authorized Tutor may receive:" },
        { type: "ul", items: ["exact tutoring address;", "Arrival Instructions;", "necessary Student/Guardian information."] },
        { type: "p", text: "Tutor must:" },
        {
          type: "ul",
          items: [
            "use location only for the Booking;",
            "keep it confidential;",
            "not share it;",
            "not publish it;",
            "not revisit the residence without authorization;",
            "not retain private location information longer than reasonably necessary;",
            "respect household boundaries;",
            "leave after authorized tutoring activity concludes.",
          ],
        },
      ],
    },
    {
      number: 160,
      heading: "Virtual Classroom Standard",
      partTitle: "Annex D — Virtual Classroom Standard",
      blocks: [
        { type: "p", text: "Tutor must:" },
        {
          type: "ul",
          items: [
            "use the classroom professionally;",
            "protect Student privacy;",
            "use camera/microphone responsibly;",
            "screen-share only appropriate material;",
            "avoid exposing private desktop content;",
            "respect authorized observers;",
            "not circumvent observer restrictions;",
            "not independently record sessions without authorization and legally required consent;",
            "not share access tokens or private session links;",
            "report security issues.",
          ],
        },
      ],
    },
    {
      number: 161,
      heading: "Compensation Principles",
      partTitle: "Annex E — Compensation Principles",
      blocks: [
        { type: "p", text: "Unless a Booking expressly provides otherwise:" },
        {
          type: "ul",
          items: [
            "FutureTutor determines customer price.",
            "FutureTutor independently determines Tutor payout.",
            "Tutor sees or receives the applicable payout before accepting.",
            "Tutor may decline an opportunity.",
            "Acceptance creates commitment to the displayed payout rules.",
            "Customer price is not Tutor's gross revenue.",
            "FutureTutor may retain its spread.",
            "Tutor payout may be affected by legitimate cancellation/no-show rules.",
            "Fraudulent sessions are not payable.",
            "Valid completed sessions are payable subject to payment-provider and legal requirements.",
            "FutureTutor may preserve immutable Booking payout snapshots.",
            "Future payout-rule changes do not ordinarily retroactively change confirmed Bookings.",
          ],
        },
      ],
    },
    {
      number: 162,
      heading: "Tutor Independence Principles",
      partTitle: "Annex F — Tutor Independence Principles",
      blocks: [
        { type: "p", text: "The Parties intend the relationship to operate consistently with independent service provision." },
        { type: "p", text: "Accordingly, subject to Platform safety and quality requirements:" },
        {
          type: "ul",
          items: [
            "FutureTutor does not guarantee work;",
            "Tutor has no general minimum-hour obligation;",
            "Tutor chooses availability;",
            "Tutor may generally decline opportunities;",
            "Tutor may work elsewhere;",
            "Tutor may operate an independent tutoring business;",
            "Tutor ordinarily provides their own equipment;",
            "Tutor bears ordinary independent business expenses;",
            "Tutor is responsible for applicable independent tax obligations;",
            "Tutor retains reasonable pedagogical discretion;",
            "Tutor is not authorized to bind FutureTutor;",
            "FutureTutor's quality and safety standards do not, by themselves, create an intention of employment.",
          ],
        },
        {
          type: "p",
          text: "The Parties acknowledge that applicable authorities and courts determine legal status based on the actual relationship and applicable law, not solely this Annex.",
        },
      ],
    },
  ],
};
