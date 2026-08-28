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

## M5 — Planning

Parallelisable with M4.

**Scope** — Deadline on a document, availability per weekday, pure backward
planner producing dated tasks, today's task list, replanning when a day is missed.

**Demo** — Set an exam date two weeks out, get a daily plan, skip a day, watch
the plan redistribute.

**Acceptance**
- [ ] The planner is a pure function, property-tested: never schedules past the deadline, never exceeds daily capacity, covers every notion when `feasible: true`
- [ ] Same inputs always yield the same plan (asserted), including on the infeasible/best-effort path
- [ ] Infeasible workloads return `feasible: false` with a correct `shortfallMinutes`, never a silently broken invariant or a dropped notion; malformed input (deadline in the past, zero capacity, no usable day) returns a typed `PlanningInputError` instead
- [ ] `feasible` and `shortfallMinutes` reach `GET /api/documents/:id/plan` and the UI, which states the fact plainly and proposes options (more days, less scope) rather than scolding, per `docs/UI.md`
- [ ] No LLM in the planning path (asserted by dependency-cruiser)
- [ ] Playwright: create a deadline, verify the plan, miss a day, verify replanning

---

## M6 — Workspace

**Scope** — Unified home: today's tasks, plan overview, todo list, manual entry
plus todo extraction from a photo of a school planner (reuses the M2 vision
adapter).

**Demo** — Photograph a school planner page, get todo items, tick them off.

**Acceptance**
- [ ] Todo extraction reuses the existing port, no new LLM adapter
- [ ] Playwright: photo to checked-off todo

---

## M7 — Focus tools

**Scope** — Pomodoro timer tied to a session, Spotify playlist embed.

**Demo** — Start a pomodoro on today's task, finish it, see the session recorded.

**Acceptance**
- [ ] Timer state survives a page reload
- [ ] Spotify is an embedded playlist, no OAuth, no Premium requirement

**Out of scope** — Web Playback SDK. Revisit only if the embed proves inadequate.

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
