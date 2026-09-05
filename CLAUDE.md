# StudIA

Study companion web app. Users upload course material (photo, PDF, Word, PowerPoint),
the app extracts the content, splits it into atomic notions, and generates
retrieval-practice activities (flashcards, quizzes, MCQs) scheduled with spaced
repetition. When a deadline is given (an exam date), it produces a daily backward
plan. Everything lives in a workspace: today's tasks, the plan, a todo list, and
focus tools.

Small, private deployment: a handful of users, no self-signup, accounts created by CLI.

---

## Current milestone

**M8 — Tutor.** See `docs/MILESTONES.md` for the full plan and
acceptance criteria.

Read the current milestone before starting any work. **Build only what the
current milestone requires.** Do not implement features from later milestones,
do not add "we'll need it anyway" abstractions, and do not create tables for
data no current milestone stores. If a task seems to need something from a later
milestone, say so and stop rather than pulling it forward.

Update the milestone line above when a milestone is accepted, in the same commit
that ticks its last acceptance criterion.

---

## Stack

| Layer | Choice |
|---|---|
| API | Fastify 5 + TypeScript (Node 22), `fastify-type-provider-zod` |
| Front | React 19 + Vite + Tailwind + shadcn/ui + TanStack Query |
| DB | SQLite (`better-sqlite3`) + Drizzle ORM, FTS5 |
| Auth | argon2 + signed session cookie, accounts seeded by CLI |
| Files | Railway volume at `DATA_DIR` |
| Jobs | `jobs` table + in-process polling worker |
| LLM | Vercel AI SDK (`generateObject`) with Zod schemas |
| Extraction | officeparser (pdf/docx/pptx), vision model for photos |
| Spaced repetition | `ts-fsrs` |
| Tests | Vitest + Playwright |
| Deploy | Single Railway service, Dockerfile |

Do NOT add a dependency without writing a one-line justification in the PR
description. Prefer the standard library or an existing dependency.

---

## Repo layout

```
apps/
  api/          Fastify server, serves /api/* and the built SPA
  web/          React SPA (Vite)
  worker/       job polling loop, same image, different entrypoint
packages/
  contracts/    Zod schemas shared by api, web and worker
  core/         business modules (see below)
```

### Business modules

Each module lives in `packages/core/src/<module>/` with three layers:

```
domain/        pure functions and types, ZERO I/O, ZERO imports from infra
application/   use cases, orchestrate domain + ports
infra/         adapters (SQLite repositories, LLM clients, filesystem)
index.ts       the ONLY public surface of the module
```

Modules: `identity`, `ingestion`, `content`, `generation`, `review`, `progress`,
`workspace`, `tutor`, plus two shared kernels: `jobs` (queue and worker) and
`shared` (`Result`, `Clock`, `IdGenerator`, the model client factory).

**Each module has a binding spec in `docs/modules/`.** Read yours before writing
code. It defines the domain types, ports, use cases, tables, routes, and the
tests that must exist. If the spec contradicts this file, this file wins and you
should flag the contradiction rather than picking one.

**Cross-module imports go through `index.ts` only.** Never reach into another
module's internals. This is enforced by `dependency-cruiser` in CI: a violation
fails the build. If you need something that is not exported, stop and ask
instead of exporting it yourself.

---

## Non-negotiable rules

### 1. Scheduling is deterministic

The backward plan is a pure function of (deadline, notion count, notion
difficulty, available slots per day). No LLM computes the schedule. An LLM may
label a notion's difficulty, and that label is an INPUT to the pure function.
Same inputs must always produce the same plan, and there is a test asserting it.

### 2. No LLM call inside a database transaction

SQLite has a single writer. A generation call takes tens of seconds and would
block every other write. Pattern: read what you need, close the transaction,
call the model, then open a short write transaction.

### 3. Every LLM call goes through a port

Ports are defined in `packages/core/src/<module>/domain/ports.ts` with a Zod
schema for input and output. Two adapters exist for each: the real one, and a
fixture adapter used in tests. No test hits the network. Ever.

### 4. Zod is the single source of schema

The same schema validates the HTTP contract and the LLM output. Note that
`generateObject` does NOT transmit `.min()`, `.max()` or `.format()` to the
model: put anything the model needs to know in `.describe()`. Keep schemas flat
and shallow; deep nesting and discriminated unions degrade reliability.

On validation failure, retry once with the validation error fed back to the
model, then fail the job with `last_error` set.

### 5. Every row is scoped by `user_id`

There is no shared content and no parent/teacher role. Every repository method
takes a `userId` and filters on it. A repository method without `userId` in its
signature is a bug.

---

## TDD workflow

This project is test-first. For every change:

1. Write the failing test. **Run it. Confirm it fails for the right reason.**
2. Write the minimum code to pass.
3. Refactor with the test green.

Do not write implementation code before a failing test exists.

**Never modify or delete an existing test to make a build pass.** If a test
seems wrong, stop and explain why in your message. Deleting a red test is the
single worst thing you can do in this repo.

Every bug fix starts with a regression test that reproduces the bug.

### Test layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | `domain/` only. No mocks, no I/O. Must be fast. |
| Integration | Vitest | Real SQLite in a temp file, real migrations. One per repository. |
| LLM contract | Vitest + fixtures | Recorded responses replayed. Asserts schema validity and degraded-output handling. |
| Acceptance | Playwright | One scenario per user story, written before the story's code. |
| LLM eval | Vitest, separate suite | Golden set, run manually, costs money. Never in CI. |

`pnpm test` runs unit + integration + contract. It must never make a network call,
and a global setup makes `fetch` throw so a misconfigured fixture adapter fails
loudly instead of silently calling a real model.

### Mutation testing regime

Test-first is mandatory everywhere, without exception. Mutation testing —
proving each property with a targeted mutation that makes it fail alone, not
merely a test that happens to pass — is required only where a defect would
otherwise go unnoticed by both review and normal use:

- pure domain functions
- migrations and anything touching persisted state
- `dependency-cruiser` rules, whose non-vacuity is checked by a deliberate
  violation, then a revert
- cross-module invariants and the queries that carry them

Everywhere else — React components and anything rendered on screen, routes
(integration coverage is sufficient), adapters with no logic of their own —
test-first still applies, but **do not add mutation testing unless the prompt
explicitly asks for it.**

Why: mutation testing exists for defects that no review and no usage surfaces.
A wrong screen is visible in three seconds; a wrong weighted average never
shows up on its own.

This does not relax milestone acceptance: every acceptance box still needs its
own named test, regardless of regime. Never remove a test written under either
regime, including ones predating this split.

**`docs/TESTING.md` is binding**: file naming, the database helper, builders,
fixture recording, the four required UI states, the architecture rules, and
the mutation testing regime above.

---

## Conventions

- TypeScript `strict: true`. No `any`, no `@ts-ignore`. If you are stuck on a
  type, say so rather than escaping the type system.
- Named exports only, no default exports.
- Errors: domain code returns a `Result` type, it does not throw. Only infra
  throws. The API layer maps errors to HTTP status codes in one place.
- Dates: store ISO 8601 UTC strings. All scheduling logic takes an explicit
  `now: Date` parameter, never calls `new Date()` internally. This is what makes
  the planner testable.
- IDs: UUID v7, generated in the application layer, never by the database.
- Commit messages and code comments in English. UI copy in French.
- Comments explain *why*, never *what*. Delete a comment that restates the code.

### Fastify specifics

- Register plugins in `apps/api/src/plugins/`, one file per plugin.
- Decorator scope follows plugin encapsulation: a decorator registered inside a
  plugin is NOT visible outside it unless the plugin is wrapped in `fastify-plugin`.
  This is the most common source of silent bugs here. When you add a decorator,
  state explicitly in your message where it is visible.
- Route schemas are Zod, via `fastify-type-provider-zod`. Never hand-write a
  JSON Schema.
- All API routes are prefixed `/api/`. The SPA fallback is registered last.

### UI

`docs/UI.md` is binding. Read it before touching anything in `apps/web/`.

The four rules broken most often:

- **Tokens only.** No colour, spacing or font outside `tokens.css`.
- **Four states per screen.** Loading, empty, error, ready. A screen missing one
  is incomplete.
- **Nothing blocks on a job.** Extraction takes a minute; the user must be able to
  navigate away and come back.
- **No urgency.** No countdowns, no streaks, no "you are behind". The app proposes;
  the person decides.

The app is embodied by a mascot, Fiche, used in empty, loading and error states.
Poses are flat SVG in `apps/web/src/components/mascot/`.

UI copy is French, tutoiement, sentence case. Do not write English UI strings
"to be translated later".

### SQLite specifics

- `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`,
  `foreign_keys = ON`. Set once at connection open.
- Migrations run once at startup, never per request.
- Write transactions must be short. Never hold one across an `await` on anything
  other than a database call.
- `better-sqlite3` is a native module: the Dockerfile must build it against the
  same Node version that runs it.
- `drizzle-kit`'s schema loader uses a plain Node `require()` with no bundler,
  so it cannot resolve this repo's NodeNext `.js`-suffixed relative imports
  once a `.references()` call reaches across a module or package boundary
  (e.g. `ingestion`'s `documentsTable.userId` referencing `identity`'s
  `usersTable`). This has recurred on every cross-module foreign key so far
  (M1 `users`, M2 `jobs`, M2 `documents`). Workaround: omit `.references()` in
  the Drizzle TS schema, generate the migration, then hand-edit the generated
  SQL to add the `REFERENCES` clause (and any `CHECK` constraint or index
  column ordering Drizzle's SQLite dialect can't express yet). Leave a comment
  in both the schema file and the migration explaining why the reference is
  missing from the TS side.

### Worker specifics

- On startup, reset every job stuck in `running` back to `pending`. A Railway
  redeploy mid-job would otherwise orphan it.
- Jobs are idempotent: a job that runs twice must not duplicate rows.
- Backoff on retry, `attempts` capped, `last_error` always populated on failure.

---

## Files

```
DATA_DIR/studia.db
DATA_DIR/uploads/{userId}/{documentId}/{pageIndex}.{ext}
DATA_DIR/uploads/{userId}/{uploadId}/0.{ext}
DATA_DIR/backups/studia-{ISO date}.db
```

The second uploads path (M6, `docs/modules/workspace.md`) is a school-planner
photo: a one-shot job input, not a course document — no page ordering, no
SHA-256 dedup, no `documents` row. It reuses `ingestion.FileStore.put`
completely unmodified (an id where that call normally takes a `documentId`,
page index always `0`, one photo per job) rather than adding a second
storage helper for a nicer-looking path — the originally sketched
`todo-jobs/{jobId}/page.{ext}` would have needed one.

**`uploadId`, not `jobId`.** `JobQueue.enqueue` (`jobs/domain/ports.ts`, a
frozen kernel) generates the job's id internally and only returns it once
the row already exists — there is no way to know a job's id before
enqueueing it, so the file cannot be named after it. `startTodoPhotoExtraction`
generates its own id from the same `IdGenerator` for the upload's path,
writes the file, and only then enqueues the job with that path in its
payload; the job gets a separate id of its own from `enqueue()`. Both ids
are UUIDv7s from the same generator, so collision between this subtree and
`{documentId}`'s is not a real risk worth designing around, but the two
values are never the same id by construction, only by coincidence-free
convention.

Uploaded files are NEVER served as static assets. They go through an
authenticated route that verifies the document belongs to the requesting user.
Store each page's SHA-256, unique per document: the same photo cannot be added
twice to one course, but may legitimately appear in two different courses.

---

## Commands

```bash
pnpm dev            # api + web + worker in watch mode
pnpm test           # unit + integration + contract, no network
pnpm test:e2e       # Playwright, LLM_ADAPTER=fixture
pnpm eval           # LLM golden-set evaluation (costs money, manual)
pnpm fixtures:record <module> <case>   # record a real model response (costs money, manual)
pnpm typecheck      # tsc --noEmit across the monorepo
pnpm lint           # eslint + dependency-cruiser
pnpm db:generate    # Drizzle migration from schema changes
pnpm users:create   # CLI to create or reset an account
```

Vite does not typecheck. `pnpm typecheck` is what catches type errors, and it
runs in CI.

---

## Definition of done

A task is done when all of these hold:

- [ ] A test was written first and observed failing
- [ ] `pnpm test` green
- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green, including module boundary checks
- [ ] No existing test was modified or deleted
- [ ] No new dependency without written justification
- [ ] User-facing changes have a Playwright scenario

---

## Working with the human

- Ask before changing anything in `packages/contracts/`,
  `packages/core/src/jobs/` or `packages/core/src/shared/`. All three are
  frozen; changing one breaks every other agent working in parallel.
- Ask before changing the database schema of a module you do not own.
- If a requirement is ambiguous, ask. Do not guess and build.
- Report what you did NOT do as clearly as what you did.
