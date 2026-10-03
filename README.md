# kaneo-mailer

Turns email into [Kaneo](https://github.com/usekaneo/kaneo) tasks. The service polls an IMAP folder, reads a project id (and optionally a column) from custom headers, creates a task per message, and files the message as accepted or rejected.

It is the Kaneo successor of [plankAPI](https://github.com/GEWIS/plankapi).

## How it works

Every poll the service:

1. Opens `<IMAP_ROOT>/IN` (default `API/IN`).
2. Parses each message and reads the `X-Kaneo-Project-Id` and `X-Kaneo-Column` headers.
3. Creates a task in that project:
   - **Title:** the subject.
   - **Description:** the plain-text body (decoded, so base64 and quoted-printable mail works).
   - **Due date:** taken from the subject if it contains a `dd-mm-yyyy hh:mm` timestamp, read in the container's `TZ`.
4. Moves the message:
   - to `OUT` when the task was created;
   - to `REJECTED` when it can never succeed (missing header, unknown project or column, no access);
   - nowhere when the failure is temporary (Kaneo down, bad API key, rate limited). It is retried on the next poll.

### Headers

| Header               | Required | Value                                                                                       |
| -------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `X-Kaneo-Project-Id` | no       | The project id (from the project URL or the API). Falls back to `KANEO_DEFAULT_PROJECT_ID`. |
| `X-Kaneo-Column`     | no       | A column id, slug (`in-progress`) or name (`In Progress`).                                  |

Without `X-Kaneo-Column`, the task goes to `KANEO_DEFAULT_COLUMN` if set, otherwise to the column named `Mail` if the project has one, otherwise to the first column on the board.

Most mail clients cannot add custom headers by hand. For Thunderbird, [Header Tools Lite](https://addons.thunderbird.net/en-US/thunderbird/addon/header-tools-lite/) works. Automated senders (scripts, forms, other services) can set them directly.

## Mailbox setup

Create these folders under `IMAP_ROOT` before the first run. The service does not create them.

- `IN`
- `OUT`
- `REJECTED`

Folder paths are joined with the server's own delimiter, so servers that use `.` instead of `/` work too.

> [!IMPORTANT]
> The service never reads the inbox itself. A project id is not a secret, so anyone who knows one could otherwise create tasks. Add a server-side filter that moves mail from **trusted senders only** into `IN`.

## Kaneo setup

1. Pick or create a Kaneo user for the service. It needs permission to create tasks in every target project.
2. Signed in as that user, create an API key under **Settings -> API keys**.
3. Set it as `KANEO_API_KEY`.

Kaneo rate limits API keys (100 requests per minute by default). Each message costs one request, plus one per distinct project per poll. Messages over the limit get a `429` and are retried on the next poll.

## Configuration

All configuration comes from environment variables. See [`.env.example`](.env.example).

| Variable                   | Default                         | Description                                                                 |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `IMAP_HOST`                | required                        | IMAP server hostname.                                                       |
| `IMAP_PORT`                | `993`                           | IMAP server port.                                                           |
| `IMAP_TLS`                 | `true`                          | Use implicit TLS. Set `false` for plain or STARTTLS on port 143.            |
| `IMAP_USERNAME`            | required                        | IMAP username.                                                              |
| `IMAP_PASSWORD`            | required                        | IMAP password.                                                              |
| `IMAP_ROOT`                | `API`                           | Parent folder of `IN`, `OUT` and `REJECTED`.                                |
| `KANEO_URL`                | required                        | Kaneo base URL. `/api` is appended if missing.                              |
| `KANEO_API_KEY`            | required                        | Kaneo API key, sent as a bearer token.                                      |
| `KANEO_DEFAULT_PROJECT_ID` | unset                           | Project used when a message has no `X-Kaneo-Project-Id` header.             |
| `KANEO_DEFAULT_COLUMN`     | unset                           | Column id, slug or name used when a message has no `X-Kaneo-Column` header. |
| `POLL_INTERVAL`            | `300`                           | Seconds between polls. `0` runs once and exits (for cron or CI jobs).       |
| `LOG_LEVEL`                | `info`                          | `trace`, `debug`, `info`, `warn`, `error`. `trace` includes IMAP logs.      |
| `TZ`                       | `Europe/Amsterdam` in the image | Timezone used to read due dates from subjects.                              |

## Running

### Docker

Images are published to GHCR on every release.

```bash
cp .env.example .env   # fill in the values
docker compose up -d
```

[`compose.yml`](compose.yml) runs `ghcr.io/gewis/kaneo-mailer:latest` with your `.env`. The container polls on its own, so no cron is needed. It stops cleanly on `SIGTERM`.

### From source

Requires Node.js 24 and Corepack.

```bash
corepack enable
yarn install
cp .env.example .env
yarn dev
```

`yarn build && yarn start` runs the compiled output.

## Development

| Command                           | What it does                     |
| --------------------------------- | -------------------------------- |
| `yarn dev`                        | Run from source, reading `.env`. |
| `yarn test`                       | Unit tests (Vitest).             |
| `yarn test --coverage`            | Tests with a coverage report.    |
| `yarn lint` / `yarn lint:fix`     | ESLint.                          |
| `yarn format` / `yarn format:fix` | Prettier.                        |
| `yarn typecheck`                  | Type-check source and tests.     |
| `yarn build`                      | Compile `src` to `dist`.         |

A Husky pre-commit hook runs lint-staged and the type-check.

### Code layout

```
src/
  index.ts      entrypoint: config, logging, poll loop, signal handling
  config.ts     environment parsing and validation
  message.ts    MIME parsing, header extraction, due-date parsing
  kaneo.ts      minimal fetch-based Kaneo API client
  processor.ts  column resolution and accept / reject / retry decision
  mailbox.ts    IMAP run: fetch IN, create tasks, move messages
test/           Vitest unit tests, one file per module
```

### Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). On every push to `main`, semantic-release picks the next version, tags it, and the release workflow pushes `ghcr.io/gewis/kaneo-mailer:<version>` and `:latest`.

## License

[GPL-3.0-or-later](LICENSE).
