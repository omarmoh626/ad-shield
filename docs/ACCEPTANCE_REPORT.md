# AD Shield acceptance report (T10)

This report covers the first slice: Tier 1 cases 01 to 05. It states only results from commands run during T10, on 2026-11-18, on branch `task/t10-acceptance`. Each row names the command that produced it and the time it ran (CST, UTC−6). A check that was not run is listed as unrun.

Machine for every run: Apple M4, 16 GB, macOS (Darwin 27.0.0 arm64). Node.js v26.4.0. Browser: Chromium 159.0.8154.6 (Playwright 1.65.1, headless shell).

## Summary

- `npm run e2e`: **53 passed, 0 failed**.
- `npm run perf`: both p95 values **met** the 200 ms target.
- `npm run typecheck`, `npm test`, `npm run guard`, `npm run build`, `npm audit`: passed.
- Cases 01 to 05 pass every browser route tested here, on both seeds. The first `npm run e2e` run (18:06) failed 3 tests, which exposed two bugs. Both were fixed in T10 under decision D9 (K1 and K2 below), and the final run (18:42) passed every test.
- Cases 01 to 05 count as **shipped** for this slice, because `npm run e2e` reached 0 failed. One limit applies: the browser specs do not check the Evidence tab contents per case. Unit tests cover those (see unrun checks).
- Cases 06 to 16 are **not shipped**. They are not built.

## Checks

| Check | Command | Ran at | Result |
| --- | --- | --- | --- |
| Type check | `npm run typecheck` | 18:37:49 | exit 0 |
| Unit and component tests | `npm test` | 18:41:59 | 48 files, 485 tests passed |
| Safety and purity guard | `npm run guard` | 18:37:59 | exit 0 |
| Build | `npm run build` | 18:42:09 | exit 0 |
| Support list matches registry | `node scripts/support-list.mjs --check` | 18:17:50 | up to date, 34 cmdlets |
| Dependency audit | `npm audit` | 18:42:09 | found 0 vulnerabilities |
| Browser tests (final) | `npm run e2e -- --reporter=list` | 18:42:09 to 18:44:00 | 53 passed, 0 failed, exit 0 |
| Browser tests (first run, before D9) | `npm run e2e -- --reporter=list` | 18:06:28 to 18:08:29 | 48 passed, 3 failed, exit 1 |
| Performance (final) | `npm run perf` | 18:19:41 to 18:19:48 | 1 passed; both targets met |

## Performance

Command: `npm run perf`, run at 18:19:41 to 18:19:48. It builds the separate perf page (`npm run build:perf`), serves it with `vite preview`, and runs `e2e/perf.spec.ts` in Chromium. The data set is the seeded large fixture: 2,000 directory objects and 10,000 audit events. Each sample is timed inside the page, from the input or click event to the first animation frame after the result is rendered. p95 is the nearest-rank value of 30 samples (the 29th smallest).

| Operation | Runs | p95 | Target | Result |
| --- | --- | --- | --- | --- |
| Audit-log text filter, typing to the matching event's row rendered | 30 | 14.00 ms | 200 ms | met |
| Ticket refresh after one edit (unlock), click to checklist row "Done" | 30 | 27.70 ms | 200 ms | met |

An earlier run of the same command at 17:48:06, after the D7 timer fix and before D9, gave 14.40 ms and 27.30 ms, both met. These numbers are from one machine. No slower machine was measured.

## Results by ticket and route

Command for every row in this section: `npm run e2e -- --reporter=list`, run at 18:42:09 to 18:44:00 (`e2e/cases.spec.ts`). Each case runs on both seeds. Seed 1 opens through the normal campaign order: the spec plays every earlier case by its GUI route first. Seed 2 opens as a replay through "Try this case again, new details".

What each route asserts:

- **Script route:** types each line of the case's annotated `routes.script` into the console and presses Enter. No console error lines appear, the checklist reads "N of N done", and **Finish case** opens the debrief.
- **GUI route:** clicks the case's `routes.gui` path in the Directory tab: tree rows, property tabs, the **Actions** menu, editor fields, and **Apply**. It never calls dispatch. Then the checklist reads "N of N done" and **Finish case** opens the debrief.
- **Wrong fix:** types the case's first wrong fix. Each check the fixture marks as unmet is not "Done", and **Finish case** stays disabled.
- **Control object:** after the GUI route, every control check is "Done". The spec then opens the control object in the Directory and compares its visible account status and direct groups with the starting values.

| Case | Seed | Script route | GUI route | Wrong fix | Control object |
| --- | --- | --- | --- | --- | --- |
| case01 Locked-out account | 1 | pass | pass | pass ("Password reset alone") | pass (Maya Alli) |
| case01 | 2 | pass | pass | pass | pass (Kenji Morito) |
| case02 Finance share read access | 1 | pass | pass | pass ("Add user to Finance manager write role") | pass |
| case02 | 2 | pass | pass | pass | pass |
| case03 New hire | 1 | pass | pass | pass ("Create without -Path") | pass (existing Tomas Lindqvist) |
| case03 | 2 | pass | pass | pass | pass (existing Maya Ali) |
| case04 Transfer | 1 | pass | pass | pass ("Move the account only") | pass |
| case04 | 2 | pass | pass | pass | pass |
| case05 Contractor offboarding | 1 | pass | pass | pass ("Disable only") | pass |
| case05 | 2 | pass | pass | pass | pass |

In the first run (18:06:28), the case 03 script route failed on both seeds. Line 3 (`$pw = Read-Host … -AsSecureString`) and line 4 (`New-ADUser … -AccountPassword $pw …`) are typed as separate commands, and line 4 failed with `Cannot convert value "" to type "System.Security.SecureString".` K1 below fixed this, and the final run passed.

Only the first wrong fix of each case runs in the browser. The other wrong fixes are covered by unit tests only.

## Robustness, access, and negative checks

Command for every row: `npm run e2e -- --reporter=list`, run at 18:42:09 to 18:44:00.

| Spec | File | Result |
| --- | --- | --- |
| Refresh during an open ticket keeps the case and its progress | `e2e/robustness.spec.ts` | pass |
| A stale editor after a terminal edit warns, keeps the draft, and applies after **Review with the new values** | `e2e/robustness.spec.ts` | pass |
| A second tab is read-only ("Read only") and does not overwrite the first tab's progress | `e2e/robustness.spec.ts` | pass |
| A read-only second tab explains why it is read-only, in text | `e2e/robustness.spec.ts` | pass (failed in the first run; fixed by K2) |
| Console variables last across typed lines, then clear on **Reset this attempt**, reload, and case change (case 01 to case 02) | `e2e/console-session.spec.ts` | pass |
| Secure password: while the prompt is open, only the masked field (`type="password"`) holds it; after submission, no input or textarea value, page text, page HTML, the save, or the command history (Up arrow) holds it | `e2e/console-session.spec.ts` | pass |
| Storage failure shows "Not saved" and the notice, and the lab keeps working | `e2e/robustness.spec.ts` | pass |
| **Reset this attempt** puts case 01 back where it started | `e2e/robustness.spec.ts` | pass |
| Replaying a closed case shows "replay, not counted", and the rank and posture stay the same | `e2e/robustness.spec.ts` | pass |
| A dry run (`Unlock-ADAccount -WhatIf`) leaves the checklist, the evidence count, and `LockedOut True` unchanged | `e2e/robustness.spec.ts` | pass |
| Negative: an OU move alone cannot pass case 04 | `e2e/robustness.spec.ts` | pass |
| Keyboard only: case 01 from the ticket to **Finish case** (Tab, arrows, Shift+F10 menu, Enter) | `e2e/access.spec.ts` | pass |
| Narrow screen (390 × 844): case 01 keeps the selected object, the terminal draft, and the ticket across tabs; no horizontal scroll | `e2e/access.spec.ts` | pass |

## Known issues

### Found and fixed in T10 (decision D9)

- **K1. Console variables did not survive between typed lines.** The console started a new runtime for each line, so `$pw` from `Read-Host -AsSecureString` was empty on the next line. Fix: one console session per case attempt (`src/ui/terminal/Terminal.tsx`). The session lives in memory only. A secure string holds the policy verdict only. What the tests verify (`npm test` at 18:41:59 and `npm run e2e` at 18:42:09):
  - `$pw` set on one typed line works on the next line.
  - Variables clear on **Reset this attempt**, on reload (browser reload in e2e; unmount and mount in the unit test), and when another case opens.
  - While the secure prompt is open, no input or textarea except the masked secure field holds the typed password, and the page text does not contain it.
  - After submission, the typed password is in none of these: any input or textarea value, the page text, the page HTML, the saved `adshield.v1` value, the command history (Up arrow), and, in the unit test, the store and the audit events.
  - Not verified: browser memory, devtools, or other storage keys.
- **K2. A read-only second tab did not say why.** The notice was added after the status change had already updated the screen. Fix: `src/persist/session.ts` adds the notice before it sets the read-only status. The tab now shows "The simulator is open in another tab. This tab is read-only and will take over when that tab closes." as text in the status message area (`role="status"`), and the header still reads "Read only". Tested in `tests/persist/persist.test.ts` and `e2e/robustness.spec.ts`.

### Open

These are open. None is counted as a pass.

- **K3. The e2e specs are not type-checked.** `tsconfig.json` covers `src` and `tests` only.

Carried over in `docs/roleswap/BACKLOG.md`, open:

- **T03 D9, `-ChangePasswordAtLogon`.** Sign-in must honor the stored `changePasswordAtLogon` attribute. The backlog entry says it was scheduled for T04 P2. T10 did not check it.
- **Tests in a read-only sandbox.** `npm test` cannot run when `node_modules` is read-only.
- **Bug: multi-line paste.** Pasting several lines into the console joins them into one command.
- **Bug: Progress panel.** The Progress panel pushes the page down.
- **Bug: checklist detail text.** The detail text shows internals such as "sequence 14".

## Revision items (BACKLOG, after T10, not done)

- Beginner help: a "New to PowerShell?" guided mode, starter command buttons, **Try it** buttons on `Get-Help` examples, and a plain explanation under command output.
- PowerShell glossary page.
- Ticket chip shows `case01`. Use ticket numbers such as `INC-01`.
- `Remove-ADUser` with `-WhatIf` and confirmation, and a `user.delete` action.
- Testing: Omar plays every case by hand. Three AI testers run every case and report bugs and confusing spots.
- The multi-line paste, Progress panel, and checklist detail text bugs, also listed above.

## Not shipped: cases 06 to 16

Cases 06 to 16 are not built in this slice. They are Tier 2 (access review, containment, and recovery) and Tier 3 (identity incident response) work in `docs/roleswap/BACKLOG.md`. Nothing in this report covers them. The inbox code (`endOfSliceNotice`) is written to tell a learner who finishes case 05 that Tier 2 and Tier 3 are not built yet. T10 did not run a browser test of that notice.

## Unrun checks

- A clean clone (`npm ci`, `npm run build`, `npm run e2e` in a fresh folder) was not run. The README commands were run in the working copy only.
- Firefox and WebKit were not run. Only Chromium was tested.
- Narrow screens were tested at 390 × 844 only, and on case 01 only.
- Keyboard-only use was tested on case 01 only, with the Directory route. No screen reader was tested.
- Performance was measured on one machine (Apple M4) only.
- The browser specs do not check the Evidence tab contents (events and before/after diff) per case. Unit tests cover them.
- Codex audits: the P2 adversarial review (working tree) found one major issue, F1: the secure-input page check missed live input values. F1 was fixed in fix round 1. The re-review (`codex-companion review --wait --scope working-tree`, 18:41:27 to 18:41:54) found no actionable issues. In Codex's sandbox, its own runs of `npm test`, `npm run build`, `npm audit`, `npm run e2e`, and `npm run perf` exited 1. Its sandbox has a read-only `node_modules`, no network, and no local ports. Every result in this report comes from Claude's runs.
