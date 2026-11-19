# AD Shield

AD Shield is a browser lab for learning Active Directory help-desk work. You read a ticket, then fix it in a simulated PowerShell console or a simulated Directory (ADUC-style) view, and the lab checks the result. Everything is simulated: the domain `corp.contoso.local`, its people, hosts, sign-ins, and passwords are fictional. The app has no backend and makes no network calls. Progress is saved in your browser only.

This slice ships Tier 1 cases 01 to 05. Cases 06 to 16 (Tier 2 and Tier 3) are not built yet. See `docs/ACCEPTANCE_REPORT.md` for what was tested and what is known not to work, and `docs/SUPPORT.md` for the supported commands and simplifications.

## Requirements

- Node.js 20 or later and npm.
- For browser tests: Chromium for Playwright (`npx playwright install chromium`, once per machine).

## Run

```sh
npm ci
npm run dev
```

Open the address Vite prints (localhost). The development server is for local use only. Do not expose it with `--host` on shared networks.

## Build

```sh
npm run build      # static app in dist/
npm run preview    # serve dist/ locally
```

The build uses relative paths (`base: './'`), so `dist/` can be served from any folder.

## Test

| Command | What it runs |
| --- | --- |
| `npm run typecheck` | TypeScript in strict mode (`src`, `tests`) |
| `npm test` | Vitest unit and component tests (`tests/`) |
| `npm run guard` | Safety and purity checks on `src/` |
| `npm run e2e` | Playwright browser tests in `e2e/`, against a fresh `npm run build` served by `vite preview` |
| `npm run perf` | Performance run in Chromium on a separate perf build with 2,000 objects and 10,000 events; prints p95 against the 200 ms target |
| `node scripts/support-list.mjs --check` | Checks that the command list in `docs/SUPPORT.md` matches the cmdlet registry (run without `--check` to regenerate it) |

A clean check from a fresh clone:

```sh
npm ci
npx playwright install chromium
npm run build
npm run e2e
```
