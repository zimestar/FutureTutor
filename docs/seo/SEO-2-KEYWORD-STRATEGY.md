# FutureTutor — Bilingual Keyword & Search-Intent Strategy (SEO-2)

Research + strategy only. Zero application code changed by this mission
(confirmed at the end of this document). Every product capability, subject,
academic level, tutoring mode, and piece of existing copy referenced below
was read directly from the live codebase — nothing here is invented. Every
search-volume/difficulty/CPC figure is explicitly `UNKNOWN` — this mission
had no keyword-data-API access, and fabricating numbers would make this
document actively harmful to SEO-3. This document is the direct input for
SEO-3 (information architecture).

---

## 0. The one fact that shapes everything below

**Production currently has exactly one (1) approved tutor** — Edmonton,
AB, subject: Math, mode: BOTH (online + in-person). Confirmed via a
read-only production query at the time of this mission (2026-09-16).

This is not a criticism — it's the correct state for a marketplace at this
stage — but it makes one architectural principle non-negotiable for every
recommendation in this document: **FutureTutor is currently supply-
constrained, not demand-constrained.** A subject×city page for "Science
Tutor Edmonton" would today have zero real tutors to show. Publishing it
anyway is the textbook definition of a thin/doorway page — exactly what
Google's own guidance (and this mission's Phase 8 instruction) says to
avoid. Every page-creation recommendation below is gated on real supply,
not aspirational demand. Where supply doesn't yet exist, the recommendation
is content/architecture that remains true and useful regardless of current
tutor count (informational content, recruitment content, the existing
directory/subject hub pages) rather than a new commercial page that would
be broken on day one.

This also means: **tutor-recruitment SEO is not a secondary concern behind
parent/student demand SEO — for FutureTutor's current stage, growing
supply is arguably the higher-leverage investment**, because every other
page's usefulness (and therefore its own SEO performance — thin pages with
zero results rank poorly and convert worse) depends on there being real
tutors behind it.

---

## 1. Executive Summary

FutureTutor is a Canadian bilingual (EN/FR) tutoring **marketplace** —
distinct from both (a) single-agency tutoring services (Teachers on Call,
Tutor Doctor, A&D Tutoring — one company matches you to their own tutors)
and (b) thin directories (Superprof-style listing aggregators). FutureTutor
combines tutor discovery, a real structured multi-step validation pipeline
(document review → interview → training → exam → final review — see §9),
managed/versioned pricing (the customer never negotiates a rate directly
with the tutor), Quick Match dispatch, and an in-platform booking/session/
messaging system. This combination is the genuine differentiation story —
the SEO strategy should say so, honestly, without borrowing language
("background checks," "guaranteed," "certified") the product itself does
not use (FutureTutor's own FAQ copy already states: *"FutureTutor does not
claim background checks or guarantees beyond this process"* — this
document treats that sentence as a hard constraint, not a suggestion).

**Initial geographic focus: Edmonton, Alberta** — not a strategic guess,
but the only city with any current real tutor supply. Expansion to
Calgary → Alberta-wide → Canada should be **supply-triggered**, not
calendar-triggered (see §6.2 for the exact rule).

**Ten real subjects exist today**: math, english, french, science,
chemistry, physics, biology, computer-science, exam-prep, elementary. Two
of these (`exam-prep`, `elementary`) are not academic subjects in the
conventional sense — `exam-prep` is intent-based and `elementary` is
level-based, both folded into the same taxonomy today. This matters for
the URL/IA strategy (§8) and is flagged, not silently treated as 10
uniform "subjects."

**Six real academic levels exist**: elementary, middleSchool, highSchool,
cegepCollege, university, adultLearner — notably including CEGEP/college
and adult learners, which most competitor sites in this space do not
explicitly serve. This is a real, underused differentiation angle.

**Real competitor landscape** (via live web search, this mission —
see §15): Edmonton's tutoring search results are dominated by single-
agency services with dedicated city pages (Tutorax, Tutor Doctor, School
Is Easy, TutorBright, RM Tutoring) and one marketplace competitor
(Superprof). This confirms city-level tutoring pages are a real, actively
contested pattern in this vertical — not a hypothetical. On the French
side, competitors (Tutorax, SOSprof, Mon-Tuteur, Tuteur Scolaire) actively
rank on *"aide aux devoirs," "soutien scolaire,"* and *"cours
particuliers"* — terms FutureTutor's own current copy does not yet use at
all (see §5 for exact current usage counts).

---

## 2. Search Personas (Phase 1)

### PARENT
- **Primary goal**: find a trustworthy, qualified tutor for their child
  without spending hours vetting candidates themselves.
- **Search intent mix**: commercial investigation (comparing options) →
  transactional/local (ready to book) → informational (earlier-funnel,
  "is my child behind," "how much does tutoring cost").
- **Conversion goal**: create an account, submit/complete a booking (direct
  booking or Quick Match request).
- **Common query types**: `[subject] tutor [city]`, `online tutor for
  [grade]`, `how much does a tutor cost`, `how to find a good tutor`,
  `is online tutoring effective`, `child struggling with [subject]`.

### STUDENT
- **Primary goal**: get unblocked on a specific subject/topic, often
  urgently (exam tomorrow, assignment due).
- **Search intent mix**: skews more transactional/local and time-pressured
  than parents; less brand-comparison behavior.
- **Conversion goal**: same as parent (account + booking), but the search
  behavior is faster/narrower — often a single subject + "help" or
  "tutor" + urgency modifier.
- **Common query types**: `[subject] help online`, `[subject] tutor near
  me`, `exam prep [subject]`, `urgent math help`, `online tutor tonight`.

### TUTOR
- **Primary goal**: find flexible, legitimate paid tutoring work — often
  a university student or a credentialed teacher supplementing income.
- **Search intent mix**: tutor-recruitment (a distinct taxonomy category,
  §3) — job-search behavior, not tutoring-service behavior. Must never be
  served the parent/student pages.
- **Conversion goal**: start a tutor application (`/become-a-tutor` →
  signup as TUTOR → the real validation pipeline).
- **Common query types**: `tutoring jobs [city]`, `become a tutor`,
  `online tutor jobs Canada`, `part-time tutoring jobs`, `tutor jobs for
  university students`.

---

## 3. Search Intent Taxonomy (Phase 2)

| Category | Definition | Example | Typically maps to |
|---|---|---|---|
| **Transactional** | Ready to act now | "book a math tutor online" | `/find-tutors`, direct booking flow |
| **Commercial investigation** | Comparing options before acting | "best online tutoring Canada", "FutureTutor vs [competitor]" | Landing/comparison content, `/how-it-works` |
| **Informational** | Learning, not yet ready to transact | "how to help my child with fractions" | Resource articles (§12) |
| **Navigational** | Looking for a specific known brand/page | "FutureTutor login" | Existing app pages — **never** a new SEO target |
| **Tutor recruitment** | Job-seeking behavior, not a customer | "tutoring jobs Edmonton" | `/become-a-tutor`, `/tutor-resources` |
| **Local** | Geographic modifier present, usually stacked with transactional or recruitment | "math tutor Edmonton" | Local landing pages, gated by supply (§6) |

**Not every query deserves a page.** Navigational queries never do
(serving a marketing page for "FutureTutor login" actively hurts UX).
Many informational long-tail queries are better served by consolidating
into a smaller number of genuinely useful pillar articles (§12) than by
one page per phrase — the latter is the thin-content trap this mission
explicitly warns against.

---

## 4. Canadian Language Review (Phase 4)

### English
Confirmed via direct codebase inspection (`messages/en.json`): "tutor"
appears 230 times, "tutoring" 52 times — "tutor" (the person) is the
product's dominant term, "tutoring" (the activity) secondary. **Phrases
that do not currently appear anywhere in the product's own copy**:
"private tutor," "academic tutor," "homework help." These are common,
legitimate Canadian search phrases (confirmed present in competitor
copy, §15) worth testing as secondary/supporting keywords in new content
— but they are not yet part of FutureTutor's own voice, so they should be
introduced deliberately (e.g., as an alternate phrasing inside a resource
article's body, or a subheading) rather than assumed as primary terms.

School-level terms: use "elementary," "middle school" (not "junior high,"
which is more common in some Alberta/Western-Canada usage but is not
FutureTutor's own term — the real seeded academic level is `middleSchool`
→ display "Middle School"), "high school," and — distinctively —
"CEGEP/college" and "adult learner," both real, both underused by
competitors in initial research.

### French
Confirmed via direct codebase inspection (`messages/fr.json`): "tuteur"
appears 238 times, "tutorat" 49 times — same person-dominant/activity-
secondary pattern as English, and correctly matches real French-Canadian
tutoring-market usage (confirmed via competitor search, §15).

**Important terminology risk, not previously documented**: in Canadian
French, **"tuteur" can also mean legal guardian** (FutureTutor's own copy
uses it exactly this way in places — *"tuteur légal"*). This is a genuine
dual-meaning risk specific to French that does not exist in English. Any
new French SEO content must keep "tuteur" (tutoring professional)
unambiguous from context (e.g., pairing with "tutorat," "enseignant," or
a subject) rather than relying on the bare word alone, especially in
titles/headings where context is thinner.

**Phrases that do not currently appear anywhere in FutureTutor's French
copy at all**: "cours particuliers," "aide aux devoirs," "devoirs"
(homework), "rattrapage." All four are confirmed, actively-used terms by
real French-Canadian competitors (Tutorax's own tagline is literally
*"#1 en Tutorat - Aide aux devoirs - Soutien scolaire"* — §15). This is a
genuine, real content gap, not a hypothesis: FutureTutor's French SEO
content should test these terms, particularly "aide aux devoirs" for
homework-help-shaped informational content and "cours particuliers" as a
secondary synonym near "tutorat" in body copy. **Do not blindly translate
English pages word-for-word** — the French content should be written
around these market-validated French phrases directly, the same
discipline already visible in FutureTutor's own existing French copy
(which is native, not machine-translated-feeling).

"Soutien scolaire" (academic support) already appears naturally in
FutureTutor's own copy — a good existing bridge term between "tutorat"
and the broader French-Canadian search vocabulary.

---

## 5. English Keyword Map (Phase 5)

Format: cluster → persona → intent → funnel stage → geo? → subject? →
level? → content type → target page → priority. Search volume: **UNKNOWN**
for every row (no keyword-data source available — see §16 policy below).

| Cluster | Persona | Intent | Funnel | Geo | Subject | Level | Content type | Target page | Priority |
|---|---|---|---|---|---|---|---|---|---|
| tutor / tutoring (brand-neutral head term) | Parent, Student | Commercial investigation | Mid | No | No | No | Landing page | `/` (home) | P1 |
| find a tutor / tutor search | Parent, Student | Transactional | Bottom | No | No | No | Landing page | `/find-tutors` | P1 |
| online tutor / online tutoring | Parent, Student | Transactional/Commercial | Mid-Bottom | No | No | No | Landing page | `/find-tutors` (mode filter) — **see §10 for whether a dedicated page is justified** | P1 |
| in-person tutor / in-home tutoring | Parent | Transactional | Bottom | Implicit local | No | No | Existing directory filter | `/find-tutors` | P2 |
| math tutor | Parent, Student | Transactional | Bottom | No | Math | No | Subject page (exists) | `/subjects/math` | P1 |
| english tutor | Parent, Student | Transactional | Bottom | No | English | No | Subject page (exists) | `/subjects/english` | P2 |
| french tutor | Parent, Student | Transactional | Bottom | No | French | No | Subject page (exists) | `/subjects/french` | P2 |
| science tutor | Parent, Student | Transactional | Bottom | No | Science | No | Subject page (exists) | `/subjects/science` | P2 |
| chemistry tutor | Student | Transactional | Bottom | No | Chemistry | High school+ | Subject page (exists) | `/subjects/chemistry` | P2 |
| physics tutor | Student | Transactional | Bottom | No | Physics | High school+ | Subject page (exists) | `/subjects/physics` | P2 |
| biology tutor | Student | Transactional | Bottom | No | Biology | High school+ | Subject page (exists) | `/subjects/biology` | P3 |
| computer science tutor / coding tutor | Student | Transactional | Bottom | No | Computer science | High school+ | Subject page (exists) | `/subjects/computer-science` | P3 |
| exam prep / test prep tutor | Student | Transactional | Bottom | No | — (intent, not subject) | High school+ | Existing page, needs clearer framing (§9) | `/subjects/exam-prep` | P2 |
| elementary tutor / elementary tutoring | Parent | Transactional | Bottom | No | — (level, not subject) | Elementary | Existing page, needs clearer framing (§9) | `/subjects/elementary` | P2 |
| math tutor Edmonton | Parent, Student | Transactional/Local | Bottom | **Edmonton** | Math | No | **CREATE LATER** — see §8 (real supply exists, but 1 tutor is thin; wait for 3-5+) | none yet | P1 (future) |
| [other subject] tutor Edmonton | Parent, Student | Transactional/Local | Bottom | Edmonton | Varies | No | **DO NOT CREATE YET** — zero current supply outside math | none | P3 |
| tutoring Edmonton (general) | Parent | Transactional/Local | Bottom | Edmonton | No | No | **CREATE NOW-candidate** — see §7 | new local landing page | P1 |
| tutoring Alberta | Parent | Commercial investigation | Mid | Alberta (broad) | No | No | Not yet — Edmonton-only supply | none | P3 |
| tutoring Canada / tutoring across Canada | Parent | Commercial investigation | Top-Mid | Canada (broad) | No | No | Reflects real service-area claim (online mode has no geographic limit) — home/`/how-it-works` framing only, not a dedicated page yet | `/`, `/how-it-works` | P2 |
| homework help | Parent, Student | Informational/Transactional mix | Mid | No | No | No | Resource article (not currently a product term — see §4) | new resource | P2 |
| how to find a good tutor | Parent | Informational | Top | No | No | No | Resource article | new resource | P2 |
| how much does tutoring cost | Parent | Informational/Commercial | Mid | No | No | No | Resource article + honest, non-committal framing (pricing is dynamic/quoted, not a fixed rate card — see §13) | new resource | P1 |
| online vs in-person tutoring | Parent | Informational/Commercial | Mid | No | No | No | Resource article | new resource | P1 |
| how are FutureTutor tutors vetted / how tutors are selected | Parent | Informational/Trust | Mid | No | No | No | Resource article, grounded in the real pipeline (§9) | new resource, linked from `/how-it-works` | P1 |
| become a tutor | Tutor | Recruitment | Bottom | No | No | No | Existing page | `/become-a-tutor` | P1 |
| tutoring jobs Edmonton | Tutor | Recruitment/Local | Bottom | Edmonton | No | No | Existing page, needs local framing (§11) | `/become-a-tutor` | P1 |
| online tutor jobs Canada | Tutor | Recruitment | Bottom | Canada (broad) | No | No | Existing page, needs framing | `/become-a-tutor` | P2 |
| university student tutor jobs | Tutor | Recruitment | Bottom | No | No | No | Resource article + `/become-a-tutor` | `/tutor-resources` | P2 |
| FutureTutor login / FutureTutor sign up | Existing user | Navigational | N/A | No | No | No | **DO NOT TARGET** (already noindexed per SEO-1) | n/a | N/A |

**~28 EN clusters** documented above (exact count reported in the final
checkpoint).

---

## 6. French Keyword Map (Phase 6)

Not a translation of §5 — built around the terms real French-Canadian
search behavior and competitors actually use (§4, §15).

| Cluster (FR) | English equivalent (for reference only) | Persona | Intent | Content type | Target page | Priority |
|---|---|---|---|---|---|---|
| tuteur / tutorat (tête de série) | tutor / tutoring | Parent, Student | Commercial investigation | Landing page | `/fr` (home) | P1 |
| trouver un tuteur | find a tutor | Parent, Student | Transactional | Landing page (exists) | `/fr/find-tutors` | P1 |
| tutorat en ligne / tuteur en ligne | online tutoring | Parent, Student | Transactional/Commercial | Landing page | `/fr/find-tutors` (filtre mode) | P1 |
| cours particuliers *(terme concurrent réel, absent du produit — §4)* | private lessons | Parent | Commercial investigation | Secondary phrasing inside body copy, not a primary heading | supporting keyword only | P2 |
| aide aux devoirs *(terme concurrent réel, absent du produit — §4)* | homework help | Parent, Student | Informational/Transactional | Resource article (nouveau) | new resource | P1 |
| soutien scolaire *(déjà présent dans le produit)* | academic support | Parent | Informational/Commercial | Existing tone — reuse, don't replace "tutorat" | multiple existing pages already use this naturally | P1 |
| tuteur en mathématiques | math tutor | Parent, Student | Transactional | Subject page (exists) | `/fr/subjects/math` | P1 |
| tuteur en français *(attention: `french` est une matière, pas la langue de recherche — voir note ci-dessous)* | French tutor | Parent, Student | Transactional | Subject page (exists) | `/fr/subjects/french` | P2 |
| tuteur en anglais | English tutor | Parent, Student | Transactional | Subject page (exists) | `/fr/subjects/english` | P2 |
| tuteur en sciences / chimie / physique / biologie | science/chemistry/physics/biology tutor | Student | Transactional | Subject pages (exist) | `/fr/subjects/[slug]` | P2/P3 |
| préparation aux examens | exam prep | Student | Transactional | Existing page, needs framing | `/fr/subjects/exam-prep` | P2 |
| tuteur primaire / tutorat primaire | elementary tutor | Parent | Transactional | Existing page, needs framing | `/fr/subjects/elementary` | P2 |
| tutorat Edmonton | tutoring Edmonton | Parent | Transactional/Local | **CREATE NOW-candidate**, bilingual with §7 | new local page (FR) | P1 |
| comment choisir un tuteur | how to choose a tutor | Parent | Informational | Resource article (nouveau) | new resource | P1 |
| combien coûte le tutorat | how much does tutoring cost | Parent | Informational/Commercial | Resource article (nouveau) | new resource | P1 |
| devenir tuteur | become a tutor | Tutor | Recruitment | Existing page | `/fr/become-a-tutor` | P1 |
| emplois de tutorat Edmonton | tutoring jobs Edmonton | Tutor | Recruitment/Local | Existing page, needs local framing | `/fr/become-a-tutor` | P1 |

**~16 FR clusters** documented above (fewer than EN by design — §6 is
deliberately not a 1:1 mirror of §5; several EN informational clusters
consolidate into fewer, more market-aligned French pillars).

**Important note on "tuteur en français"**: this phrase is genuinely
ambiguous in French — it can mean "a tutor who teaches the French
language" (matches FutureTutor's `french` subject) or "a French-speaking
tutor" (a language-of-instruction preference, which is not how
FutureTutor's subject taxonomy works — `french` is a subject like any
other, not a service-language toggle). Content targeting this phrase must
disambiguate explicitly in the first sentence, or it will attract the
wrong search intent.

**Where FR terms belong**: "tuteur"/"tutorat" in titles, H1s, and primary
CTAs (matches the product's own established voice). "Aide aux devoirs"
and "cours particuliers" as secondary phrasing inside body copy and
subheadings of new resource content — testing market-validated terms
without abandoning the product's own voice. Never keyword-stuff by
stacking all four synonyms in one sentence.

---

## 7. Local SEO Strategy (Phase 7)

**Initial market: Edmonton, Alberta** — confirmed correct by real data
(§0), not just the mission's stated business context.

### 7.1 Local keyword patterns (English)
`tutor Edmonton`, `tutoring Edmonton`, `math tutor Edmonton`, `online
tutor Edmonton`, `in-person tutor Edmonton`, `tutoring jobs Edmonton`
(recruitment — §11). Subject-specific Edmonton combinations (`English
tutor Edmonton`, `French tutor Edmonton`, `science tutor Edmonton`) are
addressed in §8 — most are **CREATE LATER**, gated on real per-subject
supply in Edmonton.

### 7.2 Local keyword patterns (French)
`tutorat Edmonton`, `tuteur Edmonton`. Realistically lower French search
volume for an Alberta city specifically (Edmonton is not a majority-
Francophone market), but still worth a bilingual page — FutureTutor
serves French-speaking families everywhere the product itself is
available (online mode has no geographic limit), and the FR Edmonton page
should say so honestly rather than implying an Edmonton-specific
Francophone community that isn't documented here.

### 7.2 City expansion rule (the concrete answer to Phase 7's explicit ask)

**A city earns a dedicated local page when ALL of the following are true:**

1. **Real approved-tutor supply** — a minimum threshold (recommend 5+
   approved tutors physically based in or serving that city; a single
   tutor, as Edmonton has today, is not yet enough to make a city page
   non-thin — see §0's reasoning). This is a recommended threshold, not a
   verified platform default; confirm against actual conversion/traffic
   data once Edmonton's own page is live.
2. **Subject breadth** — supply should cover at minimum 3-4 of the 10
   real subjects, not just one, so the page has genuine content depth
   rather than "1 tutor teaches 1 subject here."
3. **Fulfillment ability** — the platform can realistically match a
   booking request in that city within a reasonable window (this is a
   product/ops question as much as an SEO one — a city page that
   generates leads the platform can't serve damages trust).
4. **Real demand signal** — some non-fabricated evidence of interest
   (organic traffic already reaching `/find-tutors` with that city in a
   search query, a support/contact inquiry pattern, or a deliberate
   expansion decision made by the business) — not assumed from population
   size alone.

**Do not create a page for a city that fails any of these four** — this
is the direct, explicit answer to this mission's own "define the rule for
when a new city deserves a page" instruction. Today, only Edmonton is
even close (criterion 1 fails at n=1; the page itself is still a
reasonable "CREATE NOW" candidate as a *general* Edmonton tutoring
landing page — see §8's distinction between a general city page and a
subject×city page, which have different thin-content risk profiles).

**Expansion sequence** (per the mission's own stated business direction,
now grounded in the above rule): Edmonton → Calgary (once criteria met)
→ Alberta-wide framing → other Canadian cities, always supply-first.

---

## 8. Subject × Location Combinations (Phase 8)

| Combination | Classification | Reasoning |
|---|---|---|
| General "tutoring Edmonton" landing page | **CREATE NOW** | Real (if thin) supply exists; a general city page can legitimately talk about the platform's Edmonton presence, service modes, and subjects available today without overclaiming depth in any one subject; lower thin-content risk than a subject×city page because it doesn't promise subject-specific local depth |
| Math Tutor Edmonton | **CREATE LATER** | Real supply exists (1 tutor) but is too thin today to justify a dedicated page distinct from the general Edmonton page + the existing `/subjects/math` page; revisit once Edmonton math supply reaches the §7.2 threshold |
| English / French / Science / Chemistry / Physics / Biology / Computer Science Tutor Edmonton | **DO NOT CREATE YET** | Zero confirmed current Edmonton supply for these subjects specifically; publishing would be a textbook doorway page (real risk this mission was explicitly told to avoid) |
| Online Tutor Edmonton | **CREATE LATER** | Legitimate query pattern, but "online" partially dissolves the geographic constraint (an online Edmonton-based tutor can serve non-Edmonton students) — needs a clear content angle distinct from both the general Edmonton page and a pure "online tutoring" page before it's worth a dedicated URL, not just supply |
| Tutoring jobs Edmonton (recruitment, not demand) | **CREATE NOW** | Different intent category entirely (§3, §11) — recruitment content doesn't require *any* existing tutor supply to be genuinely useful; arguably higher priority than several demand-side pages given FutureTutor's current supply-constrained stage (§0) |

**General criteria applied above** (per this mission's explicit request):
search intent match, content uniqueness (can this page say something the
general city page and the subject page can't, together?), real product
supply, ability to provide genuinely useful *local* content (not just a
templated city-name swap), and doorway-page risk. A subject×city page
that would just be the subject page's copy with "Edmonton" inserted a few
times fails the uniqueness test regardless of supply and should not be
built even later, unless it can carry real local content (e.g., relevant
Alberta curriculum notes, local school-calendar-aware exam-prep timing).

---

## 9. Subject × School Level (Phase 9)

FutureTutor's real academic levels: **elementary, middleSchool,
highSchool, cegepCollege, university, adultLearner.**

**Recommendation: one subject page per subject (as exists today), with
level-aware sections within the page, not separate URLs per
subject×level combination**, for these reasons:

- **Distinct user intent exists** (an elementary math parent searches very
  differently from a high-school calculus student) — but this is better
  served by clear **on-page sections/filters** than by fragmenting into
  `/subjects/math/elementary`, `/subjects/math/high-school`, etc., which
  would multiply 10 subjects × 6 levels = 60 potential URLs, the majority
  of which would have near-zero current tutor supply behind them (same
  thin-content risk as §8).
- **Curriculum needs genuinely differ by level**, which argues for
  *content* differentiation (a level-aware paragraph or FAQ item within
  the subject page) rather than URL fragmentation.
- **Conversion value**: `/find-tutors` already supports level filtering
  as part of the real directory/search experience — the subject page's
  job is to capture the search query and hand off to that filtered
  search, not to duplicate it as a static page per combination.
- **Two levels deserve explicit mention in body copy across every subject
  page, not their own pages**: `cegepCollege` and `adultLearner` are real
  differentiators most competitors in the Edmonton search results (§15)
  do not explicitly serve — this is a cheap, honest way to capture that
  demand without new URLs.

**Exception worth flagging, not deciding here**: `exam-prep` and
`elementary` are already separate top-level "subjects" in the real
taxonomy despite being intent/level categories, not subjects. This is an
existing product decision (not something SEO-2 should silently paper
over) — SEO-3 should decide whether to keep this as-is (simplest, already
shipped) or restructure the taxonomy distinction between "subject" and
"level/intent" more cleanly. Flagged as an open input for SEO-3, §21.

---

## 10. Online Tutoring Strategy (Phase 10)

Real product fact: `TutoringMode` is `ONLINE`, `IN_PERSON`, or `BOTH` at
the tutor level (Prisma enum, `prisma/schema.prisma`) — online tutoring is
a real, fully-supported mode today, not a future capability.

**"Canada" framing decision**: FutureTutor's own existing site description
already states *"across Canada"* (`site.description`,
`messages/en.json`), and this is an accurate claim for the **online**
mode specifically (nothing about online tutoring is geographically
limited) — **not** for in-person tutoring, which is genuinely local
(and currently Edmonton-only in practice, per §0).

Recommendation:
- **"Online tutoring Canada" as body-copy/secondary framing**, not a
  primary URL or H1 — it's accurate for the online mode, but making it
  the headline claim risks implying nationwide *in-person* coverage
  FutureTutor doesn't have, and risks looking generic against
  online-specialist competitors.
- **Do not create a standalone `/online-tutoring` page yet** — today,
  "online" is a *mode filter* on `/find-tutors` and a property of
  individual tutor profiles, not a distinct content surface with its own
  unique angle. A dedicated page becomes justified once there's enough
  online-specific content to say (e.g., "how online tutoring sessions
  work on FutureTutor," referencing the real video/session infrastructure)
  that wouldn't just duplicate `/how-it-works`.
- **"Online homework help"** is a real, distinct informational cluster
  (§5/§6) worth a resource article regardless of local supply — it's not
  geography-gated the way in-person content is.

---

## 11. Tutor Recruitment Strategy (Phase 11)

Given FutureTutor's current supply-constrained stage (§0), this is a
**high-priority, not secondary, SEO workstream.**

Real existing recruitment surfaces: `/become-a-tutor` (application entry
point, honest generic copy today — no location/compensation claims) and
`/tutor-resources` (a genuinely well-built, honest orientation hub —
its own copy explicitly says *"without invented policy"* and includes a
disclaimer that it *"does not replace... a guaranteed earnings
statement"*). This document's recommendations match that existing, correct
discipline.

| Query | Maps to | Notes |
|---|---|---|
| tutoring jobs Edmonton / tutor jobs Edmonton | `/become-a-tutor` | Add real local framing ("Edmonton" in copy) since Edmonton is where actual current student demand exists — this is honest, not just SEO bait |
| online tutor jobs Canada | `/become-a-tutor` | Matches the real online mode's geography-independence |
| become a tutor | `/become-a-tutor` | Already the correct target |
| part-time tutoring jobs | `/become-a-tutor`, `/tutor-resources` | Resource content can honestly describe flexibility (real: tutors set their own `TutorAvailability`) without compensation claims |
| university student tutor jobs | `/tutor-resources` new resource article | A real, legitimate recruitment angle (university students are a classic tutor-supply demographic) — content should describe the real application/validation journey already documented in `/tutor-resources`, not invent a "student-tutor program" that doesn't exist as a distinct product feature |

**Explicit constraint carried into every recommendation**: no compensation
figures, no "guaranteed clients," no "flexible high-paying work" framing
— `TutorProfile.hourlyRateCents` is real but deprecated as a customer-
price signal (per the product's own schema comments) and payout amounts
are dynamically quoted per booking, not a fixed rate FutureTutor can
advertise. Recruitment copy should describe the real *process* (apply →
build profile → document review → interview → training → exam → final
review → start receiving bookings) honestly, matching `/tutor-resources`'
own existing tone exactly.

---

## 12. Content Clusters (Phase 12)

Pillar/supporting structure. **No articles are written in this
mission** — this is the content plan SEO-3/content production should
follow.

| Pillar | Supporting topics | Persona | Funnel | CTA |
|---|---|---|---|---|
| **Choosing a tutor** | How FutureTutor vets tutors (grounded in §9's real pipeline); questions to ask before booking; red flags to avoid | Parent | Top-Mid | `/find-tutors`, `/how-it-works` |
| **Online vs. in-person tutoring** | What online sessions look like on FutureTutor (real video/session infra); when in-person makes more sense; hybrid (`BOTH` mode) | Parent | Mid | `/find-tutors` |
| **Cost of tutoring** | How FutureTutor's pricing works (quoted, not negotiated — real product mechanic); what affects price | Parent | Mid | `/find-tutors`, sign-up |
| **Math help** | Common trouble spots by level (framed generally, not curriculum-authoritative); when to get a math tutor | Parent, Student | Top-Mid | `/subjects/math` |
| **Language learning (French/English)** | Building bilingual confidence; exam-specific French support | Parent, Student | Top-Mid | `/subjects/french`, `/subjects/english` |
| **Science help** | Chemistry/physics/biology exam-prep framing | Student | Mid | `/subjects/chemistry`, `/physics`, `/biology` |
| **Exam preparation** | General study strategy; subject-specific exam prep | Student | Mid-Bottom | `/subjects/exam-prep` |
| **Parent guides** | When should my child get a tutor; how to support a struggling learner at home | Parent | Top | `/how-it-works` |
| **Alberta school/curriculum context** | General, non-authoritative orientation content (FutureTutor is not a curriculum authority — this cluster should stay general and link out to real Alberta Education resources rather than claim curriculum expertise it doesn't have) | Parent | Top | `/subjects/*` |
| **Tutor guides** | The real application/validation journey (already exists at `/tutor-resources` — this cluster extends it, doesn't replace it); tips for a strong tutor profile | Tutor | Mid-Bottom | `/become-a-tutor` |

---

## 13. Parent Pain-Point Keywords (Phase 13)

These map to the **Content Clusters** above (§12), not new commercial
landing pages — per this mission's own explicit instruction.

`child struggling with math` → Math help cluster. `how to improve math
grades` → Math help / Choosing a tutor. `homework help` → new dedicated
resource (§5/§6 — real gap, zero current product usage of this exact
phrase). `how to find a good tutor` → Choosing a tutor pillar. `how much
does tutoring cost` → Cost of tutoring pillar (framed honestly around
FutureTutor's real quoted/dynamic pricing, never a fabricated flat rate).
`online tutoring vs in person` → the dedicated pillar of the same name.
`when should my child get a tutor` → Parent guides pillar.

---

## 14. Trust / Safety Search Intent (Phase 14)

FutureTutor's real, structured validation pipeline (`TutorApplicationStatus`
enum, `prisma/schema.prisma`): `DRAFT → SUBMITTED → UNDER_REVIEW →
INTERVIEW_REQUIRED → INTERVIEW_COMPLETED → TRAINING_REQUIRED →
TRAINING_COMPLETED → EXAM_REQUIRED → EXAM_COMPLETED → FINAL_REVIEW →
APPROVED` (or `REJECTED`/`SUSPENDED`). This is genuinely substantial and a
real differentiator — document review, a real interview, real training
modules, a real exam, and a final review gate, all before a tutor profile
goes public.

**Hard constraint, sourced directly from the product's own existing FAQ
copy** (`messages/en.json`): *"Tutors complete their profile, training,
assessment and required document review before an administrator can
approve their public profile. FutureTutor does not claim background
checks or guarantees beyond this process."*

Every trust/safety SEO claim in every future page or article **must**
stay within this exact boundary:

- **Safe to say**: "tutors complete a structured application process
  including document review, an interview, training, and an exam before
  approval"; "profiles are reviewed by FutureTutor before going live";
  "you can see a tutor's approval status and profile details before
  booking."
- **Not safe to say** (not supported by the real process): "background-
  checked," "police-checked," "certified" (in the credentialing-authority
  sense), "verified" without qualifying *what* was verified, "guaranteed"
  anything about outcomes or safety.

Search intent to target with this honest framing: `how are FutureTutor
tutors vetted`, `qualified tutors Edmonton`, `how to choose a tutor`,
`is [FutureTutor] safe` (brand-defense informational content, useful once
the brand has enough search volume for this pattern to matter).

---

## 15. Competitor / SERP Model (Phase 15)

**Internet access was available in this session** — the following is
real live web-search research performed for this mission, not
fabricated. No competitor content was copied; only page-type and
positioning patterns were observed.

**English / Edmonton search landscape**: dominated by single-agency
tutoring services with dedicated Edmonton-area pages — Teachers on Call,
Tutor Doctor (city/region-specific URL pattern, e.g.
`.../edmonton-south-sherwood-park/areas-we-serve/edmonton/`), School Is
Easy, TutorBright, A&D Tutoring, RM Tutoring (serves Edmonton/Calgary/
Lethbridge as a multi-city Western-Canada operator, a useful precedent for
FutureTutor's own Edmonton → Calgary → Alberta expansion sequencing). One
real marketplace-model competitor was found: **Superprof** (a
peer-marketplace with per-city listing pages, e.g.
`superprof.ca/lessons/all-tutors/edmonton/`, advertising rates "from
$15/hr") — the closest structural analog to FutureTutor in this specific
search result set, and worth periodic informal monitoring (not scraping)
as the nearest competitive marketplace pattern.

**Confirmed pattern**: every serious competitor in this space maintains a
**dedicated city landing page** — real, independent validation of §7/§8's
local-page strategy, not just this mission's own hypothesis.

**French / Canada search landscape**: Tutorax (bilingual, same company as
above), SOSprof, Succès Scolaire, Mon-Tuteur.ca, Tuteur Scolaire,
ServicesTutorat.ca. Confirms real, active use of "tutorat," "aide aux
devoirs," and "soutien scolaire" as primary French-market terms (directly
informed §4/§6). Notable: Mon-Tuteur's positioning ("assigns a tutor
within 7 days") represents a slower, human-matched model — FutureTutor's
own Quick Match / self-serve booking flow is structurally faster, though
this document does not assert a specific speed claim since that would
need to be verified against FutureTutor's actual real-world matching
performance, not assumed.

**Types of pages ranking** (general pattern observed, not FutureTutor-
specific data): city landing pages, subject landing pages, a smaller
number of homework-help/resource articles, and — notably — very few
*subject×city* combination pages among the top real competitors found,
which is a **supporting signal for §8's conservative subject×city
recommendation**, not just this document's own internal caution.

---

## 16. Search Volume Discipline (Phase 16)

**No keyword-data source (Google Keyword Planner, Ahrefs, SEMrush, etc.)
was available in this session.** Every cluster in §5/§6 is prioritized by
**strategic relevance** — commercial intent strength, direct product fit,
current real supply/architecture value (§0) — never by a search-volume,
keyword-difficulty, or CPC number. **Zero such numbers appear anywhere in
this document.** Any future mission that has real keyword-data-API access
should treat the P1/P2/P3 priorities here as a starting hypothesis to
validate or reorder against real volume data — not as a final ranking
that already accounts for it.

---

## 17. Keyword Cannibalization Map (Phase 17)

| Primary intent | Primary keyword owner | Secondary supporting pages | Do not compete |
|---|---|---|---|
| "find a tutor" / general tutor search | `/find-tutors` | `/` (home, brand-level framing only) | No new page should target this bare phrase |
| Subject-specific tutor search (e.g. "math tutor") | `/subjects/[subject]` | `/find-tutors` (filtered view) | A future "Math Tutoring" resource article must not also target the bare "math tutor" query — it should target informational math-help phrasing instead (§12) |
| "online tutoring" | `/find-tutors` (mode filter) today; a future dedicated page only once justified (§10) | `/how-it-works` (process framing) | Do not let a future `/online-tutoring` page and `/find-tutors` both chase the bare "online tutor" query once the former exists — the new page should own broader "how online tutoring works" framing, `/find-tutors` keeps the transactional "find an online tutor now" intent |
| "tutoring Edmonton" (general local) | New Edmonton landing page (§7, CREATE NOW) | `/find-tutors` (location-aware once it exists), `/subjects/math` (for the one real Edmonton subject match today) | A future subject×Edmonton page (§8, CREATE LATER) must not duplicate the general Edmonton page's content — it should own the narrower subject-specific local intent once built, with the general page linking down to it |
| "become a tutor" / recruitment | `/become-a-tutor` | `/tutor-resources` (deeper orientation content) | `/tutor-resources` must not try to also rank for the bare "become a tutor" transactional query — it owns the informational "what to expect" intent |
| "how it works" / platform explanation | `/how-it-works` | New trust/safety resource content (§14) can link to it, not duplicate it | A new trust/safety article should own the specific "how are tutors vetted" long-tail, not the broad "how it works" query |

**No cannibalization currently exists** among live pages (confirmed by
the SEO-1 audit's own findings — every existing page has a distinct,
self-referencing canonical). The map above exists to prevent
cannibalization from being introduced as SEO-3 builds new pages, not to
fix an existing problem.

---

## 18. Page Type Decision Model (Phase 18)

| Cluster | Decision |
|---|---|
| Home | IMPROVE CURRENT PAGE (framing refinements from this document, not a rebuild) |
| `/find-tutors` | CURRENT PAGE (keep as the transactional owner) |
| `/subjects` (hub) | CURRENT PAGE |
| `/subjects/[subject]` × 10 | IMPROVE CURRENT PAGE (level-aware sections per §9; clarify `exam-prep`/`elementary` framing) |
| `/tutors/[slug]` | CURRENT PAGE (sitemap-inclusion policy remains a separate SEO-1 carryover decision, §0 of SEO-1 baseline) |
| `/how-it-works` | IMPROVE CURRENT PAGE (link to new trust/safety resource, §14) |
| `/become-a-tutor` | IMPROVE CURRENT PAGE (local Edmonton framing, §11) |
| `/tutor-resources` | CURRENT PAGE (already strong; extend with new resource-article links as they're built) |
| General Edmonton tutoring landing page | NEW LOCATION PAGE (EN + FR) |
| Subject×Edmonton pages (all except math) | NO PAGE (yet) |
| Math×Edmonton page | NO PAGE (yet) — CREATE LATER once §7.2 threshold met |
| Homework help / choosing a tutor / cost of tutoring / online vs in-person / how tutors are vetted / when to get a tutor | NEW RESOURCE ARTICLE (×6, the highest-priority content cluster set from §12) |
| Trust/safety FAQ expansion | FAQ SECTION addition to existing homepage `FAQPage` JSON-LD (§14 framing) or `/how-it-works` |
| `/online-tutoring` dedicated page | NO PAGE (yet) — §10 |
| City pages beyond Edmonton | NO PAGE (yet) — §7.2 |

---

## 19. URL Recommendations (Phase 19)

**Proposal only — SEO-3 decides implementation/migration/redirects. No
URLs are renamed by this mission.**

Current pattern is already sound and should be preserved as the backbone:
`/{locale}/subjects/{subject-slug}` for subjects,
`/{locale}/tutors/{slug}` for profiles. Recommended additions follow the
same flat, locale-prefixed convention rather than introducing a new depth
tier:

- **Local pages**: `/{locale}/tutoring-edmonton` (EN) /
  `/fr/tutorat-edmonton` (FR) — flat, not nested under a generic
  `/location/` segment, since there is currently exactly one city; a
  `/location/{city}` prefix can be introduced later *if and when* multiple
  city pages exist and a shared index page under it earns its own URL —
  introducing that structure for a single city today would be premature
  architecture.
- **Resource articles**: `/{locale}/resources/{article-slug}` — a new
  top-level segment, mirroring `/tutor-resources`' existing naming
  instinct but generalized; keeps informational content clearly separated
  from commercial subject/location pages.
- **Subject×location (once justified, §7/§8)**: nest under the subject,
  not the location — `/{locale}/subjects/{subject}/{city}` (e.g.
  `/en/subjects/math/edmonton`) rather than `/{locale}/{city}/{subject}`.
  This keeps the subject as the primary IA owner (matching §17's
  cannibalization map — the subject page is the intent owner, the
  location is a refinement) and avoids a second, competing hierarchy.

**Explicitly avoid**: French subject slugs that don't match the English
data model 1:1 (e.g. inventing `/fr/matieres/mathematiques` when the real
underlying `Subject.slug` is `math`) — SEO-3 should decide whether French
URLs translate the slug (`/fr/subjects/mathematiques`) or keep it
consistent with the DB slug (`/fr/subjects/math`); either is defensible,
but it must be a single deliberate decision, not per-page inconsistency.

---

## 20. Priority Matrix (Phase 20)

### Tier 1 — high commercial relevance + current product fit

| # | Persona | Primary intent | Cluster | Language | Target page | Current/New | Location | Subject | CTA |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Parent, Student | Transactional | find a tutor / general | EN+FR | `/find-tutors` | Current (improve framing) | — | — | Search/book |
| 2 | Parent | Transactional/Local | tutoring Edmonton | EN+FR | New local landing page | New | Edmonton | — | Search/book, view Edmonton tutors |
| 3 | Tutor | Recruitment | become a tutor / tutoring jobs Edmonton | EN+FR | `/become-a-tutor` | Current (improve local framing) | Edmonton (+ online, national) | — | Start application |
| 4 | Parent | Informational→Commercial | how tutors are vetted | EN+FR | New resource + `/how-it-works` link | New | — | — | Read, then search |
| 5 | Parent | Informational→Commercial | cost of tutoring | EN+FR | New resource | New | — | — | Read, then search |
| 6 | Parent, Student | Transactional | math tutor | EN+FR | `/subjects/math` | Current (improve) | — | Math | Search/book |
| 7 | Tutor | Recruitment | tutor resources / application journey | EN+FR | `/tutor-resources` | Current | — | — | Start application |

### Tier 2 — important supporting/commercial opportunities

Subject pages for english, french, science, chemistry, physics
(improve, not new); "online vs in-person tutoring" resource; "how to
find a good tutor" resource; recruitment content for university-student
tutors; Canada-wide online-tutoring framing on home/`/how-it-works`.

### Tier 3 — content authority / longer-term expansion

Biology and computer-science subject-page refinement; Alberta
curriculum-context general content; Calgary/Alberta-wide expansion
(gated on §7.2); subject×Edmonton pages beyond math (gated on §8);
`/online-tutoring` dedicated page (gated on §10); French-specific
"cours particuliers"/"aide aux devoirs" dedicated content testing.

---

## 21. SEO-3 Architecture Inputs (Phase 21)

**Recommended public page tree** (additions marked NEW; current pages
unchanged in URL):

```
/{locale}/                              [current]
/{locale}/find-tutors                   [current]
/{locale}/subjects                      [current]
/{locale}/subjects/[subject] × 10       [current — improve: level-aware sections]
/{locale}/tutors/[slug]                 [current — sitemap policy: SEO-1 carryover, not SEO-2]
/{locale}/how-it-works                  [current — improve: link new trust content]
/{locale}/become-a-tutor                [current — improve: local Edmonton framing]
/{locale}/tutor-resources               [current]
/{locale}/tutoring-edmonton             [NEW — Tier 1]
/{locale}/resources/[article-slug]      [NEW — 6 Tier-1 articles to start, §12/§20]
/{locale}/about, /contact, /careers,
/{locale}/privacy, /terms, /cookies,
/{locale}/tutor-agreement               [current, unchanged]
```

- **Pages to keep as-is (URL-stable)**: every current page.
- **Pages to improve (content/copy, not URL)**: `/subjects/[subject]`
  (level-aware sections, §9), `/how-it-works` (trust content links, §14),
  `/become-a-tutor` (local framing, §11).
- **Pages to create**: 1 local landing page (EN+FR) + 6 Tier-1 resource
  articles (EN+FR) = 14 new URLs total, deliberately small.
- **Pages NOT to create**: any subject×city combination beyond math×
  Edmonton (and even that, not yet — §8); any city beyond Edmonton (§7.2);
  a dedicated `/online-tutoring` page (§10); any page targeting a
  navigational query (§3).
- **Keyword owner per major page**: see §17's cannibalization map in
  full.
- **EN/FR relationship**: 1:1 locale-prefixed pairs throughout, per the
  existing, working `publicPageMetadata`/hreflang model (SEO-1) — no
  asymmetric page structure between languages.
- **Local-page strategy**: §7 (rule) + §8 (combinations) in full.
- **Subject-page strategy**: keep flat per-subject pages, add level-aware
  sections, do not fragment by level (§9).
- **School-level strategy**: on-page sections, not separate URLs;
  `cegepCollege`/`adultLearner` called out explicitly in copy as a real
  differentiator (§9).
- **Resource/content strategy**: 10 pillar clusters (§12), starting with
  the 6 Tier-1 articles (§20).
- **Tutor-recruitment strategy**: §11 in full, with the explicit
  compensation/claims constraint carried forward.

---

## 22. Code Change Policy — confirmed

**Application code changes made by this mission: 0.** This document and
its own file are the only artifact. No routes were created, renamed, or
altered. No sitemap/robots/metadata code was touched (SEO-1's
implementation stands unchanged). No product, pricing, matching, or
financial logic was inspected for the purpose of changing it — only read,
for accuracy.

---

*Generated by mission SEO-2. Every product fact cited above (subjects,
academic levels, tutoring modes, existing page copy, the tutor validation
pipeline, current approved-tutor count) was read directly from the live
codebase or a read-only production query at the time of this mission
(2026-09-16) — nothing was invented. Update this document, don't
duplicate it, when SEO-3 or a later mission changes the information
architecture it's based on.*
