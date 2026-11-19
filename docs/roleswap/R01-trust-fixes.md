# R01 — Trust fixes: tab lock, verification, AD accuracy

- **Slug:** `r01-trust-fixes` (branch `task/r01-trust-fixes`)
- **Depends on:** T10 merged (main at `f7dde4a` or later)
- **Goal:** the app never traps a learner, never claims something that did not happen, and never teaches PowerShell or AD behavior that is wrong.
- **Source:** tester reports from 2026-11-19 (two AI testers plus Claude's own run). Each item below names the report symptom.
- **Out of scope:** beginner help, SLA wording, layout. Those are R02.

Run `npm audit` first. Any new high or critical advisory is a stop-and-ask.

## Split

**P1 — Codex builds, Claude audits: AD and PowerShell accuracy**

Check each fix against the Microsoft Learn pages linked in `docs/SPEC.md`.

1. **Requested properties must show.** `Get-ADUser -Identity mali -Properties LockedOut` must display `LockedOut` in its default output, like real PowerShell. Same for any property passed in `-Properties`. (Tester: "Requested properties can disappear from view.")
2. **`MemberOf` must be filled.** `Get-ADUser -Identity pnair -Properties MemberOf` returns the DNs of the user's direct group memberships, not including the primary group. `memberOf` (lower case) works the same. (Tester: "MemberOf was blank despite existing memberships.")
3. **Generated `Move-ADObject` uses a DN or GUID.** `toConsoleEquivalent` must never emit `Move-ADObject -Identity <sAMAccountName>`. Real `Move-ADObject` does not resolve a sAMAccountName. Also make the console reject `Move-ADObject -Identity <sAMAccountName>` with an error that says to use a DN or GUID. Check other generated commands for the same mistake.
4. **Primary group wording.** Replace "Domain Users · set by primaryGroupID, not a membership" with wording that says it *is* a membership, stored in `primaryGroupID` and not listed in `memberOf`.
5. **OU move event.** Where the app says "No Windows event for this change" after a move, say instead that real AD can record event 5139 when directory service change auditing is configured, and that this simulator does not model it. Do not invent a 5139 record unless you also model the audit policy.

Files: `src/ps/cmdlets/ad/**`, `src/ps/format.ts`, `src/ui/equivalent/**`, `src/ui/properties/**`, `src/ui/editors/**` (text only), tests for each.

**P2 — Claude builds, Codex audits: tab lock and verification**

6. **Refresh must never lock the app.** After a normal page refresh, the tab must become the writer again. Today it can stay "Read only" forever and block cases 02–05. Release the writer lock on `pagehide`. On load, if the lock is held but no live tab answers a heartbeat within a short time, take it over. Add a visible **Take over in this tab** button on the read-only notice. Taking over reloads the newest save first.
7. **Read only means read only.** A read-only tab must not dispatch any action, run sign-in tests, close a case, or change campaign state. Disable those controls with the reason shown in text. Today a read-only tab could solve and close case 01.
8. **The banner must not cover controls.** The read-only notice and toasts must not overlap buttons. Reserve space for them, or place them where nothing interactive sits.
9. **One verification rule for every case.** If a case's ticket asks the learner to prove the fix (a fresh sign-in, a share read, a share write), that proof is a checklist item. It is met only by a test the learner ran after the last change, in this attempt. Today cases 02 and 04 reach "7 of 7 done" with no test.
10. **The debrief only states what happened.** It may say a sign-in or access test was run only if one is in the attempt history. Remove the "Next time, also run a simulated fresh sign-in" note on a passed case. If a check is optional, mark it optional on the checklist before closing.
11. **The Directory sign-in test stays in Directory.** Running the checklist's sign-in or access test while on the Directory tab must not switch to PowerShell. Show the result next to the checklist item.

Files: `src/persist/**`, `src/ui/layout/**`, `src/ui/toast/**`, `src/ui/criteria/**`, `src/ui/debrief/**`, `src/tickets/predicates.ts`, `src/tickets/cases/case0[1-5].ts`, tests and e2e specs for each.

## Contract (copy into HANDOFF_STATE.md)

- Verification predicates read attempt history: a test counts only if it ran after the most recent committed change to the account or resource it checks.
- Debrief text is built from attempt history. No sentence may describe an action that is not in it.
- Read-only tabs dispatch nothing. The store refuses actions while read-only, not just the UI.
- Writer lock: released on `pagehide`; a stale lock is taken over after a heartbeat timeout; manual takeover always available.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm run build` -> expect: exit 0
- `npm run e2e` -> expect: 0 failed
- `npm audit` -> expect: 0 high or critical

## Required tests

P1:
- `-Properties LockedOut` and `-Properties MemberOf` show those values with no `Select-Object`.
- `MemberOf` lists direct groups and excludes the primary group.
- Every generated console equivalent for a move uses a DN or GUID, and running it reproduces the same diff.
- `Move-ADObject -Identity pnair` is rejected with a helpful error.

P2 (e2e, real browser):
- Refresh mid-case: the tab stays the writer, and the next case opens.
- Refresh after a crash-like close (no `pagehide`): the tab takes over after the heartbeat timeout.
- Two real tabs: the second is read-only, cannot close a case, and **Take over in this tab** works.
- Banner does not cover **Start in Directory** or **Next ticket** (element-from-point check).
- Cases 02 and 04 cannot close until the learner runs the required tests after the last change. A test run before the change does not count.
- Debrief never mentions a sign-in or access test that was not run.
- From the Directory tab, the sign-in test runs without switching tabs.

## Audit focus

P1 audit (Claude): output matches real cmdlets on Microsoft Learn; no generated command uses a sAMAccountName where the real cmdlet does not accept one; wording changes are accurate.

P2 audit (Codex): no path lets a read-only tab mutate state; the lock cannot deadlock or let two writers run; verification cannot be satisfied by a stale test; the debrief cannot claim an action that did not happen.

## Done when

All checks pass, both audits are closed, and Omar can refresh mid-case, keep going to case 02, and not close cases 02 or 04 without testing.
