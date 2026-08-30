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
