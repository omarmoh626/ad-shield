# Backlog: Tier 2 and Tier 3

Not part of the first slice. Each line is one future swap task. Write a full brief in the T01 to T10 format before running it, and name the split so Codex gets the smaller, well-specified half.

## Tier 2 — Access review, containment, and recovery

| Task | Engine work | Case |
| --- | --- | --- |
| T11 | Kerberos ticket, Entra token, and app session records with issuer, timestamps, and expiry; Graph module with `Revoke-MgUserSignInSession`; Entra sign-in records; Entra view | 06 phishing containment |
| T12 | Nothing new beyond direct-grant cleanup; uses the access trace | 07 direct access and AGDLP |
| T13 | Service dependency model, simulated service restart, outage and repair flow, posture checks for availability; `lastLogonTimestamp` staleness with HR and sign-in corroboration | 08 inactive account review |
| T14 | GPO objects, links, link order, enforced links, inheritance blocking, filtering, user side versus computer side; `Get-GPInheritance`, `Set-GPLink`; policy inspector | 09 conflicting GPOs |
| T15 | Fine-grained password policies, precedence, direct versus group-assigned; `Get-ADUserResultantPasswordPolicy` | 10 wrong password policy |
| T16 | Recycle Bin, deleted-object lifetime; `Get-ADObject -IncludeDeletedObjects`, `Restore-ADObject`; recovery view | 11 wrong object deleted |

## Tier 3 — Identity incident response

| Task | Engine work | Case |
| --- | --- | --- |
| T17 | Evidence attachment (`Add-SimCaseEvidence`), actor attribution from security events, `Get-ADReplicationAttributeMetadata` | 12 unfamiliar Domain Admin |
| T18 | SPNs, gMSA with eligible hosts, service binding transfer, ordered-event grading; `Get-ADServiceAccount` | 13 legacy service account |
| T19 | Directory object ACLs, inheritance scope, effective delegation; `Get-Acl` and `Set-Acl` on the `AD:` drive | 14 executive OU control |
| T20 | Windows LAPS policy and backup metadata, device policy cycle, reader boundary, no password display | 15 overdue LAPS backup |
| T21 | Hybrid connector, sync rules, delta sync on the lab clock, cloud identity matching | 16 stale cloud department |
| T22 | Full acceptance for all 16 cases, Identity Security Engineer rank, final report | none |

## Carried over from the first slice

Add items here as tasks T01 to T10 defer them: nits from audits, bugs too large for T10, and syntax recorded as unimplemented in `docs/SUPPORT.md`.

- **T03 D9, `-ChangePasswordAtLogon`.** Sign-in must honor the `changePasswordAtLogon` attribute that T03 stores instead of `pwdLastSet = 0`. Consider mapping it to `pwdLastSet = 0` in the engine. Scheduled for T04 P2.
- **Tests in a read-only sandbox (from T04 P2 audit).** Make `npm test` runnable when `node_modules` is read-only, for example with Vite's runner config loader (`--configLoader runner`) so Vitest does not write `node_modules/.vite-temp`. Codex can then run the test checks during reviews.
- **npm audit recheck (T06 D10).** At the start of every task, run `npm audit`. The 6 high warnings come from one advisory, picomatch GHSA-fc5q-39xc-vjpf (ReDoS, no patched release as of 2026-11-17), pulled in by vite, vitest, tinyglobby, fdir, and @vitejs/plugin-react. Upgrade as soon as a patched picomatch or a vite/vitest release without it ships, without downgrading a major version. Then remove the `--host` warning from `docs/SUPPORT.md`.

## Revision phase (after T10)

Omar added these on 2026-11-17, during T07. Do them after T10, before Tier 2.

- **Beginner help.** A "New to PowerShell?" guided mode on the first case; starter command buttons in the empty console; **Try it** buttons on `Get-Help` examples; a one-line plain explanation under every command's output.
- **PowerShell glossary.** A reference page of every supported cmdlet with its purpose in plain words, common parameters, and a runnable example.
- **Bug: multi-line paste.** Pasting several lines into the console joins them into one command. Run each line in order, or offer the Script pad.
- **Bug: Progress panel.** The Progress panel pushes the page down. Make it a popover under the button that closes on Esc or an outside click.
- **Bug: checklist detail text.** The detail text shows internals ("sequence 14"). Use plain words.
- **Ticket chip.** The chip shows `case01`. Use ticket numbers such as `INC-01`.
- **Testing.** Omar plays every case by hand. Three AI testers run every case and report bugs and confusing spots.
