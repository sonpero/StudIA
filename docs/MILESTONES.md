# StudIA — Milestones

Each milestone has a **demo**: something a human can do in a browser (or a
terminal) that proves it works. A milestone is not done because the code exists.
It is done when the demo runs and the acceptance criteria are all ticked.

**M0 to M3 are sequential and built by one agent at a time.** They define the
conventions every later agent will copy. M4 onward can run in parallel worktrees.

Legend: `[ ]` pending · `[x]` accepted

---

## M0 — Skeleton

Everything that has nothing to do with the product, done once and never again.

**Scope**
- pnpm monorepo: `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, `packages/core`
- TypeScript strict, ESLint, dependency-cruiser rules for module boundaries
- Vitest configured, one trivial passing test per package
- Fastify with `/api/health`, serving `apps/web/dist` in production
- Vite dev proxy `/api` to Fastify
- SQLite connection with pragmas, Drizzle, migrations at startup
- Dockerfile, `railway.toml`, volume mounted at `DATA_DIR`
- GitHub Actions: typecheck, lint, test on every push

**Demo** — `GET /api/health` returns 200 on the deployed Railway URL, and the
React app loads from the same origin.

**Acceptance**
- [x] `pnpm dev` starts api, web and worker together
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` all green locally and in CI
- [x] A deliberate cross-module deep import fails `pnpm lint`
- [x] The SQLite file is created on the Railway volume and survives a redeploy
- [x] `better-sqlite3` loads inside the Docker image

**Out of scope** — any business table, any UI beyond a placeholder.

---

## M1 — Auth

**Scope**
- `users` table, argon2 hashing
- `pnpm users:create <username>` CLI, creates or resets a password
- `POST /api/auth/login` (JSON in, 204 + `Set-Cookie` out, 401 on failure)
- `POST /api/auth/logout`, `GET /api/me`
- Signed session cookie, `httpOnly`, `sameSite=lax`, `secure` driven by env
- In-memory login rate limiting per IP
- Fastify `requireAuth` decorator, applied to every `/api/*` route except login
- React: login screen, auth context, 401 interceptor redirecting to login

**Demo** — Create an account from the terminal, log in from the browser, reach a
protected page, log out, get bounced back to login.

**Acceptance**
- [x] Unit tests: hashing, session token signing and expiry
- [x] Integration tests: login success, wrong password, unknown user, rate limit
- [x] Playwright: full login/logout cycle, and protected route redirects when logged out
- [x] The session secret is read from env and startup fails loudly without it
- [x] No route can be added without auth by accident (default-deny, tested)

**Out of scope** — signup, password reset by the user, roles, any parent profile.

---

## M2 — Ingestion

**Scope**
- `documents`, `extractions`, `jobs` tables
- Upload: photo, PDF, docx, pptx. Multi-page is the normal case: several photos
  of one lesson form one document. Size limit, MIME check, per-document SHA-256
  deduplication, stored under `DATA_DIR/uploads/{userId}/{documentId}/`
- Authenticated download route, ownership verified
- Job table + worker polling loop, backoff, `running` reset on startup
- `DocumentExtractor` port with two adapters: officeparser for documents,
  vision model for photos. Output is structured Markdown.
- React: upload screen, document list, live extraction status

**Demo** — Photograph a page of a course, upload it, watch the status go from
pending to done, read the extracted text.

**Acceptance**
- [x] Unit tests: MIME detection, deduplication, job state machine
- [x] Integration tests: upload writes file and row, worker picks the job up
- [x] Contract tests: fixture-based extraction, plus a corrupted-file case
- [x] A job that fails three times ends `failed` with `last_error` populated
- [x] Killing the worker mid-job and restarting it re-runs that job exactly once
- [x] Playwright: upload three photos as one document, watch the status reach done
- [x] Another user cannot download the document (403, tested)

**Out of scope** — notion splitting, any generation.

---

## M3 — First learning loop

Closes the vertical slice. After this, every layer of the architecture has one
reference implementation.

**Scope**
- `notions`, `cards`, `reviews` tables
- `NotionSplitter` port: extraction Markdown to atomic notions, with a
  difficulty label
- `CardGenerator` port: flashcards from notions, via `generateObject`
- `ts-fsrs` wrapped in `review/domain`, FSRS state persisted per card
- Review session: draw due cards, rate, advance state
- React: notion list, review screen

**Demo** — From the document uploaded in M2, generate flashcards, review them,
and see the next due date change according to the rating.

**Acceptance**
- [x] Unit tests: FSRS state transitions for all four ratings, deterministic with an injected `now`
- [x] Contract tests: splitter and generator against fixtures, plus a schema-violating response that triggers exactly one retry then fails
- [x] Integration tests: due-card query respects `user_id` and the clock
- [x] Playwright: generate, review, verify scheduling
- [x] `pnpm eval` exists and runs on a golden set of at least 5 documents
- [x] No LLM call happens inside a transaction (asserted by a test)

**Out of scope** — quizzes, MCQs, planning, workspace.

---

## M4 — Activity variety

Parallelisable with M5.

**Scope** — MCQ and open-question generators, plausible distractors, answer
grading (exact match for MCQ, LLM-assisted for open questions), per-activity
scoring feeding back into FSRS.

**Demo** — Same course, three activity types, each producing a review outcome.

**Acceptance**
- [x] `.refine()` guarantees the correct answer is among the options and distractors are distinct
- [x] Eval measures distractor quality on the golden set
- [x] Playwright: one scenario per activity type

---

## M5 — Progress

Parallelisable with M4. Module renamed from `planning` to `progress` mid-M5
(see `docs/modules/progress.md`): the milestone kept its number but its
scope changed completely, below.

**Scope** — Deadline on a document (unchanged persistence), and a pure,
read-time computation of two per-course percentages — coverage and
readiness — plus a status derived from a target trajectory. No availability,
no dated plan, no daily dose, no minute estimates, no replanning. The
person decides what to do with the numbers; this module only reports them.

**Demo** — Set an exam date, see coverage and readiness for the course,
review a due card, see readiness rise.

**Acceptance**
- [x] `computeProgress` is a pure function, property-tested: `coverage` and `readiness` always in `[0, 1]`, `readiness <= coverage` always, deterministic on repeated calls
- [x] With no deadline and no activity, `readiness` never increases as `now` advances (strictly decreases only once at least one card has been reviewed and a day boundary is crossed); with a deadline and no activity, `status` never improves as `now` advances within `[deadline.setAt, deadline.date]` (`ahead > on-track > behind`, non-increasing) — see `docs/modules/progress.md` for why these are two different fields, not one, and why both are stated weakly rather than strictly
- [x] `PROGRESS_TARGET_READINESS` (`0.9`, matching `review`'s own FSRS retention target) and `PROGRESS_NO_DEADLINE_HORIZON_DAYS` (`14`) are named, exported constants, not literals inlined in the formulas
- [x] On the deadline day itself, the screen never shows `status`-driven `--warning` styling or `behindByNotions` — `target` reaching its ceiling exactly that day would otherwise flip most courses to `'behind'` on the one morning nothing can still be done, the opposite of `docs/UI.md`'s "no urgency" rule
- [x] `ProgressListItem` and the single-document progress response both carry `title`, `deadlineDate`, and `deadlineLabel` — including on the `'error'` branch — so the mandatory status phrase renders without a second call in either case
- [x] A course with zero notions and no deadline is `'no-deadline'`, not `'on-track'` — deadline-nullity is checked before the zero-notions special case, never the reverse
- [x] `behindByNotions` counts notions whose projected `R` is below `target(now)` — deterministic, `0` outside `status === 'behind'`, at least `1` whenever it is `'behind'`, never a percentage or a time estimate
- [x] `recentlyAddedUnreviewed` explains a low coverage number statelessly (from `notion.createdAt` and `now` alone, no stored previous reading) rather than by detecting a drop
- [x] Malformed input (deadline in the past) returns a typed `ProgressInputError`; zero notions, no deadline, deadline today, and all-notions-never-seen are all defined, never `NaN`
- [x] No LLM and no `ts-fsrs` import inside `progress/**` (asserted by dependency-cruiser's `no-ai-in-progress` and `no-fsrs-outside-review`)
- [x] `GET /api/documents/:id/deadline` exists and round-trips what `POST` stored (fixes the M5-as-shipped debt below)
- [x] `setDeadline` preserves `createdAt` when updating an existing deadline's date or label — only a delete-then-set restarts the target trajectory
- [x] The migration dropping `availability` and `plan_history` leaves `deadlines`, its rows, and its `deadlines_document_unique` constraint untouched, and replays cleanly from empty and from a `0006`-era database
- [x] `coverage` and `readiness` are sourced from a single `getCardSchedulesForDocument` read, never two separate queries — covered by an integration test; this is the invariant that keeps `readiness <= coverage` from breaking intermittently
- [x] The screen respects `docs/UI.md`: `--warning` (never `--accent`) for `'behind'`, no urgency or blame in copy, and a stateless explanation (`recentlyAddedUnreviewed`) when recently-added notions explain a low coverage number
- [x] Playwright: set a deadline, verify coverage and readiness render, review a due card, verify readiness rises

**Process note.** The original `planning` scope this milestone shipped
first (see below) recorded that `domain/build-plan.ts` and
`infra/sqlite-planning-repository.ts` were written before their tests, a
genuine `CLAUDE.md` test-first violation caught only after the fact by
property and mutation testing. Both files are deleted entirely by this
rewrite, so that specific debt does not carry forward — but it is not
excused either: every file in the `progress` rewrite
(`compute-progress.ts`, its repository, the new `review` port method and
pure export, the routes, the screen) is red, then green, with no exceptions
this time.

**Known debts:** none. Both debts logged against the original `planning`
scope (missing `GET .../deadline`, `buildPlan`'s unused `history` input) are
resolved by this rewrite, not carried forward.

M5 was never formally accepted under its original scope (the process note's
boxes were still unchecked, pending mutation-table review) — it is being
redirected, not reopened after acceptance. The original planner/availability
scope this section used to describe is preserved in git history
(`docs/modules/planning.md` as of commit `da7a204` and earlier), not
duplicated here.

---

## M6 — Workspace

**Scope** — Unified home: today's tasks, plan overview, todo list, manual entry
plus todo extraction from a photo of a school planner (reuses the M2 vision
adapter).

**Demo** — Photograph a school planner page, get todo items, tick them off.

**Acceptance**
- [x] Todo extraction reuses the existing port, no new LLM adapter
- [x] Playwright: photo to checked-off todo

---

## M7 — Focus tools

**Scope** — Pomodoro timer tied to a session, Spotify playlist embed.

**Addition — course reader.** Not part of the original scope; added here rather
than as its own milestone because it needs nothing M8 (Tutor) or any later
milestone would introduce first, and there is no other natural home for it. A
screen that renders a document's extracted markdown as an actual formatted
page (headings, lists, emphasis) — at the time this was added, the two
places that showed that same markdown did so as raw preformatted text
(`DocumentsScreen`'s "Voir le texte", `NotionsScreen`'s "Voir le contenu"),
neither meant for continuous reading. This screen replaced the first;
`NotionsScreen`'s own "Voir le contenu" got the same rendering fix in a
later, separate correction (it stayed — different content, a notion's own
body, not the source — only its raw-text rendering was the bug). Reads the
source extraction, not notions strung together: a notion's
`body` is deliberately self-contained for out-of-order review
(`docs/modules/content.md`), so concatenating notions end to end produces a
repetitive, choppy sequence, not a readable course — the source markdown is
the actual document as written. See `docs/UI.md`'s Lecteur note for the full
spec — no new backend module: it reads `ingestion`'s existing extraction,
already exposed by `GET /api/documents/:id`.

**Demo** — Start a pomodoro on today's task, finish it, see the session
recorded. Open a course, read it as formatted text on mobile.

**Acceptance**
- [x] Timer state survives a page reload
- [x] Spotify is an embedded playlist, no OAuth, no Premium requirement
- [x] A course's extracted markdown renders as formatted text (not raw
      preformatted), replacing `DocumentsScreen`'s "Voir le texte"

**Out of scope** — Web Playback SDK. Revisit only if the embed proves
inadequate. Reading notions instead of the source (see above). Progressive
or paginated loading from the server — measured, not assumed: rendering a
full document client-side stays well under a second even at sizes past
what this app's own documents are likely to reach (see `docs/UI.md`'s
Lecteur note). A paginated, swipe-to-continue reading mode was also set
aside, for a different reason: it answers a reading-comfort preference
nobody asked for, not a performance problem — the measurement above is
why it wasn't treated as one.

---

## M8 — Tutor

**Scope** — Chatbot scoped to one document: the full source markdown as
context, no retrieval index (the course fits comfortably in the model's
context window), streamed answers, citations resolved against sections of the
source text.

**Demo** — Ask a question about the uploaded course, get an answer citing the
right passage.

**Acceptance**
- [x] Loading the course is filtered by `user_id` and `document_id`
- [x] Questions the course does not cover are refused, by system-prompt instruction verified on the golden set, and the refusal says so
- [x] Eval measures answer groundedness on the golden set
- [x] Playwright: ask a question, receive a streamed answer with a citation

---

## M9 — Redesign

Not the next vertical slice — a visual and navigational pass over what M0–M8
already shipped, requested directly from reference screenshots rather than
derived from a new capability. Written as its own milestone rather than a
loose set of commits so it gets the same acceptance discipline as everything
before it, per `CLAUDE.md`'s "no work outside a milestone" rule.

Grew in scope after Phase 1 landed: the user kept supplying mockup
screenshots for individual screens, one at a time, and each became its own
redesign pass rather than a new milestone — still M9, since none of it is a
new capability either. Phase 2 (below) tracks that ongoing, per-screen work.
`docs/UI.md` is the authoritative detail source for every screen this
milestone touches, reconciled with what actually shipped as of commit
`ff982ae` (Tuteur, the last of Phase 2's seven screens); this file only
tracks status and acceptance.

### Phase 1 — merged colour, streak, countdown, nav to seven

Two of `docs/UI.md`'s own long-standing rules are deliberately reversed here,
not rediscovered as wrong: the streak counter and the relative-countdown
badge, both previously named in `Forbidden` and in `Who this is for`'s "never
counts down" product rule. `docs/UI.md` itself carries the reasoning for the
reversal; this section only carries what must be true for it to count as done.

**Scope**
- A single merged colour token, `--primary`, replacing today's separate
  `--primary` (indigo, nav/links) and `--accent` (green, single CTA) — one
  green for both roles, everywhere in the app, not just on the redesigned
  screen. `tokens.colour-collision.unit.test.ts` updated to the new token
  set, not deleted.
- A streak: the count of consecutive calendar days, ending today or
  yesterday, with at least one FSRS review (`reviews.reviewed_at`) —
  computed, not stored. No new table: derived from data `review` already
  persists, via a new `workspace`-owned pure function (`workspace` composes
  `review`, never the reverse — `docs/modules/workspace.md`'s own existing
  rule for exactly this shape of read).
- A relative countdown badge on Aujourd'hui's own course cards
  ("Examen dans 9 jours"), replacing the current plain-fact deadline
  sentence that spelled out both the absolute date and the day count
  together.
- Navigation grows from five destinations to seven: **Notions** and
  **Lecteur** become reachable directly from the persistent nav, each with
  the same dual-entry shape `Tuteur` already has — a picker, reusing `Mes
  cours`' own list and its four states, when entered with no course chosen.
- Aujourd'hui's screen rebuilt around the above: greeting, course cards
  (due count, below-target count, the new countdown badge), the streak
  card, the existing todo list, pomodoro and Spotify blocks unchanged.

**Demo** — Open Aujourd'hui, see a streak card and a relative countdown
badge on a course with a deadline. From the nav, reach Lecteur directly and
pick a course from its own picker, without going through Mes cours first
(Notions is also reachable directly from the nav, but Phase 2's own
redesign, below, replaced its picker with a pill selector before this demo
was ever run for real).

**Acceptance**
- [x] `computeStreak` is a pure function taking a set of calendar days with
      activity and `now`: a gap of a full calendar day with no activity,
      anywhere before yesterday, caps the count at the run ending closest
      to `now`; activity today is not required to keep yesterday's count;
      deterministic on repeated calls. Mutation-tested (`CLAUDE.md`'s own
      regime for pure domain functions), not literally property-tested —
      the box originally asked for the latter; no fast-check-style test
      exists, this is the honest record of what was actually done instead
- [x] The streak's day list comes from one new `ReviewRepository` method
      (`getReviewDayKeysForUser`), scoped by `user_id` like every other
      repository method here — no new table, no new module
- [x] `tokens.colour-collision.unit.test.ts` passes against the merged
      token set (one semantic token fewer than before), still checking
      every remaining pair, not weakened to fewer checks than it ran before
- [x] Every existing screen that used `--accent` or the old `--primary`
      renders with the merged green — checked live, not just by grep, on
      Notions (during Phase 2's own Notions redesign), Progression,
      Calendrier and Tuteur (each during its own later Phase 2 redesign,
      via a throwaway Playwright screenshot every time), and finally
      Révision — the one screen Phase 2 never touched directly, checked
      live for this box specifically once all seven Phase 2 screens
      landed: a graded MCQ's "Continuer" button and the correct-answer
      ring both render the merged green, screenshot taken, not kept
- [x] `ReviewScreen`'s graded-MCQ view still tells a correct pick from a
      wrong one without relying on hue alone (`docs/UI.md`'s own icon-based
      fix, predating this milestone, was not undone by the merge)
- [x] Lecteur is reachable from the nav with no course preselected, lands
      on a picker reusing `Mes cours`' own four states, and existing entry
      points (from a course, from Notions' own toolbar) are unchanged.
      **Neither Lecteur nor Notions still works this way** — Phase 2's own
      Notions redesign (below) replaced its picker with a pill-selector
      page first, and Lecteur's own later redesign (below) followed the
      same pattern; both supersede this box, not satisfied as originally
      written
- [x] Aujourd'hui's countdown badge shows only the relative form ("dans N
      jours"), never invented urgency wording beyond what `docs/UI.md`'s
      copy register already allows elsewhere
- [x] Playwright: a course with a deadline shows the countdown badge and a
      user with at least one review today or yesterday sees a non-zero
      streak (`e2e/streak-and-countdown.spec.ts`); Lecteur is reachable
      from the nav (`e2e/nav-pickers.spec.ts`) — that spec's own Notions
      and Lecteur halves both now cover a pill-selector page instead of a
      picker, per the box above

**Out of scope** — a configurable streak goal, a streak notification or
reminder, a per-course streak, freezing/protecting a streak, any new
"daily activity" table broader than reviews (todos and pomodoro sessions
are not counted — considered and set aside: it would need its own
cross-module read no screen has asked for yet, when `review` alone already
answers what the reference screenshot shows), the tablet 72px icon-only nav
collapse, and the secondary nav group (Mes notes, Réglages — still no
screen behind either).

### Phase 2 — per-screen mockup redesigns

Also not a new capability: each screen rebuilt from a user-supplied mockup
screenshot, one at a time, ignoring `docs/UI.md` where the mockup calls for
it — a deliberate departure each time, not a silent drift, and reconciled
back into `docs/UI.md`'s own Screen notes as each pass lands; that file is
the authoritative detail source, this entry only tracks status. No
acceptance criteria are written ahead of a mockup existing — each screen's
own scope is only known once its mockup is in hand, the same way every one
of the seven below was scoped. **All seven screens are done** — Calendrier
and Tuteur both then received follow-up polish passes from more mockup
crops, and Phase 2 stays open to more of that rather than formally
closing, per `CLAUDE.md`'s own Current milestone note.

**Done:**
- **Aujourd'hui** — rebuilt wholesale from mockup (greeting header, a
  due-courses grid, the todos card, Pomodoro simplified to one fixed
  duration, a still-mock study-sounds card). Commits `83f8e05` through
  `66d55c0`.
- **Mes cours** — redesigned from mockup (persistent two-column layout,
  tinted-circle course cards with real per-course stats, always-open
  upload panel). Commits `442d4ab`, `64c5f5c`, `c5e465c`.
- **Notions** — unified its old picker-plus-course-view into one
  pill-selector page. Commit `e9440ce`, plus a related bug fix
  (`9030ad8`) and a full e2e-suite repair for regressions the earlier two
  redesigns had left unnoticed (`d8f1853`).
- **Lecteur** — unified its old picker-plus-course-view into one
  pill-selector page, the same pattern Notions used, plus a new "Étudier
  ce cours" panel linking to Notions/Tuteur. Commits `17bc9b0`, `899659d`
  (a follow-up copy/style polish pass); full `pnpm test:e2e` green (16
  passed, 1 pre-existing unrelated skip).
- **Progression** — replaced the uniform grid of one card per course with
  a pill selector, a single selected course's own detail card (a
  readiness ring, coloured coverage/readiness gauges, a
  mastered/learning/due/not-started stat row, "Combler l'écart"/"Voir le
  cours"), and a compact "Tous les cours" list — two deliberate reversals
  of `docs/UI.md`'s own rules along the way (subject colours now fill the
  gauges; the per-card left border is gone in favour of a tinted icon
  circle). Commits `03fdfda`, `e867534` (a follow-up pass: the header
  realigned into the ring's own right-hand column, every gauge/the ring
  now animates from 0 on mount, a `Trash2` icon replaces the old
  "Supprimer l'échéance" text link, "Voir le cours" gained the same tint
  Lecteur's "Discuter avec le tuteur" uses), `164eb20` (a second
  follow-up: the ring moved down to sit between "Couverture" and
  "Préparation" instead of beside the header, the header and the lower
  block each reserve the ring's own width with an invisible `RingSpacer`
  instead of sharing a row with it, "Modifier l'échéance"/the delete icon
  now share one action row with "Combler l'écart"/"Voir le cours", and
  "Modifier l'échéance" gained the same tint "Voir le cours" already had);
  full `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated skip)
  after each pass; visually checked live via a throwaway Playwright
  screenshot every time, not just by test assertions.
- **Calendrier** — a reskin, not a restructuring: unlike the four screens
  above, the month grid, its click-through day panel and the density rule
  (three dots, or two plus a "+N" count) are unchanged from before this
  pass. What changed is page chrome (a persistent "Calendrier" header +
  subtitle, absent before outside the error state), rounder corners
  throughout (`rounded-2xl`/`rounded-xl`, the same departure from the
  shared radius tokens CoursePill already made), and a new two-column
  layout: the grid in its own card, plus a sidebar with an "Aller à
  aujourd'hui" jump button and a "Prochaines échéances" list (soonest
  four courses with a future deadline). Both sidebar pieces reuse
  `listProgress()` (`GET /api/course-progress`, the same read Progression
  already made), replacing the screen's own separate `listDocuments()`
  call outright rather than adding a second one. The mockup's own
  per-day review-count forecast and "This week" summary were confirmed
  out of scope with the user before starting — neither exists in this
  app's data, and building one would be a new capability, not a reskin.
  Commit `de504de`; full `pnpm test:e2e` green (16 passed, 1 pre-existing
  unrelated skip); visually checked live via a throwaway Playwright
  screenshot, same discipline as the four passes above. Commit `12a45d1`
  (a follow-up pass, four more mockup crops: every day cell gets a
  visible neutral border, "Prochaines échéances" rows and the day panel's
  own entries each became their own bordered `Card` instead of sharing
  one outer border, a lone deadline renders as a coloured named pill
  instead of a bare dot, and "Voir le cours" finally got the `BookOpen`
  icon `docs/UI.md` had named for it since an earlier pass but no pass
  had actually implemented); full `pnpm test:e2e` green again, visually
  checked live the same way. Commit `ca8051b` (a second follow-up pass,
  four more requests: the day panel's own leading marker became an icon
  in a tinted circle instead of a bare dot, its "Voir le cours" gained the
  secondary-with-tint idiom other screens already use, "Prochaines
  échéances" rows became clickable through to their course, a
  lone-deadline badge now stretches its cell's full width, and month
  navigation moved to icon-only chevrons — a deliberate reversal of
  `docs/UI.md`'s own icon-accompanies-label rule, confirmed with the
  user); full `pnpm test:e2e` green again, visually checked live the same
  way.
- **Tuteur** — unified its old picker-plus-chat into one pill-selector
  page, the same pattern Notions/Lecteur/Progression already used (its
  own `CoursePickerScreen` deleted along with the rewrite, since Tuteur
  was its last runtime consumer). A canned per-course greeting bubble
  ("Salut ! Je suis ton tuteur pour « {cours} »…") replaces the old
  Idle-mascot empty state — a deliberate reversal of the mascot-in-every-
  empty-state rule, confirmed with the user rather than assumed — and a
  row of suggested-question chips, grounded in that course's own real
  notion titles (`Explique « X »` / `Fais-moi un quiz sur « X »` /
  `Qu'est-ce que « X » ?`, cycled across up to 3 notions, never invented
  subject knowledge), prefills the composer on click without auto-sending
  it (`docs/UI.md`'s own "the app proposes, the person decides"). The
  composer itself moved from a `textarea` to a rounded pill `input`, and
  its send button gained a `Send` icon alongside "Envoyer" — an icon
  beside its label, not replacing it, so no rule exception was needed
  there. Commit `e87816a`; full `pnpm test:e2e` green (16 passed, 1
  pre-existing unrelated skip); visually checked live via a throwaway
  Playwright screenshot, same discipline as every pass above.

**Confirmed intentional cuts along the way, not bugs** (`docs/UI.md`'s own
notes for each screen carry the full reasoning):
- Spotify removed entirely from Aujourd'hui (M7's own embed, not merely
  restyled — no card, no CSP entry).
- Pomodoro no longer links a session to a specific todo; "recorded" is now
  a session counter, not a confirmation banner.
- Aujourd'hui's own course card lost its "Voir le cours" action, keeping
  only "Réviser" (Mes cours' own card kept its equivalent, "Lire le
  cours" — the two are no longer symmetric on this point).

**Found during the `docs/UI.md` reconciliation pass, not yet confirmed
with the user:** Notions' own per-notion "why isn't this mastered yet"
sentence is gone from the redesigned card. Needs a decision before it is
either restored or written off as a fourth intentional cut.

**Judgement calls made on Progression, not shown in its own mockup crop,
flagged rather than silently decided:** "Voir le cours" (opening that
course's own Notions du cours) was kept on the detail card — the previous
screen had it on every card, the mockup's own crop doesn't show it either
way, and dropping a real navigation capability silently seemed like the
wrong default. Clicking a row in "Tous les cours" selects that course
(switches the detail card above) rather than navigating away to its own
Notions du cours. Both worth confirming; neither blocks the redesign from
counting as done.

**Acceptance**
- [x] Aujourd'hui redesigned from mockup, `docs/UI.md` reconciled
- [x] Mes cours redesigned from mockup, `docs/UI.md` reconciled
- [x] Notions redesigned from mockup, `docs/UI.md` reconciled, full
      `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated `fixme`)
- [x] Lecteur redesigned from mockup, `docs/UI.md` reconciled, full
      `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated skip)
- [x] Progression redesigned from mockup, `docs/UI.md` reconciled, full
      `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated skip)
- [x] Calendrier redesigned from mockup, `docs/UI.md` reconciled, full
      `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated skip)
- [x] Tuteur redesigned from mockup, `docs/UI.md` reconciled, full
      `pnpm test:e2e` green (16 passed, 1 pre-existing unrelated skip)
- [x] This file's own M9 section fully reconciled once all seven screens
      are done — done in this same pass, alongside closing Phase 1's own
      last open box (below)

---

## M10 — Persistent pomodoro

Not a new backend capability — `packages/core/src/workspace`'s pomodoro
(M7) is untouched, no schema/route/contract change anywhere under
`packages/` or `apps/api/`. Purely a front-end visibility fix: a running
session was only ever visible on Aujourd'hui; it now stays visible
everywhere, across three lots the user scoped directly (not derived from a
reference screenshot, unlike M9). `docs/UI.md`'s Aujourd'hui — pomodoro
note is the authoritative detail source; this section only tracks status
and acceptance, the same division of labour M9 used.

### Lot 1 — cross-screen visibility (this pass)

**Scope**
- Fixed a pre-existing bug, found and reproduced before any other work
  (ÉTAPE 0): `PomodoroCard` kept `phase`/`session` in local `useState`,
  and `startPomodoro`'s own mutation never wrote through to the
  `pomodoro-active` React Query cache (`staleTime: Infinity` +
  `refetchOnWindowFocus: false` meant nothing ever refetched it either) —
  navigating away and back showed the at-rest display even though the
  session was still running server-side.
- A shared `useActivePomodoro` hook (`apps/web/src/lib/
  use-active-pomodoro.ts`) deriving `phase`/`remainingSeconds` straight
  from the cached session (never a parallel `useState`) and writing both
  mutations' results back into that same cache key — any number of
  simultaneous consumers now read one value and cannot diverge.
- A small header widget (`PomodoroHeaderWidget`, in `App.tsx`'s existing
  header row — no new layout region): the remaining time alone, shown only
  while a session runs, hidden specifically on Aujourd'hui (PomodoroCard
  already shows the same countdown there — showing both would collide on
  accessible name).
- The browser tab title becomes the remaining time plus the app's own
  name while a session runs, restored to the original — read from
  `apps/web/index.html`, never hardcoded — the instant it ends or the
  component unmounts.

**Out of scope, explicitly, for lots 2 and 3 to pick up:** the countdown
reaching zero (a distinct visual state), the ring/arc progress visual
(still the plain bordered circle), short/long breaks behind "Pause
courte"/"Pause longue" (still purely decorative — one fixed duration
server-side, unchanged).

**Acceptance**
- [x] ÉTAPE 0 regression test written first, observed failing against the
      pre-refactor implementation, before any fix
- [x] `useActivePomodoro` unit-tested directly (`renderHook`): idle
      default, resuming an already-active server session, `start`/`end`
      writing through the shared cache, the 409-as-resync case, and two
      simultaneous hook instances sharing one `QueryClient` never
      diverging
- [x] `PomodoroCard` unit tests unchanged and green after the refactor,
      plus one new case (the 409 resync notice) that had no prior coverage
- [x] `App.unit.test.tsx`: the widget absent with no session, visible with
      the live countdown on a non-Aujourd'hui screen, absent again on
      Aujourd'hui itself; the tab title changing and restoring (including
      on unmount)
- [x] Playwright (`e2e/pomodoro-persistent.spec.ts`): start a session on
      Aujourd'hui, navigate to Mes cours, see the header widget and the
      tab title both reflect it, navigate back and confirm the session is
      still live (not reset) and the widget hides again
- [x] No existing test modified or deleted; `pnpm test` (1134 tests),
      `typecheck`, `lint` all green; full `pnpm test:e2e` green (17
      passed, 1 pre-existing unrelated skip)

### Lots 2 and 3 — not yet scoped

Deliberately not anticipated, even partially, per the user's own
instruction starting lot 1. Scope each when the user asks.

---

## Parallelisation

M4 to M8 each get their own git worktree and their own agent. Rules:

- No agent touches `packages/contracts/`. Contract changes go through the human.
- No agent touches another module's schema or migrations.
- Shared UI primitives land in M0/M3 or go through the human.
- Each worktree rebases on `main` before opening a PR.
