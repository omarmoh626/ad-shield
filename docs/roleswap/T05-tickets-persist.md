# T05 — Ticket engine, persistence, case 01

- **Slug:** `t05-tickets-persist`
- **Depends on:** T01 through T04 merged
- **Goal:** the campaign engine, save and resume, and the first ticket playable from tests through both routes.
- **SPEC sections:** The analyst's shift (item 4 and the last paragraph); Ticket campaign (intro paragraph, case 01 row); A complete first ticket; State, mistakes, and persistence (paragraphs 3, 4, 5); Workspace and grading (last paragraph).
- **Out of scope:** all UI (T06, T07), cases 02 through 05 (T08, T09), the service-outage repair flow for case 08 (BACKLOG).

## Split

**P1 — Codex builds, Claude audits: campaign engine**

- `src/tickets/types.ts` (shapes in CONTRACTS section 9), `engine.ts`, `predicates.ts`, `scoring.ts`.
- Engine: queue, one active case, read-only previews, introduce a case, checkpoint before the first change, attempt history, reset this attempt, close when every predicate is met, completion counted once, replay on an isolated copy.
- Predicates rerun after every committed action. Status is met, unmet, or waiting, each with observed and required text.
- Predicate helpers: attribute equals, member of, not member of, effective access, fresh sign-in result, credential version unchanged, object unchanged since baseline, event exists, events in order.
- Scoring: rank from tier completions, posture as the percentage of applicable weighted security and availability checks passing with the failed checks listed, active incident count. The three stay separate values.
- `Get-SimTicket`, `Close-SimTicket`, `Reset-SimAttempt` cmdlets.
- Files: `src/tickets/types.ts`, `src/tickets/engine.ts`, `src/tickets/predicates.ts`, `src/tickets/scoring.ts`, `src/ps/cmdlets/sim/ticket.ts`, `tests/tickets/engine.test.ts`, `tests/tickets/predicates.test.ts`, `tests/tickets/scoring.test.ts`.

**P2 — Claude builds, Codex audits: persistence and case 01**

- `src/persist/`: schema, storage adapter, save, load with seed rebuild and action-log replay, migration hook, cross-tab revision handling, save status (CONTRACTS section 10).
- `src/tickets/cases/case01.ts`: two seeds. Seed A is the spec fixture: Maya Ali, `mali`, lockout at 06:54 from her assigned workstation, identity verified by callback, a similarly named coworker who is enabled and working. Seed B changes the account, department, workstation, and near-match.
- Case 01 request, evidence (4740 event, callback note), three hint levels, the annotated script route from SPEC, the GUI route from SPEC, wrong fix, debrief, transfer question with feedback.
- Files: `src/persist/**`, `src/tickets/cases/case01.ts`, `src/tickets/cases/index.ts`, `tests/persist/**`, `tests/tickets/case01.test.ts`.

## Contract (copy into HANDOFF_STATE.md)

- TicketDef, CaseFixture, Predicate, ScriptStep, GuiStep: shapes in CONTRACTS section 9.
- `runScriptRoute(fixture)` and `runGuiRoute(fixture)` test helpers from P1. Every later case test uses them.
- Campaign state is serializable JSON with no functions and no password values.
- Save payload: CONTRACTS section 10.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/tickets tests/persist` -> expect: 0 failed
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0

## Required tests

P1 (use a small test-only case):
- Introducing a case takes a checkpoint. Reset restores state and clock and keeps earlier completions.
- Close is refused while any predicate is unmet, and the refusal lists observed and required.
- A `-WhatIf` run changes no predicate and awards nothing.
- First completion counts once. A replay cannot award it again and cannot change campaign state.
- A second case cannot become active while one is open.
- Posture drops when a weighted check fails and names the check.
- A predicate that depends on lab time reports waiting, then met after the clock advances.

P2:
- Case 01 on both seeds: script route closes the ticket. GUI route closes the ticket.
- Wrong fix: a password reset alone leaves the ticket open, and the credential-version criterion turns unmet.
- Control: unlocking or changing the similarly named coworker does not close the ticket and fails the control criterion if the coworker changed.
- Alternate route: `Search-ADAccount -LockedOut | Unlock-ADAccount` on the right account also closes it.
- Hints, routes, and predicates name the same account on each seed (generated from one set of fixture IDs).
- The debrief names the change made, who regained access, how it was verified, and one reusable command.
- Save mid-attempt, load into a fresh engine: state, clock, predicates, and history match.
- Malformed JSON, unknown schema version, and a throwing `setItem` each give a notice and no crash.
- Two writers: the older revision goes read-only and the newer campaign survives.
- The saved payload contains no password text (search the JSON for the typed value).

## Audit focus

P1 audit (Claude):
- Predicates grade state, never command text.
- Reset cannot erase earlier completions.
- Replay isolation.
- Rank, posture, and incident count are computed separately.

P2 audit (Codex):
- Replay determinism: same seed and log give the same GUIDs and state.
- No silent overwrite across tabs.
- Failure paths in load.
- Case 01 matches the spec text: names, time, expected outputs, GUI path, transfer question.
- Level 3 hint is the script route, not a second copy.

## Done when

All checks pass, both audits are closed, and case 01 closes from tests through both routes on both seeds.
