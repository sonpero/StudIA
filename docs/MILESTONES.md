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
- [ ] Spotify is an embedded playlist, no OAuth, no Premium requirement
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

**Scope** — Chatbot scoped to one document: sqlite-vec embeddings, FTS5 hybrid
retrieval, streamed answers, citations pointing back to notions.

**Demo** — Ask a question about the uploaded course, get an answer citing the
right passage.

**Acceptance**
- [ ] Retrieval is filtered by `user_id` and `document_id`
- [ ] Questions the course does not cover are refused, by retrieval threshold, and the refusal says so
- [ ] Eval measures answer groundedness on the golden set
- [ ] Playwright: ask a question, receive a streamed answer with a citation

---

## Parallelisation

M4 to M8 each get their own git worktree and their own agent. Rules:

- No agent touches `packages/contracts/`. Contract changes go through the human.
- No agent touches another module's schema or migrations.
- Shared UI primitives land in M0/M3 or go through the human.
- Each worktree rebases on `main` before opening a PR.
