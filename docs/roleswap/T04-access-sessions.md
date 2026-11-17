# T04 — Access evaluation, sessions, and evidence

- **Slug:** `t04-access-sessions`
- **Depends on:** T01, T02, T03 merged
- **Goal:** answer "can this principal do this to this resource, and why", keep a fresh sign-in apart from an already-issued session, and expose both through the console.
- **SPEC sections:** Identity behavior › Sign-in and access; › Access and policy inspectors (access part only); › Sessions, evidence, and time (domain sign-in part only); › Audit sources; PowerShell contract (rows Cloud and simulated actions, Policy/recovery/evidence for `Get-WinEvent` only).
- **Out of scope:** GPO and password-policy inspectors, Kerberos ticket and Entra token modeling, Graph cmdlets, directory object ACLs, `Add-SimCaseEvidence`. All are in BACKLOG.

## Split

**P1 — Codex builds, Claude audits: evaluation and trace**

- `src/access/types.ts`: Resource with a share layer and a file layer, Ace, Right, SecurityContext, AccessTrace.
- `token.ts`: build a security context from current state. User SID, primary group, and transitive security-group memberships that respect group scope. Distribution groups are excluded.
- `evaluate.ts`: per-layer evaluation in the entry order the ACE-ordering link in SPEC describes, then combine layers. Both must allow.
- `trace.ts`: membership path or paths, entries considered in order, per-layer result, final result, and whether access came through a role group, a direct user entry, or both.
- Files: `src/access/types.ts`, `src/access/token.ts`, `src/access/evaluate.ts`, `src/access/trace.ts`, `tests/access/token.test.ts`, `tests/access/evaluate.test.ts`, `tests/access/trace.test.ts`.

**P2 — Claude builds, Codex audits: sessions, permissions actions, console surface**

- `sessions.ts` plus `session.signIn` and `session.end` handlers. A sign-in checks enabled, locked, and credential state, snapshots a security context, and records 4624 or 4625 on the recording host. Failed attempts count toward lockout and record 4740 on the domain controller at the threshold.
- Sign-in must honor the `changePasswordAtLogon` attribute set by `Set-ADUser -ChangePasswordAtLogon` and `New-ADUser` (T03 D9). Consider mapping it to `pwdLastSet = 0` in the engine.
- `acl.addEntry` and `acl.removeEntry` handlers (DECISIONS D4).
- Shares for Pharmacy and Finance in the base fixture, each with resource groups wired for read and modify, following account → global role group → domain local resource group → permission.
- `ADShield.Sim` cmdlets: `Test-SimSignIn`, `Test-SimResourceAccess` (fresh sign-in by default, or a named existing session), `Step-SimClock`, `Add-SimResourcePermission`, `Remove-SimResourcePermission`.
- `Get-WinEvent` with `-FilterHashtable` (log name, ID, time range), `-ComputerName`, `-MaxEvents`.
- Files: `src/access/sessions.ts`, `src/engine/actions.ts`, `src/engine/handlers/session.ts`, `src/engine/handlers/acl.ts`, `src/fixtures/baseDomain.ts`, `src/ps/cmdlets/sim/**`, `src/ps/cmdlets/diagnostics/**`, `tests/access/sessions.test.ts`, `tests/engine/acl.test.ts`, `tests/ps/sim/**`, `tests/ps/diagnostics/**`, `docs/SUPPORT.md`.

## Contract (copy into HANDOFF_STATE.md)

- `buildContext(state, user): SecurityContext` and `evaluateAccess(state, ctx, resourceId, right): AccessTrace` from P1. Pure.
- AccessTrace carries `allowed`, `layers[]`, `paths[]`, and `via: 'role' | 'direct' | 'both' | 'none'`.
- A session stores its SecurityContext snapshot. Evaluation for an existing session uses the snapshot, never current memberships.
- Sim cmdlet output includes the word "simulated".

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/access` -> expect: 0 failed
- `npm test` -> expect: 0 failed
- `npm run guard` -> expect: exit 0

## Required tests

P1:
- Role path: user in a global role group nested in a domain local resource group gets read and is denied write.
- A deny entry beats an allow entry in the documented order.
- Share layer allows and file layer denies gives denied, and the reverse.
- A distribution group grants nothing.
- Primary group membership counts.
- `via` is `direct` for a user entry, `role` for a group path, `both` when both exist.
- A user with no path gets `none` and the trace says why.

P2:
- Add a user to a role group. The existing session is still denied. A fresh sign-in is allowed.
- Remove a user from a role group. The existing session still reads. A fresh sign-in is denied.
- Disabled account: fresh sign-in denied, 4625 on the recording host, no new session.
- Locked account: sign-in denied until unlocked.
- Five failed sign-ins lock the account and record 4740 on the domain controller.
- A password reset does not end existing sessions.
- `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740}` returns the seeded lockout with host, time, and target.
- `Test-SimResourceAccess -WhatIf` is not offered. The cmdlet is read-only and awards nothing.
- `Step-SimClock` advances `state.now` and appends a simulator event.

## Audit focus

P1 audit (Claude):
- Entry order matches the ACE-ordering reference.
- Group scope rules are respected when expanding memberships.
- Purity. No reads of sessions inside `evaluate`.

P2 audit (Codex):
- Session snapshot is never refreshed silently.
- Recording host is right for each event (workstation or server for 4624 and 4625, domain controller for 4740).
- Simulator events are visibly separate from Windows events (`origin`).
- The acl handlers check authorization.
- Fixture changes keep T01 through T03 tests green.

## Done when

All checks pass, both audits are closed, and the console can show why a user can or cannot read a share.
