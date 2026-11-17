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
