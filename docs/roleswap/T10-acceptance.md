# T10 — Acceptance, performance, delivery

- **Slug:** `t10-acceptance`
- **Depends on:** T01 through T09 merged
- **Goal:** prove the slice in a real browser, measure it, and write down exactly what works and what does not.
- **SPEC sections:** Acceptance and delivery (all six items, applied to cases 01 through 05); Workspace and grading (keyboard, narrow screens).
- **Out of scope:** new features. Bugs found here are fixed here only when small. Larger ones become entries in `docs/ACCEPTANCE_REPORT.md` and BACKLOG.

## Split

**P1 — Codex builds, Claude audits: scale and performance**

- `src/fixtures/large.ts`: a seeded domain of 2,000 objects and 10,000 events.
- `npm run perf`: in Chromium through Playwright, at least 30 runs each of (a) filtering the audit log and (b) refreshing a normal ticket after a single edit. Print the 95th percentile for each, the target (200 ms), the browser version, and the machine.
- Fix windowing or indexing problems the run exposes, inside the files listed here.
- Files: `src/fixtures/large.ts`, `e2e/perf.spec.ts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `src/ui/log/**`, `src/ui/directory/**`, `tests/fixtures/large.test.ts`.

**P2 — Claude builds, Codex audits: browser acceptance and delivery docs**

- Playwright specs, per case 01 through 05 and per seed: the annotated script route typed into the terminal, the GUI route clicked, one wrong fix, one control object.
- Robustness specs: refresh during an open ticket; reopen a stale editor after a terminal edit; save from two tabs; storage failure; reset one attempt; replay a closed case with one completion reward; a dry run whose before and after state is identical.
- Access specs: keyboard-only path through case 01; narrow viewport path through case 01 that keeps the active object, terminal draft, and ticket.
- Negative specs from Acceptance item 4 that apply to Tier 1: an OU move alone cannot pass case 04.
- `README.md`: what the app is, the run command, the build command, the test commands.
- `docs/SUPPORT.md`: final command and module support list, generated from the registry by a script, plus simplified platform behavior and unimplemented syntax.
- `docs/ACCEPTANCE_REPORT.md`: actual results by ticket and route, the perf numbers from P1, every unrun check, and cases 06 through 16 listed as not shipped.
- Files: `e2e/**` except `e2e/perf.spec.ts`, `scripts/support-list.*`, `README.md`, `docs/SUPPORT.md`, `docs/ACCEPTANCE_REPORT.md`.

## Contract (copy into HANDOFF_STATE.md)

- `npm run e2e` runs against the built app (`npm run build` then a static preview), not the dev server.
- The report states only results from commands run in this task. Each row names the command that produced it.
- The perf target is reported as met or missed. A miss is not hidden or averaged away.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm run build` -> expect: exit 0
- `npm run e2e` -> expect: 0 failed
- `npm run perf` -> expect: prints two p95 values and met or missed for each

## Audit focus

P1 audit (Claude):
- The large fixture is seeded and reproducible.
- Timing measures the user-visible operation, not a mocked one.
- At least 30 runs, and p95 is computed correctly.
- No test-only shortcut in production code.

P2 audit (Codex):
- Each spec asserts on visible outcome and state, not on implementation details.
- GUI specs really click. They do not call dispatch.
- The report matches the last real run. Spot-check three rows by rerunning.
- README commands work from a clean clone: `npm ci`, `npm run build`, `npm run e2e`.
- Nothing in the report claims Tier 2 or Tier 3 behavior.

## Done when

All checks pass or are reported as missed with numbers, both audits are closed, and `docs/ACCEPTANCE_REPORT.md` is committed. The slice is then ready for Omar to review and push.
