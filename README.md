# slops.sh

Terminal slots for waiting on coding agents.

Fake coins. No cash value. No deposits. No withdrawals. Real cope.

## Stack

- Next.js on Vercel for the landing page and API routes.
- Supabase Auth/Postgres for accounts, runs, spins, friends, and leaderboard state.
- OpenTUI + Bun for the terminal app.
- GitHub Actions for CI and rolling `latest` CLI artifacts.

## Local setup

```sh
bun install
cp .env.example .env.local
bun run dev
```

The web app runs on `http://localhost:3000`.

Run the TUI against local web/API routes:

```sh
SLOPS_API_URL=http://localhost:3000 bun run cli:dev
```

Run the TUI against production. This is the default, so no API URL is needed:

```sh
bun run cli:dev
```

Registration and login happen inside the TUI with username/password only. The
CLI stores the session in the OS app config directory as `slops/user.json`, not
in a sudo-owned global path.

## Install

```sh
curl -fsSL https://slops.sh/install.sh | bash
```

The installer downloads the latest GitHub Release binary for macOS or Linux,
verifies the published SHA-256 checksum when local checksum tooling is
available, and writes `slops` to `~/.local/bin` by default. Override the target
directory with `SLOPS_INSTALL_DIR=/some/bin`.

On startup, release builds check the rolling `latest` release manifest. If a
newer binary is available, the CLI asks whether to update before launching the
TUI. Use `slops --no-update` or `SLOPS_NO_UPDATE=1` to skip that check.

## Supabase

Apply the SQL migration in `supabase/migrations/0001_initial.sql` to the Supabase
project before using authenticated game state. The public URL and publishable key
are safe to expose; `SUPABASE_SERVICE_ROLE_KEY` must only be set in local env or
Vercel project env.

## Release flow

Pushes to `main` run tests, build the web app, compile the OpenTUI CLI on Linux
and macOS runners, and replace the GitHub `latest` release with fresh artifacts
plus `slops-version.json`.

Pushing a version tag such as `v0.2.0` runs the same builds and creates an
immutable GitHub Release for that tag.

## License

MIT.
