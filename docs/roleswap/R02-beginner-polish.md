# R02 — Beginner help, time, and layout

- **Slug:** `r02-beginner-polish` (branch `task/r02-beginner-polish`)
- **Depends on:** R01 merged
- **Goal:** a learner who has never used PowerShell can start, understand each result, and finish on desktop, phone, or keyboard only.
- **Source:** tester reports from 2026-11-19, Omar's own playthrough, and the "Revision phase" items in `docs/roleswap/BACKLOG.md`. Close each BACKLOG item this task fixes.
- **Out of scope:** new cases, the PowerShell glossary page (R03).

Run `npm audit` first. Any new high or critical advisory is a stop-and-ask.

## Split

**P1 — Codex builds, Claude audits: content and time**

1. **Remove leftover T07 text.** Hints in cases 01, 02, and 04 still say "The Directory tab is built in T07. Until then, use the console." Remove it everywhere and add a test that no learner-facing string contains "T07" or any task ID.
2. **Ticket chip shows a ticket number,** `INC-01` to `INC-05`, not `case01`. Internal IDs stay unchanged.
3. **Case 02 approval step shows the approval.** "Read the approval record" must show the manager's approval (who approved, what access, for whom), not `Get-SimTicket` internals.
4. **Case 03 checklist wording:** "Exactly one new account exists, with sign-in name tolindqvist," not "signed in as."
5. **Case 05 scope note:** the debrief says this was a limited, approved offboarding change; that existing sessions or tickets can still work until they expire; and that a real analyst would escalate the retained privileged group and session revocation.
6. **SLA units match.** Pick one rule and apply it to every case: show the SLA the ticket states, and if the lab compresses time, say so in text ("4 hours, shown at 1 lab minute per real minute" or similar). After a case closes, hide the SLA, Pause, and Advance lab time controls, or show "No active case."
7. **Reset and refresh explain themselves.** The reset confirmation says what resets (case state, lab clock, hints) and what stays (earlier completions, cheat sheet). After a refresh, return to the screen the learner was on, with hints at the level they had opened. Console history may clear, and the app says so once.
8. **Explain the posture number.** The Progress button shows what posture means on first view or in its panel.

Files: `src/tickets/cases/**`, `src/ui/ticket/**`, `src/ui/topbar/**`, `src/ui/debrief/**`, `src/persist/**` (screen restore only), tests.

**P2 — Claude builds, Codex audits: console help and layout**

9. **Empty console is not blank.** Show a short starter panel: what the console is, three starter buttons that fill (not run) a command for this case, and "Type `help` for the command list."
10. **"What this means" after every output.** One plain-language line under each command's result, built from the output (for example, "Locked out: yes. The lock is the problem, not the account.").
11. **Multi-line paste.** Pasting several lines runs them one at a time in order, like the Script pad, and shows each line's result. Secure prompts still work mid-paste.
12. **Directory search.** A find box above the tree that matches name or sign-in name and reveals the object in the tree.
13. **Phone layout.** Remove the duplicate tab row. The header must not be cut off. No panel or button may extend past the viewport at 340 to 460 px wide.
14. **Tabs are tabs.** The workspace tabs use tab roles at every width, and Left and Right arrows move between them.
15. **Keyboard.** Add a "Skip to work area" link. The header must not be one large focus stop.
16. **Favicon.** Add one so the page has no 404.

Files: `src/ui/terminal/**`, `src/ui/directory/**`, `src/ui/layout/**`, `src/ui/theme.css`, `public/` or `index.html` for the favicon, tests and e2e specs.

## Contract (copy into HANDOFF_STATE.md)

- No learner-facing string contains a task ID.
- Starter buttons fill the input only. They never run a command.
- Multi-line paste uses the same runner as the Script pad. No second parser path.
- "What this means" lines are generated from output values, not hard-coded per case.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm run build` -> expect: exit 0
- `npm run e2e` -> expect: 0 failed
- `npm audit` -> expect: 0 high or critical

## Required tests

- No learner-facing string contains "T0" followed by a digit.
- Every case's stated SLA matches its countdown rule.
- Pasting two commands runs both, in order.
- e2e at 390 px: no element's right edge exceeds the viewport; one tab row; header fully visible.
- e2e: arrow keys move between workspace tabs; the skip link reaches the work area.
- Directory search finds `pnair` and reveals it in the tree.

## Audit focus

P1 audit (Claude): wording is accurate and plain; the SLA rule is the same for every case; refresh restore never restores a stale or read-only state.

P2 audit (Codex): paste cannot run a half-parsed line; starter buttons never execute; layout has no overflow at narrow widths; roles and keyboard behavior match.

## Done when

All checks pass, both audits are closed, BACKLOG revision items fixed here are marked closed, and a first-time learner can finish case 01 on a phone without typing anything they were not shown.
