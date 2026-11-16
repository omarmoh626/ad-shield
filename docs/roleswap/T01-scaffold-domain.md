# T01 — Scaffold, domain graph, action pipeline

- **Slug:** `t01-scaffold-domain` (branch `task/t01-scaffold-domain`)
- **Depends on:** nothing
- **Goal:** a buildable empty app, a pure domain graph, the one action pipeline every later task uses, and the base domain fixture.
- **SPEC sections:** Build objective; State, mistakes, and persistence (paragraphs 1 and 2); Identity behavior › Containers, accounts, and groups; Identity behavior › Audit sources.
- **Out of scope:** any PowerShell, any UI beyond a placeholder page, sessions, tickets, persistence.

## Split

**P1 — Codex builds, Claude audits: scaffold and domain graph**

- Vite, React, TypeScript strict scaffold with the commands in CONTRACTS section 1 (`dev`, `build`, `typecheck`, `test`, `guard`).
- Placeholder page that shows the app name and a line saying all identities and actions are simulated.
- `src/domain/`: types, deterministic GUID and SID allocation from `state.ids`, DN derivation and parsing with escaping, graph operations (create, get, move, rename), the indexes in CONTRACTS section 4, lab clock, seeded generator.
- Files: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `scripts/guard.*`, `src/main.tsx`, `src/App.tsx`, `src/domain/**`, `tests/domain/**`.

**P2 — Claude builds, Codex audits: pipeline and base fixture**

- `src/engine/`: Action union for the Tier 1 action types, `dispatch`, authorization check, diff, audit event builders, handlers for `user.*`, `object.move`, `group.*`, `clock.advance`.
- Group rules: valid scope nesting for global, universal, and domain local groups; security versus distribution type; primary group kept apart from memberships.
- `user.create` rules: default container when no path is given, starts disabled unless enabled with a valid credential, partial result when the password fails policy.
- `src/fixtures/baseDomain.ts`: `corp.contoso.local` with a domain controller, a file server, department OUs including Pharmacy and Finance, workstation and server OUs, the default `CN=Users` and `CN=Computers` containers, users, computers, a service account, role groups (global), resource groups (domain local), an enterprise-wide staff group, and the operator account from DECISIONS D5. Give every fixture object a stable fixture ID.
- Files: `src/engine/**`, `src/fixtures/**`, `tests/engine/**`, `tests/fixtures/**`.

## Contract (copy into HANDOFF_STATE.md)

- DomainState, DirObject: shapes in CONTRACTS section 4. DN derived from `parent`, never stored.
- IDs: allocated from `state.ids` only. Same seed and actions give the same IDs.
- Graph ops return a new state and keep all indexes consistent. Move and rename keep guid, sid, memberships.
- `dispatch(state, action, ctx)`: signature and rules in CONTRACTS section 5. Pure. whatIf returns the input state reference and no events.
- AuditEvent: shape in CONTRACTS section 6.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0, no matches
- `npm run build` -> expect: exit 0, `dist/index.html` exists

## Required tests

P1:
- DN round trip for `CN=Ali\, Maya,OU=Pharmacy,DC=corp,DC=contoso,DC=local` (escaped comma).
- Lookup by sAMAccountName and by DN is case-insensitive.
- Move keeps guid, sid, and memberships and changes the derived DN. Rename does the same.
- Children index updates on create and move.
- Same seed gives the same generator sequence and the same new IDs.
- Guard script fails on a planted `eval(` in a temp file under `src/` and passes when it is removed.

P2:
- whatIf: returned state is the same reference, no events, diff is populated.
- Each handler appends the right event ID with host, actor, target, and lab time. Group additions use 4728, 4732, or 4756 by group scope.
- Nesting matrix: every allowed and disallowed member type per group scope.
- Adding a member to a distribution group works but the group is flagged as not permission-bearing.
- `user.create` with no path lands in `CN=Users,DC=corp,DC=contoso,DC=local`.
- `user.create` with a policy-failing password leaves one disabled account and a `passwordRejected` warning.
- Unauthorized action returns `denied` and commits nothing.
- GUI action with an old `baseRevision` on a changed object returns `stale`. The same action on an untouched object succeeds.
- Fixture loads, every index is consistent, and fixture IDs are stable across two builds.

## Audit focus

P1 audit (Claude reads `git diff <base>`):
- No real clock or `Math.random` in `src/domain`.
- DN escaping and parsing handle the escaped comma and a backslash.
- Index drift after move, rename, and create.
- `strict` is on and there is no `any` in exported types.
- No runtime dependency beyond `react` and `react-dom`.

P2 audit (Codex):
- Atomicity: a failed action leaves state untouched.
- whatIf purity.
- Event ID per group scope, and recording host on every Windows event.
- Authorization cannot be skipped by `source: 'system'` from learner-reachable code.
- Primary group never appears in `memberships`.
- Event IDs from DECISIONS D3 were checked against the Appendix L link in SPEC.

## Done when

All four checks pass, both audits are closed, and `npm run dev` shows the placeholder page.
