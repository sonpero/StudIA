# StudIA
Study companion web app

## Creating a user account

Small, private deployment: no self-signup. Every account is created (or
reset) by an administrator from the CLI, never over HTTP
(`docs/modules/identity.md`).

```bash
pnpm users:create <username>
```

The command prompts for a password (input hidden) and stores the account in
the SQLite database at `DATA_DIR` (`apps/api/.data/studia.db` by default) —
the data directory and the database's migrations are created automatically
if they don't exist yet, so there's no separate setup step.

Running the command again with a username that already exists resets that
account's password instead of failing; there is no separate reset command.

## Environment variables

Copy `.env.example` to `.env` for local development. The same variables are
set on the Railway service in production.

| Variable | Required | Meaning |
|---|---|---|
| `SESSION_SECRET` | yes | Signs the session cookie. The API refuses to start without it. |
| `ANTHROPIC_API_KEY` | yes, unless `LLM_ADAPTER=fixture` | Key for every real model call (API and worker). |
| `LLM_MODEL` | no | Anthropic model id used by every model call. Defaults to `claude-sonnet-5` when unset or blank. |
| `LLM_ADAPTER` | no | `fixture` replaces every model call with recorded fixtures (tests, e2e). Anything else means real calls. |
| `DATA_DIR` | no | Database, uploads and backups. Defaults to `.data` in the working directory. |
| `COOKIE_SECURE` | no | `true` marks the session cookie `Secure` (HTTPS deployments). |
| `PORT` | no | API port, 3000 by default. |

`LLM_MODEL` is read by both the API and the worker; in production both run
in the one Railway container, so one service variable covers them. A model id the account cannot use fails every model job with the
provider's error, visible in the job's `last_error`.
