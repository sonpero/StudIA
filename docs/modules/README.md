# StudIA — Module specifications

One file per module. Read your module's spec and this file before writing code.
Do not read the others unless you need to understand a boundary you are calling.

| Module | Milestone | Owns |
|---|---|---|
| [`jobs`](./jobs.md) | M2 | Shared job queue. **Frozen.** |
| [`identity`](./identity.md) | M1 | Users, sessions |
| [`ingestion`](./ingestion.md) | M2 | Upload, files, text extraction |
| [`content`](./content.md) | M3 | Notions, search |
| [`generation`](./generation.md) | M3, M4 | Cards: flashcards, MCQs, open questions |
| [`review`](./review.md) | M3, M4 | Scheduling, FSRS, sessions |
| [`progress`](./progress.md) | M5 | Deadlines, per-course coverage/readiness |
| [`workspace`](./workspace.md) | M6, M7 | Today view, todos, pomodoro |
| [`tutor`](./tutor.md) | M8 | RAG chat over a course |

---

## Layer contract

```
domain/        pure. No I/O, no imports from application/ or infra/, no `new Date()`
application/   use cases. Orchestrate domain + ports. No SQL, no fetch.
infra/         adapters. The only layer allowed to touch SQLite, the filesystem or the network
index.ts       the only file another module may import from
```

`domain/ports.ts` declares the interfaces `infra/` implements. Ports are owned by
the domain, not by the adapter. A port whose signature mentions SQL, HTTP or a
vendor name is wrong.

## Shared conventions

**Result, not exceptions.** Domain and application code return
`Result<T, E>`. Only `infra/` throws, and the API layer maps errors to status
codes in one place.

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

**Injected clock.** Anything time-dependent takes `now: Date` as an explicit
parameter. No module calls `new Date()` inside `domain/`. This is what makes
scheduling testable.

**IDs.** UUID v7, generated in `application/` through an `IdGenerator` port,
never by SQLite.

**Ownership.** Every repository method takes `userId` and filters on it. A method
without `userId` in its signature is a bug, including read methods.

**Dates.** ISO 8601 UTC strings in the database. Conversion to local time happens
in the web app only.

## Frozen boundaries

`packages/contracts/`, `packages/core/src/jobs/` and `packages/core/src/shared/`
are frozen. If your module needs a change there, stop and ask the human. Do not
edit them in a worktree:
two agents changing a frozen package is the failure mode this rule exists to
prevent.

`shared/` is the second kernel next to `jobs/`: the `Result` type, the `Clock`
and `IdGenerator` ports, and the model client factory every LLM adapter builds
on. It contains no business logic; a business rule in `shared/` is a smell.

## Spec format

Each spec has the same sections: **Responsibility**, **Domain**, **Ports**,
**Use cases**, **Persistence**, **API**, **Out of scope**, **Key tests**,
**Open questions**. If a spec contradicts `CLAUDE.md`, `CLAUDE.md` wins and you
should flag the contradiction.
