# StudIA — Testing

`CLAUDE.md` states the workflow (test first, never delete a red test) and the five
layers. This file is the how: where files live, how fixtures are built, how the
database and the clock are handled, and what is deliberately not tested.

---

## Layout and naming

```
packages/core/src/<module>/
  domain/scheduler.ts
  domain/scheduler.unit.test.ts          next to the code
  infra/notion-repository.int.test.ts
  infra/notion-splitter.contract.test.ts
apps/api/src/routes/documents.int.test.ts
apps/web/src/components/CardList.unit.test.tsx
e2e/                                     Playwright, one file per user story
evals/                                   golden set, run manually
tests/fixtures/<module>/<case>.json       recorded model responses
tests/support/                            builders, db helper, app helper
```

| Suffix | Layer | Runs in `pnpm test` |
|---|---|---|
| `.unit.test.ts` | Pure, no I/O | yes |
| `.int.test.ts` | Real SQLite, real Fastify | yes |
| `.contract.test.ts` | Recorded model responses | yes |
| `.spec.ts` | Playwright | no, `pnpm test:e2e` |
| `.eval.test.ts` | Golden set, real API calls | no, `pnpm eval` |

Vitest is configured with one project per suffix so a layer can be run alone.

---

## The network is off

`tests/support/no-network.ts` runs as a global setup for `pnpm test` and replaces
`globalThis.fetch` with a function that throws, naming the URL it was called with.

This is not paranoia: a fixture adapter wired up wrong silently falls through to
the real client, the test passes, and you discover it on the bill. The throw turns
that into an immediate, legible failure.

`pnpm eval` runs with a separate config that does not install this setup.

---

## Database

**A file, never `:memory:`.** In-memory SQLite cannot exercise WAL, and the
pragmas and migrations are part of what integration tests exist to verify.

Per-test isolation with a migrated template:

```ts
// tests/support/db.ts
// Once per process: build a fully migrated database in a temp dir.
// Per test: copy that file. A copy is a few milliseconds; migrating is not.
export function freshDb(): { db: Database; path: string; cleanup: () => void };
```

Rules:

- Every test gets its own database. No shared state, no ordering dependency, no
  truncate-between-tests.
- Migrations run through the same code path production uses. A test that builds
  its schema with inline `CREATE TABLE` is testing a schema that does not exist.
- Never mock a repository in an integration test. The point is the SQL.
- Assert against the database as well as the return value: a use case that
  returns the right object and writes the wrong row must fail.

---

## Time

Nothing in `domain/` calls `new Date()`, so unit tests pass `now` explicitly and
assert exact dates:

```ts
const now = new Date('2026-03-01T08:00:00Z');
const next = schedule(current, 3, now);
expect(next.due).toBe('2026-03-04T08:00:00Z');
```

No fake timers, no clock freezing, no tolerance windows. If a test needs
`vi.useFakeTimers()`, something took the clock implicitly and that is the bug.

The one legitimate exception is the front-end pomodoro countdown, which is driven
by a real interval.

---

## Builders

Test data comes from builders in `tests/support/builders.ts`, never from inline
object literals repeated across files:

```ts
export const aUser = (over: Partial<User> = {}): User => ({ ... , ...over });
export const aNotion = (over: Partial<Notion> = {}): Notion => ({ ... , ...over });
```

Each builder returns a valid default. **A test only sets the fields it is about**,
so the reader sees immediately what matters. A test that spells out fifteen fields
to assert one of them hides its own point.

---

## API tests

Use `app.inject()`, not a listening server and not `supertest`. It is in-process,
has no port, and cannot leak between tests.

```ts
const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { ... } });
```

Every route gets, at minimum:

- the happy path
- the unauthenticated case, expecting 401
- **the other-user case, expecting 403.** Seed two users, act as the second,
  assert the first one's data is unreachable. This is the test that protects the
  `user_id` scoping rule from `CLAUDE.md`, and it is cheap enough that every
  route should have it.
- the validation-failure case, expecting 400

---

## LLM fixtures

Recorded model responses live in `tests/fixtures/<module>/<case>.json`.

**Record the raw response, not the parsed object.** A fixture containing an
already-valid object never exercises the Zod validation, the retry path, or the
schema conversion, which are the three things most likely to break.

```bash
pnpm fixtures:record <module> <case>    # real API call, writes the JSON, costs money
```

Recording is always manual and never runs in CI. Commit fixtures; they are the
test suite's memory of how models actually behave.

### Two levels, both needed

**Port level.** A fixture adapter implements the port and returns the recorded
value. Use it in application and integration tests. Fast, and it covers
orchestration.

**Transport level.** MSW intercepts the HTTP call so `generateObject` itself runs:
schema-to-JSON-Schema conversion, parsing, and the SDK's own error handling. At
least one contract test per port must go through this level. Without it, a schema
that the provider rejects passes every test and fails in production.

### Required cases per port

Every LLM port has at minimum these fixtures:

| Case | Asserts |
|---|---|
| `valid` | Happy path, output matches the schema |
| `schema-violation` | Exactly one retry, then the job fails with `last_error` |
| `refine-violation` | A domain invariant catches it (answer absent from options, duplicate titles) |
| `degraded` | A legitimate but poor result (illegible photo, 3 notions) is handled as a result, not an error |
| `empty` | Empty array or empty string does not crash |

The `refine-violation` case is the one people skip. It is also the one that
catches the failure users actually notice.

---

## Front-end tests

Component tests use Testing Library and query by role and label, never by class
name or test id, unless there is genuinely no accessible handle.

Every screen that loads data has a test for each of the four required states from
`docs/UI.md`: loading, empty, error, ready. A screen with three of the four is
incomplete, and this is where that gets caught rather than in review.

No snapshot tests on rendered markup. They fail on every legitimate change and get
regenerated without being read, which makes them worse than no test.

---

## End-to-end

Playwright, against a real build, with a real SQLite file and a real worker.

**Model adapters run from fixtures.** The client factory reads `LLM_ADAPTER`; e2e
sets it to `fixture`, and `FIXTURE_DELAY_MS` makes extraction slow enough that the
`en cours` state is observable. This is the only way to test the asynchronous
rules from `docs/UI.md` honestly.

- One database per run, seeded by a script, deleted afterwards
- Authentication via `storageState`, logged in once in global setup. The login
  flow itself has its own dedicated test.
- **No `waitForTimeout`.** Web-first assertions only (`toBeVisible`,
  `toHaveText`). A timeout in an e2e test is a flake waiting to happen and it will
  fire in CI, not locally.
- Test the failure paths, not just the happy ones: a failed extraction shows a
  retry, and the retry works.

---

## Architecture tests

`dependency-cruiser` enforces the rules from `CLAUDE.md` in `pnpm lint`:

| Rule | Forbids |
|---|---|
| `no-deep-module-import` | Importing anything but another module's `index.ts` |
| `domain-is-pure` | `domain/**` importing `infra/**`, `application/**`, or any package doing I/O |
| `no-ai-in-progress` | `progress/**` importing any AI package |
| `no-fsrs-outside-review` | `ts-fsrs` imported outside `review/domain/scheduler.ts` |
| `no-circular-dependency` | Any import cycle, anywhere in the cruised graph |
| `workspace-no-cross-module-sql` | `workspace/infra/**` importing a VALUE (not just a type) from another module's `index.ts` |
| `no-second-ai-client-wrapper` | `@ai-sdk/<provider>` imported anywhere but `shared/model-client.ts` |
| `frozen-kernels` | `jobs/**` and `shared/**` importing any business module |

Each rule ships with a deliberate violation in a scratch branch to prove it fires.
A lint rule nobody has seen fail is a rule nobody knows works.

`no-ai-in-progress` and `no-fsrs-outside-review`'s non-vacuity (M5) was checked
by temporarily adding `import "ai";` and `import "ts-fsrs";` to
`progress/domain/compute-progress.ts`, running `pnpm lint`, and reading both
expected failures before reverting:

```
error no-fsrs-outside-review: packages/core/src/progress/domain/compute-progress.ts → node_modules/.pnpm/ts-fsrs@5.4.1/node_modules/ts-fsrs/dist/index.mjs
error no-ai-in-progress: packages/core/src/progress/domain/compute-progress.ts → node_modules/.pnpm/ai@4.3.19_react@19.2.8_zod@3.25.76/node_modules/ai/dist/index.mjs
```

`no-circular-dependency`'s non-vacuity (M6) was checked by temporarily adding
`import { getDeadline } from "../../progress/index.js";` to
`review/application/get-due-cards.ts` — closing the loop against `progress`'s
existing, real import of `review` (`assemble-progress-notions.ts`'s
`projectRetrievability`) — running `pnpm lint`, and reading the cycle it
reported before reverting:

```
error no-circular-dependency: packages/core/src/progress/application/list-progress.ts →
    packages/core/src/review/index.ts →
    packages/core/src/review/application/get-due-cards.ts →
    packages/core/src/progress/index.ts →
    packages/core/src/progress/application/list-progress.ts
```

(Three more permutations of the same cycle through `get-course-progress.ts`
and `assemble-progress-notions.ts` were reported alongside it — same loop,
different entry point.) This rule was added ahead of M6 specifically because
`docs/modules/progress.md`'s `notionsBelowTarget` design rejected a `review
→ progress` edge that would have closed exactly this cycle; before this
rule, nothing in `pnpm lint` would have caught a future agent doing it
anyway.

`workspace-no-cross-module-sql`'s non-vacuity (M6) was checked in both
directions, because a plain `to.path` rule turned out not to be able to
express this constraint at all: another module's schema tables are
legitimately re-exported from its own `index.ts` (for other modules'
documented cross-module joins, e.g. `review`'s own), so the file-level edge
from `workspace/infra/**` to that `index.ts` looks identical whether it's a
forbidden join or an allowed type-only reference — confirmed empirically by
adding `export { notionsTable as __tempTestTable } from "../../content/index.js";`
to `workspace/application/create-todo.ts` against a first-draft `to.path`-only
rule and finding it did **not** fire. The fix was `dependencyTypesNot:
["type-only"]`, which `depcruise --output-type json` showed distinguishes a
plain `import`/`export` (`dependencyTypes: ["local", "export"]`) from an
`import type` (`dependencyTypes: ["local", "type-only", "import"]`). With
that rule in place:

- A value re-export (`export { notionsTable as __tempCrossModuleTable }
  from "../../content/index.js";` added to
  `workspace/infra/sqlite-todo-repository.ts`) fired:
  ```
  error workspace-no-cross-module-sql: packages/core/src/workspace/infra/sqlite-todo-repository.ts → packages/core/src/content/index.ts
  ```
- The same file with only `import type { Notion as __TempNotion } from
  "../../content/index.js";` added produced no violation — proving the rule
  doesn't also block the legitimate type-only references `workspace`'s own
  repository has no reason to need in the first place, and would need if it
  ever did.

Both edits were reverted after observing the expected result.

**A real false positive surfaced once this rule met real code (M6 step 3),
fixed rather than worked around.** `workspace/infra/{claude,fixture}-todo-extractor.ts`
legitimately import values from `shared/index.ts` (`createLanguageModel`,
`err`, `ok`) — exactly what every other module's own LLM adapter does — and
the rule as first written flagged both, because its `to.path` matched *any*
other module's `index.ts`, `shared` included. `shared` and `jobs` are frozen
kernels, not business modules with tables of their own, so the rule's `to`
now excludes them by name (`(?!workspace/|shared/|jobs/)`). Re-ran the
value-import/type-only-import check above after the fix: still fires on
`content`'s table, still silent on a type-only reference.

`no-second-ai-client-wrapper`'s non-vacuity (M6 step 4) was checked by
temporarily adding `import { createAnthropic } from "@ai-sdk/anthropic";
export const __tempSecondClient = createAnthropic({ apiKey: "x" });` to
`workspace/infra/claude-todo-extractor.ts`, running `pnpm lint`, and reading
the failure before reverting:

```
error no-second-ai-client-wrapper: packages/core/src/workspace/infra/claude-todo-extractor.ts → node_modules/.pnpm/@ai-sdk+anthropic@1.2.12_zod@3.25.76/node_modules/@ai-sdk/anthropic/dist/index.mjs
```

No pre-existing violations were found when the rule was first added — every
current adapter already goes through `shared.createLanguageModel`. This is
the rule M6's acceptance box ("todo extraction reuses the existing port, no
new LLM adapter") rests on: `ClaudeTodoExtractor` is a new adapter *class*
(expected, CLAUDE.md rule 3), but this rule is what makes it not a second
client wrapper.

Any rule whose `to.path` targets a `node_modules` package must match
`node_modules/.pnpm/**`, never an anchored `^node_modules/<pkg>`: pnpm resolves
a package through `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`,
not a top-level `node_modules/<pkg>/...`, so an anchored pattern silently never
matches (`no-fsrs-outside-review` and `no-ai-in-progress` both had this bug,
unnoticed since M0, until M3's scratch-violation check caught it).

---

## Evals

`evals/golden/` holds real course material with expected outcomes. Run manually,
costs money, never in CI, no pass/fail gate on a pull request.

| Metric | Module | Meaning |
|---|---|---|
| Schema validity rate | all | Share of calls valid on the first attempt |
| Notion coverage | `content` | Share of expected notions actually produced |
| Granularity | `content` | Notion count against the annotated expectation |
| Distractor quality | `generation` | Human-rated plausibility, sampled |
| Groundedness | `tutor` | Answers supported by the retrieved context |
| Refusal rate | `tutor` | Out-of-scope questions correctly refused |

Record each run with the date, the model, and the numbers, in
`evals/results/YYYY-MM-DD.md`. The point is the trend across model and prompt
changes; a single run tells you almost nothing.

Ten documents minimum, spanning: clean PDF, photographed handwriting, a slide
deck, a very short lesson, a very long one, and one in a subject with heavy
notation such as maths or chemistry. That last one is where extraction and
splitting break first.

---

## Coverage

No global threshold. Coverage numbers push people to test getters.

One exception: `domain/**` is expected at 100% branch coverage, because it is pure,
fast and the entire point of the layering. If a branch there is hard to reach, it
is probably dead code.

---

## Not tested

Deliberately, so nobody adds them later thinking they were forgotten:

- Third-party library behaviour. `ts-fsrs` is not our code; our wrapper is.
- Drizzle's SQL generation. Integration tests cover the queries we care about.
- shadcn/ui component internals.
- Model output quality in `pnpm test`. That is what evals are for, and mixing
  the two produces a flaky suite that people learn to ignore.
- Exact French copy. Assert on roles and structure; asserting on wording makes
  every rewording a test failure.

---

## Definition of done, testing part

- The test was written first and observed failing, for the right reason
- New route: happy path, 401, 403 for another user, 400 for invalid input
- New LLM port: the five fixture cases, at least one at transport level
- New screen: the four UI states
- New domain rule: a passing and a failing case
- Bug fix: a regression test that fails before the fix
