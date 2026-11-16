# Decisions made while splitting the spec

Omar: these are defaults I picked where the spec left a choice open. Edit any line before running T01. After T01 starts, a change goes through a `D#` entry in `HANDOFF_STATE.md`.

| ID | Question | Default | Why |
| --- | --- | --- | --- |
| D1 | Build tool and state library | Vite with a hand-rolled store on `useSyncExternalStore`. No state library. | The spec asks for React and TypeScript with a static build. Fewer dependencies keeps audits small. |
| D2 | What "GUI route" means in tests | Unit tests replay each GUI step as its action with `source: 'gui'`. Playwright clicks the real path in T10. | Console and GUI share handlers, so the action-level test proves parity early and cheaply. |
| D3 | Windows events beyond the spec's list | Add 4722 (account enabled), 4725 (account disabled), 4724 (password reset attempt), 4738 (account changed), and 4729, 4733, 4757 (member removed from global, local, universal group). | Cases 01, 04, and 05 disable accounts, reset passwords, and remove members. The timeline needs events for those. Verify each ID against Appendix L (linked in SPEC) in T01 P2. |
| D4 | Direct permission grants in Tier 1 | Add `acl.addEntry` and `acl.removeEntry` actions, a share permissions editor, and `Add-SimResourcePermission` / `Remove-SimResourcePermission`. | Case 02 must be able to fail on a direct user grant, so the learner needs a way to make one. Real `Get-Acl` and `Set-Acl` arrive with Tier 3. |
| D5 | The analyst's own rights | One operator account with delegated rights over the department OUs and their groups. No rights over Domain Admins or the executive OU. | The pipeline must check authorization, and Tier 3 needs a boundary to cross. |
| D6 | Password and lockout policy values | Minimum length 12, complexity on, lockout after 5 failed attempts. Lab values only. | Needed for the `New-ADUser` partial failure and for case 01. |
| D7 | Lab clock control | `Step-SimClock -Minutes <n>` plus the visible Advance lab time control. | "Step" is an approved PowerShell verb. "Advance" is not. |
| D8 | Persistence format | Save the seed plus the committed action log and replay on load. | The spec asks to rebuild large fixtures from seeds. Replay also gives the attempt history for free. |
| D9 | Stale GUI save detection | Per-object revision. A save conflicts only when an object it touches changed. | A global revision would reject saves after unrelated edits. |
| D10 | Extra read cmdlets | Add `Search-ADAccount -LockedOut` and `Get-ADPrincipalGroupMembership`. | Both are natural discovery routes for cases 01 and 04. Low cost. |
| D11 | Perf test machine | MacBook Air M4, Chromium through Playwright. | The spec asks for a stated browser and machine. |
| D12 | End of the slice | After case 05 the app says Tier 2 and Tier 3 are not built yet. Rank stops at IAM Analyst. | The spec says a ticket counts as shipped only when everything works. Eleven cases will be reported as not shipped. |

## Spec points worth a second look

These are not blockers. Decide them when their task comes up.

- **Case 04 and the old session.** The spec wants a fresh session denied on the Pharmacy share. An already-issued session keeps its old access until it ends. The criteria panel should show both, so the learner sees why the former manager still saw access.
- **Case 05 audit history.** "Retain audit history" is graded as: the account object still exists and no earlier event for it is gone. Reset must not count as losing history.
- **Remove-ADGroupMember confirmation.** The real cmdlet prompts unless `-Confirm:$false` is passed. Level 3 scripts must include it or explain the prompt.
- **Help examples must execute.** This holds for every cmdlet in every task. An example that needs a missing fixture object fails the registry test.
