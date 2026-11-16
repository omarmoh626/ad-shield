# T07 — Directory explorer, editors, inspectors, GUI parity

- **Slug:** `t07-directory-gui`
- **Depends on:** T01 through T06 merged
- **Goal:** the GUI route. A learner can do every Tier 1 action from the directory view, and the result is the same state, events, and timeline as the console.
- **SPEC sections:** Workspace and grading (paragraph 1: directory, properties, memberships, inspectors, audit log, ADUC view, context menus); State, mistakes, and persistence (paragraph 2, stale saves); Identity behavior › Access and policy inspectors (access part); A complete first ticket (GUI route); Acceptance items 2 and 5 (parity, windowed rendering).
- **Out of scope:** policy inspector, recovery view, Entra view, directory ACL editor (BACKLOG).

## Split

**P1 — Codex builds, Claude audits: read views**

- Directory tree: collapsible, windowed rendering, arrow-key navigation. Nodes for user, computer, security group, service account, OU, and default containers, each with a text label for its type and status.
- Object properties: General, Account, and Member Of tabs, read-only in this phase.
- Audit log viewer: filter by origin, host, event ID, actor, target, and text. Paged or windowed. Windows, Entra, and simulator entries look different and are labeled in text.
- Timeline of the current attempt showing console and GUI actions together.
- Selection state shared with the narrow-screen tabs from T06.
- Files: `src/ui/directory/**`, `src/ui/properties/**`, `src/ui/log/**`, `src/ui/timeline/**`, `tests/ui/directory/**`, `tests/ui/properties/**`, `tests/ui/log/**`.

**P2 — Claude builds, Codex audits: editors, inspector, parity**

- Editors in the AD Users and Computers view: unlock account, enable and disable, change at next logon, reset password (masked, labeled simulated), move, new user, add and remove group membership.
- Share permissions editor (DECISIONS D4).
- Context menus with a keyboard and a button alternative for each.
- Apply sends an Action with `source: 'gui'` and the `baseRevision` the form opened against. A stale save shows the conflict, shows what changed, and keeps the draft for review.
- After each GUI apply, show the executable console equivalent, built from the registry.
- Access inspector: pick a principal, a resource, and a right. Show the membership path, the entries in evaluation order, the per-layer result, and the final result. State which ACLs the exercise models.
- Before and after diff view for the current attempt.
- Files: `src/ui/editors/**`, `src/ui/menus/**`, `src/ui/inspectors/access/**`, `src/ui/diff/**`, `src/ui/equivalent/**`, `tests/ui/editors/**`, `tests/ui/inspectors/**`, `tests/parity/**`.

## Contract (copy into HANDOFF_STATE.md)

- Selection: `selectedObject: Guid | null` in the store, set by the tree, read by properties and editors.
- Editors never call handlers. They build an Action and call the store's `dispatchGui(action, baseRevision)`.
- `toConsoleEquivalent(action): string` returns a command that parses and, when run on the same state, produces the same diff.
- Windowed lists render only visible rows plus a small buffer.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/ui tests/parity` -> expect: 0 failed
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm run build` -> expect: exit 0

## Required tests

P1:
- A user created from the console appears at once in the right container in the tree.
- Tree keyboard navigation: expand, collapse, select.
- A tree of 2,000 nodes mounts fewer row elements than nodes.
- Log filter by event ID and by target. Origins are labeled in text.
- Member Of shows direct groups and labels the primary group separately.

P2:
- Case 01 GUI route by clicking: Directory → Pharmacy → Maya Ali → Properties → Account → Unlock account → Apply closes the ticket and shows the console equivalent and event 4767.
- Parity, console to GUI and GUI to console: for each Tier 1 action type, the same action from each source gives the same diff and the same events except `source`.
- `toConsoleEquivalent` output parses and reproduces the diff for each Tier 1 action type.
- Stale editor: open properties, change the account from the terminal, press Apply. The conflict shows and the draft is still there.
- An edit to a different object does not make the open form stale.
- Duplicate display names: the editor targets the selected object, not the namesake.
- Each context-menu action is reachable by keyboard and by a visible button.
- Access inspector for a user, the Finance share, and read shows the role path and both layers.
- The password dialog stores nothing after Apply.

## Audit focus

P1 audit (Claude):
- Windowing is real. No full render of large lists.
- No writes from read views.
- Type and status have text labels.

P2 audit (Codex):
- No editor bypasses `dispatchGui`.
- Stale detection is per object (DECISIONS D9).
- Console equivalents are generated, not hand-written per editor.
- Authorization errors from the pipeline are shown, not swallowed.

## Done when

All checks pass, both audits are closed, and Omar can close case 01 by hand using only the GUI.
