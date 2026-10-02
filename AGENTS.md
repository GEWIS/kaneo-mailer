# AGENTS.md

Guidance for coding agents working in this repository. Read [README.md](README.md) first for what the service does.

## Commands

Use Yarn 4 through Corepack (`corepack enable`). Do not use npm or pnpm; they would create a second lockfile.

```bash
yarn install
yarn lint        # ESLint (GEWIS config, type-aware)
yarn format      # Prettier check; yarn format:fix to write
yarn typecheck   # tsc over src and test
yarn test        # Vitest
yarn build       # tsc -p tsconfig.build.json -> dist/
```

Run all five before you say a change is done. CI runs the same steps (`.github/workflows/lint-and-build.yml`).

## Architecture

One process that polls IMAP and calls the Kaneo REST API. There is no server and no database.

- `src/index.ts` is the only file with side effects at import time (log4js setup, `main()`). Keep everything else pure or injectable.
- `src/mailbox.ts` takes a `MailClient` (a `Pick` of `ImapFlow`) so tests use a fake. Do not import `ImapFlow` as a value there.
- `src/kaneo.ts` takes a `fetch` implementation for the same reason. It only wraps the endpoints the service uses. Add endpoints there, not inline `fetch` calls elsewhere.
- `src/processor.ts` owns the accept / reject / retry decision. `KaneoError.permanent` decides which HTTP statuses reject a message. Changing that list changes what happens to real mail, so cover it with a test.

## Kaneo API facts

These are verified against the Kaneo source (`apps/api/src`) and a live instance:

- Base path is `/api`. Auth is `Authorization: Bearer <api key>` (the `x-api-key` header also works).
- `GET /api/column/{projectId}` returns columns sorted by `position`, each with `id`, `slug`, `name`.
- `POST /api/task/{projectId}` takes `title`, `description` (required, may be empty), `status` (a column **slug**, not an id), `priority` (`no-priority` | `low` | `medium` | `high` | `urgent`) and an optional ISO `dueDate`.
- An unknown project returns `400`, a project in another workspace `403`, an unknown status slug `400`.
- IDs are opaque mixed-case strings. Never validate them with a numeric or lowercase-only pattern.
- Errors are JSON `{ "message": "..." }`.

## Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`. No `any`; the lint config rejects unsafe assignments.
- CommonJS output (`module: nodenext` without `"type": "module"`). Relative imports have **no** file extension; the GEWIS ESLint config enforces that.
- Plain ASCII in code, comments and docs.
- Tests live in `test/<module>.test.ts`. Build raw messages with `rawMail()` from `test/helpers.ts`.
- New environment variables go in `src/config.ts`, `.env.example`, the README table and `test/config.test.ts`.

## Commits and PRs

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`, `build:`). semantic-release reads them to pick the version, and a `feat` or `fix` on `main` publishes a Docker image.
- PRs are squash-merged, so the PR title must also be a valid Conventional Commit.

## Out of scope

- Reading the inbox directly. Mail must be filtered into `IN` by a trusted-sender rule; see the README.
- Creating IMAP folders automatically.
- Attachments. Only the plain-text body is used.
