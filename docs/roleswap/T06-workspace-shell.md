# T06 — Workspace shell, terminal, ticket panels

- **Slug:** `t06-workspace-shell`
- **Depends on:** T01 through T05 merged
- **Goal:** a learner can open the app, read case 01, use the terminal, open hints, watch criteria, and close the case. No directory GUI yet.
- **SPEC sections:** The analyst's shift (all); A complete first ticket (hint levels and transfer question); Workspace and grading (paragraph 1, except the directory, editors, and inspectors); PowerShell contract › Execution (`Read-Host` masked input).
- **Out of scope:** directory tree, object editors, access inspector, audit log viewer (T07). The PowerShell/GUI toggle exists here but the GUI side shows a "built in T07" placeholder.

## Split

**P1 — Codex builds, Claude audits: shell and terminal**

- `src/ui/store.ts`: binds campaign and domain state to React through `useSyncExternalStore`. All writes go through `dispatch` or the ticket engine.
- Layout: dark, responsive, four regions. Left: inbox, messages, hints. Upper right: placeholder for T07 panels. Lower right: terminal and script pad. Top bar. On narrow screens, labeled tabs that keep the active object, terminal draft, and ticket.
- Top bar: rank, posture with a list of failed checks, active incidents, PowerShell/GUI toggle, save status, pausable simulated SLA clock, visible Advance lab time control.
- Terminal: prompt `PS C:\Lab>`, history navigation, tab completion and suggestions from the registry, syntax highlighting from the tokenizer, readable errors, masked ephemeral input for `Read-Host -AsSecureString`, redacted transcript.
- Script pad: multiline editor, run one line, run all.
- Toast notifications with a live region.
- Theme tokens in one CSS file. Status always has text, not color alone.
- Files: `src/main.tsx`, `src/App.tsx`, `src/ui/store.ts`, `src/ui/layout/**`, `src/ui/topbar/**`, `src/ui/terminal/**`, `src/ui/toast/**`, `src/ui/theme.css`, `tests/ui/layout/**`, `tests/ui/terminal/**`, `tests/ui/topbar/**`.

**P2 — Claude builds, Codex audits: inbox, ticket, hints, criteria, debrief**

- Inbox with the queue and read-only previews. Future cases queue as the shift progresses.
- Ticket view: sender, priority, business impact, approval or identity-verification evidence, what the requester needs, and which account and outcome the learner owns.
- Glossary: an unfamiliar term is defined in place on first use, including OU, GPO, and ACL.
- Hints: closed at the start of every ticket. Level 1 concept plus one diagnostic question. Level 2 cmdlets, parameters, and an inspection step. Level 3 annotated script stepper with the equivalent GUI steps: run one line, see the result, read a plain-language explanation of the output, advance when ready.
- Criteria panel: met, unmet, or waiting for propagation, with observed and required text.
- Close case, then debrief: the change actually made, who gained or lost access, how it was verified, a command for the cheat sheet, one transfer question with feedback, and an offer of a fresh variation.
- Communications feed. Cheat sheet that collects debrief commands.
- Reset this attempt control with a confirmation.
- Files: `src/ui/inbox/**`, `src/ui/ticket/**`, `src/ui/hints/**`, `src/ui/criteria/**`, `src/ui/debrief/**`, `src/ui/feed/**`, `src/ui/glossary/**`, `tests/ui/inbox/**`, `tests/ui/ticket/**`, `tests/ui/hints/**`, `tests/ui/criteria/**`, `tests/ui/debrief/**`.

## Contract (copy into HANDOFF_STATE.md)

- `useStore(selector)` and `actions` from `src/ui/store.ts`. Components never import handlers directly.
- Region slots: `left`, `upper`, `lower`, `top`. T07 fills `upper`.
- Terminal API: `runLine(text)`, `setDraft(text)`, `focus()`. The hint stepper uses `runLine`.
- Real timers only in `src/ui`. The SLA clock advances lab time through `clock.advance`.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/ui` -> expect: 0 failed
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm run build` -> expect: exit 0

## Required tests (component tests with Testing Library)

P1:
- Typing a command and pressing Enter shows output. Up arrow recalls it.
- Tab completes a cmdlet name, then a parameter name.
- A parse error shows a readable message and changes nothing.
- The secure prompt masks input, and the transcript shows no value.
- Narrow layout: switching tabs keeps the terminal draft and the open ticket.
- Pausing the SLA clock stops lab time. Advance lab time moves it.
- Every interactive control is reachable by keyboard, and the toast region is announced.

P2:
- The app opens on case 01 with the console ready and hints closed.
- Level 3 runs one line at a time and shows the explanation for each output.
- Criteria update after each command and show observed and required text.
- Close is disabled with unmet criteria and says which ones.
- The debrief shows the actual change from attempt history, not a canned sentence.
- The transfer question shows feedback that points to group membership and share permissions.
- Inbox previews of queued cases cannot change state.
- Reset this attempt restores case 01 and keeps the cheat sheet.
- "simulated" appears next to sign-in tests and password prompts.

## Audit focus

P1 audit (Claude):
- No state writes outside the store actions.
- No password value in React state after submit, in the transcript, or in history.
- Completion and highlighting read the registry and tokenizer, with no hard-coded cmdlet list.
- Keyboard access and status text.

P2 audit (Codex):
- Hints never auto-open and never auto-run.
- Debrief content comes from attempt history and the fixture.
- Close cannot bypass the engine's predicate check.
- Glossary covers OU, GPO, and ACL on first use.

## Done when

All checks pass, both audits are closed, and Omar can close case 01 by hand in `npm run dev` using only the terminal.
