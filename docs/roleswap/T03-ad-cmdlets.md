# T03 — Active Directory cmdlets

- **Slug:** `t03-ad-cmdlets`
- **Depends on:** T01, T02 merged
- **Goal:** the `ActiveDirectory` module subset that Tier 1 needs, read side then write side.
- **SPEC sections:** PowerShell contract (rows Directory administration, Execution; closing paragraph); A complete first ticket (the four-line script); Identity behavior › Containers, accounts, and groups.
- **Out of scope:** `Get-ADObject -IncludeDeletedObjects`, `Restore-ADObject`, `Get-ADServiceAccount`, `Get-ADUserResultantPasswordPolicy`, `Get-ADReplicationAttributeMetadata`, GPO cmdlets, directory `Get-Acl` and `Set-Acl`. All are in BACKLOG.

Check parameter names, parameter direction, and default output against the Microsoft Learn links at the end of SPEC before coding each cmdlet.

## Split

**P1 — Codex builds, Claude audits: read side**

- Identity resolution for `-Identity`: sAMAccountName, DN, GUID, SID.
- `Get-ADUser`, `Get-ADGroup`, `Get-ADGroupMember` (with `-Recursive`), `Get-ADObject` (basic), `Get-ADPrincipalGroupMembership`, `Search-ADAccount` (`-AccountInactive` with `-TimeSpan` or `-DateTime`, `-LockedOut`, `-AccountDisabled`, `-UsersOnly`).
- `-Properties` (including `*`), `-SearchBase`, `-SearchScope`, `-Filter` on the commands that support them.
- Filter engine for the quoted form and the script-block form: comparisons, wildcards, `-and`, `-or`, `-not`, and `*`.
- Default property set per object type, plus extended properties on request. `LockedOut` appears only when requested.
- Help with examples for each cmdlet.
- Files: `src/ps/cmdlets/ad/identity.ts`, `src/ps/cmdlets/ad/filter.ts`, `src/ps/cmdlets/ad/get/**`, `tests/ps/ad/get/**`, `docs/SUPPORT.md`.

**P2 — Claude builds, Codex audits: write side**

- `New-ADUser`, `Set-ADUser` (including `-ChangePasswordAtLogon`), `Move-ADObject`, `Enable-ADAccount`, `Disable-ADAccount`, `Unlock-ADAccount`, `Set-ADAccountPassword`, `Add-ADGroupMember`, `Remove-ADGroupMember`, `Add-ADPrincipalGroupMembership`.
- Pipeline input, for example `Get-ADUser ... | Unlock-ADAccount`. `-PassThru` where the real cmdlet has it.
- `-WhatIf` message and `-Confirm` behavior. `Remove-ADGroupMember` asks for confirmation unless `-Confirm:$false`.
- `Set-Location` and `Get-Location` with an `AD:` drive. The prompt starts at `PS C:\Lab>`.
- `New-ADUser` container resolution: `-Path` if given, else the current `AD:` location when inside the drive, else `CN=Users`.
- Secure password input through `Read-Host -AsSecureString`.
- Files: `src/ps/cmdlets/ad/set/**`, `src/ps/cmdlets/management/**`, `tests/ps/ad/set/**`, `tests/ps/ad/first-ticket.test.ts`, `docs/SUPPORT.md`.

## Contract (copy into HANDOFF_STATE.md)

- `resolveIdentity(state, value, classes): Guid | IdentityError` from P1. P2 reuses it and does not write a second resolver.
- AD objects in the pipeline carry `typeName` and `ref: Guid`.
- Write cmdlets build Actions and call `rt.dispatch`. They never edit state.
- Parameter direction: `Add-ADGroupMember -Identity <group> -Members <principals>`; `Add-ADPrincipalGroupMembership -Identity <principal> -MemberOf <groups>`.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/ps/ad` -> expect: 0 failed
- `npm test` -> expect: 0 failed (includes the registry help-example test from T02)
- `npm run guard` -> expect: exit 0

## Required tests

P1:
- `Get-ADUser -Identity mali` shows the default set without `LockedOut`. With `-Properties LockedOut` it appears.
- Identity by sAMAccountName, DN (with an escaped comma), GUID, SID. A display name is rejected with a helpful error.
- Quoted filter and script-block filter return the same objects.
- `-SearchBase` with each `-SearchScope` value.
- Two users with the same display name in different OUs both return from a name filter.
- `Search-ADAccount -AccountInactive -TimeSpan 90.00:00:00 -UsersOnly` (the documented time span form) on fixture data with an exactly-90-day user. Record the boundary rule in SUPPORT.md.
- `Get-ADGroupMember -Recursive` through nested groups.
- `$u = Get-ADUser -Identity mali -Properties LockedOut` then `$u | Get-Member` shows an AD user type.

P2:
- The four-line script from "A complete first ticket" runs. Outputs match the expected comments. `Unlock-ADAccount` prints nothing. Event 4767 is appended.
- The `-WhatIf` line leaves the state reference unchanged and appends no event.
- Splatted `New-ADUser` resolves the same container as the named-parameter form.
- `New-ADUser` with no `-Path`: `CN=Users` from `C:\Lab`; the current path from inside the `AD:` drive.
- `New-ADUser` with a policy-failing password: the object exists, is disabled, and an error explains the partial result.
- `New-ADUser` with no password and `-Enabled $true`: behavior matches the Microsoft Learn page. Record the rule in SUPPORT.md.
- `Remove-ADGroupMember` without `-Confirm:$false` asks. With it, it removes.
- `Get-ADUser -Filter ... | Disable-ADAccount` with one bad record: earlier results commit and the error names the identity.
- A password typed through the secure prompt appears nowhere in transcript, history, state, or events.
- Each write cmdlet appends the events listed in CONTRACTS section 6 and DECISIONS D3.

## Audit focus

P1 audit (Claude):
- Parameter names and default properties match Microsoft Learn.
- The filter engine parses and never evaluates text as code.
- Case-insensitive identity matching.
- No second identity resolver or DN parser. P1 reuses `src/domain/dn.ts`.

P2 audit (Codex):
- Every mutation goes through `rt.dispatch`.
- `-WhatIf` purity on every supporting cmdlet.
- Parameter direction on the two group-membership cmdlets.
- Partial failure reporting in pipelines.
- Password redaction.
- Help examples execute against the base fixture.

## Done when

All checks pass, both audits are closed, and SUPPORT.md lists every cmdlet with its supported parameters.
