# AD Shield | IAM Analyst & Active Directory Ticket Simulator

## Section A — High-impact upgrades

| Gap in the original brief | What changes in v2.0 |
| --- | --- |
| A beginner can move a user to Pharmacy and assume that fixes access. | A department-transfer ticket lets the learner try the move, test both shares, and see the old access still work. The access inspector traces the group and permission responsible. |
| The phishing ticket treats “clear sessions” as one operation. | The case supplies a domain account, a cloud identity, and an application session. The learner resets the compromised credential, contains each affected session on its own system, and verifies what still works. |
| Several incident tickets imply that a name, a service principal name, or an old date proves compromise. | Each case pairs a suspicious clue with a legitimate lookalike and independent evidence. Closing it requires fixing the right identity and protecting the legitimate one. |
| The hints reveal syntax but give learners little practice discovering it. | The first ticket is playable immediately. Built-in help, object inspection, dry runs, and one-step hints give beginners a route from “What do I type?” to “How do I verify it worked?” |
| Adding more cmdlets could leave the GUI, console, and verifier with three definitions of success. | A command registry defines syntax. One state engine applies edits from either interface. Executable walkthroughs and alternate solutions must pass the same outcome checks. |
| A reset or page reload could hide a bad change or lose an earlier ticket. | Each attempt has a checkpoint. Learners can diagnose and repair a failed service, compare the repair with its baseline, and resume after a refresh. Regression checks cover stale GUI edits, cross-tab saves, and repeat rewards. |

## Section B — Upgraded v2.0 master build prompt

### Build objective

Act as a senior frontend engineer, Microsoft identity administrator, and cybersecurity instructor. Build **AD Shield**, a complete, browser-based ticket simulator for a junior IAM analyst at a fictional healthcare enterprise. Use `corp.contoso.local` as its Microsoft Active Directory Domain Services (AD DS) domain. A learner with limited PowerShell experience should be able to open a ticket, inspect evidence, change the directory, and prove the outcome in their first session.

Deliver a working static web app, its source, local run instructions, and automated checks. Use the existing project stack when supplied. For a new project, use React and TypeScript with a static build and locally bundled assets. Run all identity services, clocks, logs, and commands in the browser against fictional data. The app must work without a Windows host, paid tenant, logins, or backend. Use in-memory mock credentials for exercises. Display the word *simulated* where someone might mistake an action for a real sign-in, password, or service operation.

### The analyst’s shift

1. **Read the request.** Open on a locked-out pharmacy technician’s ticket with the console ready. Show sender, priority, business impact, approval or identity-verification evidence, and what the requester needs. Define an unfamiliar term in place on first use, including organizational unit (OU), group policy object (GPO), and access control list (ACL).
2. **Investigate and act.** Give the learner immediate access to the console, explorer, and logs. Terminal and GUI activity must update the same account and appear in the same timeline. A manager request, an HR record, and an automated alert should each supply the kind of evidence that sender would actually have.
3. **Teach on demand.** Every ticket starts with hints closed. Level 1 explains the concept and asks one diagnostic question. Level 2 introduces the cmdlets, parameters, and an inspection step. Level 3 gives an exact annotated script and the equivalent GUI steps for the active seed. Let the learner run one line, see the result, and decide when to advance. Provide a plain-language explanation of each output.
4. **Verify and debrief.** Show live criteria as *met*, *unmet*, or *waiting for propagation*. Let the analyst close a case when its criteria are met. The debrief names the change they actually made, who gained or lost access, how they verified it, and a reusable command for their cheat sheet. End with one short transfer question and offer a fresh variation.

Use toast notifications, a communications feed, and a pausable simulated SLA clock. Queue future cases as the shift progresses. Pausing to read help must be possible. Rank progresses from Helpdesk to IAM Analyst to Identity Security Engineer as the learner completes each tier. Track first-time completions once. Calculate posture as the percentage of applicable weighted security and availability checks currently passing. Show which failed checks affect it. Keep rank, posture, and active incident count distinct.

### Ticket campaign and closure conditions

Ship these 16 playable cases. Each must have at least two reproducible seeds that vary the account, resource, evidence, or legitimate near-match. Generate names, approvals, hints, solutions, and predicates from the same fixture IDs. Show the learner which account and business outcome they are responsible for.

#### Tier 1 — Helpdesk and identity lifecycle

| Case | Ticket | The state that closes it |
| --- | --- | --- |
| 01 | A pharmacy technician is locked out before shift change. | The verified technician is enabled and unlocked. The credential version, group memberships, and a similarly named coworker match baseline. |
| 02 | A manager approved read access to the Finance share. | A fresh sign-in can read and is denied write. The approved role-group path supplies access. A direct user grant or membership in a broader role fails the case. |
| 03 | HR sends a new-hire record with two approved baseline groups. | One enabled account has the approved sign-in name, departmental OU, initial credential state, change-at-next-logon flag, and both grants. Handle a display-name collision without altering the existing person. |
| 04 | A technician transfers from Pharmacy to Finance. The former manager spotted lingering access. | The same account is in the new OU. A fresh session can read the Finance share and is denied the Pharmacy share. Preserve the enterprise-wide role. Moving the account alone leaves a visible unmet criterion. |
| 05 | A contractor’s engagement ends today. | Disable the specified account, remove its approved-for-removal access, and verify a new domain sign-in is denied. Retain the object, primary group, and audit history for review. |

#### Tier 2 — Access review, containment, and recovery

| Case | Ticket | The state that closes it |
| --- | --- | --- |
| 06 | An employee reports entering credentials on a fake sign-in page. | Reset the domain credential, require a change at next logon, remove the unapproved membership, and preserve approved access. Identify the anomalous sign-in, revoke cloud refresh sessions, and end the affected app session. Verify each outcome on its own timeline, including any modeled access-token expiry. |
| 07 | A finance user has direct access that bypasses the approved role. | Implement AGDLP, meaning account → global role group → domain local resource group → permission. Remove the redundant direct grant, preserve approved read access, and confirm a control user remains denied. |
| 08 | HR requests a review of enabled human accounts inactive for **more than** 90 days. | Disable only confirmed candidates. Include an exactly-90-day user, an approved leave exception, and a service account. A missing or stale replicated timestamp requires corroboration from the supplied HR and sign-in records. Verify that the service still authenticates. |
| 09 | Two linked GPOs disagree about a workstation setting. | Use the policy trace to identify the winning value. Repair the authorized link, order, or inheritance setting for the target computer OU and verify a sibling OU’s result. Use a second seed with an enforced parent link and inheritance blocking. |
| 10 | A sensitive role is receiving the wrong password policy. | Assign the approved fine-grained password policy to the eligible user or global security group and verify the resultant policy for both the target and a control user. Include competing policies with distinct precedence values. |
| 11 | A helpdesk analyst deleted the wrong directory object. | Locate the recoverable object and restore its original identity into an authorized parent. Verify GUID, SID, location, and expected memberships. A newly created namesake fails. Show the deletion and restoration in the timeline. |

#### Tier 3 — Identity incident response

| Case | Ticket | The state that closes it |
| --- | --- | --- |
| 12 | An alert reports an unfamiliar account in Domain Admins. | Correlate the seeded account creation, membership change, and sign-in evidence. Record the actor account supported by those records, remove the unauthorized privilege, disable the rogue identity, and preserve the legitimate backup account and original evidence. |
| 13 | A service review finds a highly privileged legacy account with a long-lived credential. | Identify the service dependency and its service principal name (SPN). Stage the approved group managed service account (gMSA), limit eligible hosts and rights, transfer the service binding, and pass a fresh service authentication test before retiring the old identity. Seed the required domain prerequisites. |
| 14 | A review finds unexpected control over the executive OU. | Trace the seeded `GenericAll` or `WriteDacl` entry to its source, remove the unauthorized access control entry (ACE) at the correct scope, and verify effective delegation. The authorized helpdesk delegation and sibling OU must still behave as intended. |
| 15 | A workstation’s local administrator password backup is overdue. | Diagnose the seeded Windows LAPS policy or backup problem for an AD-joined endpoint. After a simulated device policy cycle, confirm a fresh backup timestamp, rotation status, and the approved reader boundary. Display metadata and test results without exposing a password. |
| 16 | HR updated an employee on premises, but the corresponding cloud identity shows an old department. | One seed is waiting for its next delta sync. In the other, a sync rule omits the department attribute. Inspect the connector, restore the approved mapping where needed, run the appropriate sync, and verify the same cloud identity received the change. A duplicate cloud user or a cosmetic cloud-side edit fails. |

### A complete first ticket

Seed case 01 with **Maya Ali**, sign-in name `mali`. At 06:54, repeated password attempts from her assigned workstation triggered a lockout. The service desk has already verified her identity using its callback procedure. A coworker with a similar name is enabled and working. The request is to restore Maya’s ability to sign in before handoff.

The Level 1 question is “Which two account properties tell you whether an unlock will help Maya?” Level 2 introduces `Get-ADUser` and explains that `LockedOut` must be requested in the property list for this query. Level 3 exposes these steps one at a time.

```powershell
# Inspect the correct account. Expected here: Enabled=True, LockedOut=True.
Get-ADUser -Identity mali -Properties LockedOut | Select-Object SamAccountName,Enabled,LockedOut

# Preview the target. Maya remains locked after this line.
Unlock-ADAccount -Identity mali -WhatIf

# Apply the change. A successful unlock normally gives no console output.
Unlock-ADAccount -Identity mali

# Read the account again. Expected here: Enabled=True, LockedOut=False.
Get-ADUser -Identity mali -Properties LockedOut | Select-Object SamAccountName,Enabled,LockedOut
```

The GUI route is **Directory → Pharmacy → Maya Ali → Properties → Account → Unlock account → Apply**. Show the executable equivalent and event 4767. Let the learner run a simulated fresh sign-in to confirm the repair. A password reset alone leaves the ticket open. The transfer question is “If Maya could sign in but the Pharmacy share said *Access denied*, what would you inspect next?” Its feedback should point to group membership and the share’s permissions.

### Identity behavior the simulator must get right

- **Sign-in and access.** In the online domain sign-in modeled here, the domain controller authenticates the account. A resource checks the caller’s security context against its permissions. An OU organizes objects, scopes GPO links, and supports delegated administration. Moving a user changes its directory location. Existing group memberships stay attached to the same principal. Show a fresh sign-in separately from an already-issued security context.
- **Containers, accounts, and groups.** At the startup prompt `PS C:\Lab>`, seed an unredirected default users container. `New-ADUser` without `-Path` resolves to `CN=Users,DC=corp,DC=contoso,DC=local`. From an AD provider location use its current path where applicable. Ordinary new accounts start disabled unless appropriately enabled with a valid credential. Model the documented partial result when password setup fails after object creation. Keep the primary group distinct from direct membership and preserve group links across moves and renames. Enforce valid security group scopes and nesting across global, universal, and domain local groups. Distinguish distribution groups from permission-bearing security groups.
- **Access and policy inspectors.** For a chosen principal, resource, and requested right, show the membership path, applicable ACE or ACEs in evaluation order, and result. For a share that models both share and file permissions, evaluate both layers. Display which ACLs the exercise models. For GPOs, trace applicable local, site, domain, and OU policies, link order (1 has highest precedence at the same container), filtering, inheritance blocking, and enforced links. Evaluate the user or computer side that owns the setting. For fine-grained password policy, resolve applicable direct user policies before group-assigned policies, then use the documented precedence rules within that set. Compare a target with a nearby unaffected object.
- **Service identities and recovery.** An SPN identifies a service instance. Show the actual risk factors in the seeded account’s credential management and excessive rights. A gMSA handles the service credential, while Windows LAPS manages a device’s local administrator credential in this exercise. For Recycle Bin recovery, seed the feature as enabled before deletion and the object inside its recoverable lifetime. Preserve identifiers and explain where to restore if the original parent is missing.
- **Sessions, evidence, and time.** Track the issuer, timestamps, and expiry or termination behavior for each modeled Kerberos ticket, Entra token, and application session. Distinguish a new domain authentication attempt from use of an existing ticket. A credential reset must not silently invalidate every issued artifact. State each fixture’s session and app revocation behavior. Use a deterministic clock and a visible **Advance lab time** control for expiry, policy refresh, service reauthentication, and synchronization. For hybrid tickets, show the source of authority, connector result, and cloud-side verification.
- **Audit sources.** Seed Windows auditing for the events the campaign uses. Identify source host, log, event ID, actor, target, and simulated timestamp where available. Model 4624/4625 sign-in success/failure on the recording host, 4720 account creation, 4740 lockout, 4767 unlock, and group additions 4728/4732/4756 for the appropriate global, local, and universal security groups. Keep Entra sign-in records and simulator activity visibly distinct from Windows events. Replication metadata can establish an attribute change’s origin and time. Use security audit evidence for actor attribution.

### PowerShell contract

Implement a **documented PowerShell subset**. Use a tokenizer, parser, parameter binder, and typed object pipeline. Build a registry that declares each cmdlet’s module, parameter sets, aliases, accepted input types, default output, help examples, and preview support. Drive tab completion, syntax highlighting, console help, and GUI equivalents from that registry. Parse syntax before dispatching a mutation. Keep unrecognized syntax inert and return a helpful error with a working `Get-Help` example.

| Capability | Required working behavior |
| --- | --- |
| Discovery | `Get-Help <cmdlet> -Examples`, `Get-Command -Module ActiveDirectory`, `Get-Member` on pipeline objects, and `Select-Object` for named properties. Help examples must execute in the simulator. |
| Grammar | Case-insensitive cmdlets and parameter names, supported aliases and unambiguous abbreviations, positional or named binding, quoted names and distinguished names, comma lists, booleans, comments, multiline statements, variables, property access, hashtable splatting, and object pipelines. Reject ambiguous abbreviations. Support the quoted and script-block filter forms used in the lessons, including comparisons, wildcards, and `Where-Object` with `$_`. |
| Directory administration | Implement `Get-ADUser`, `New-ADUser`, `Set-ADUser` (including `-ChangePasswordAtLogon`), `Move-ADObject`, `Enable-ADAccount`, `Disable-ADAccount`, `Unlock-ADAccount`, `Set-ADAccountPassword`, and `Search-ADAccount -AccountInactive`. Support `Get-ADGroup`, `Get-ADGroupMember`, `Add-ADGroupMember`, `Remove-ADGroupMember` and `Add-ADPrincipalGroupMembership` with the parameter direction documented for each. Cover `-Identity`, `-Properties`, `-SearchBase`, `-SearchScope` and `-Filter` on commands that support them. |
| Policy, recovery, and evidence | Implement the commands used by the authored routes, including `Get-GPInheritance`, `Set-GPLink`, `Get-ADUserResultantPasswordPolicy`, `Get-ADObject -IncludeDeletedObjects`, `Restore-ADObject`, `Get-ADServiceAccount`, directory `Get-Acl` and `Set-Acl`, `Get-ADReplicationAttributeMetadata`, and scoped `Get-WinEvent` queries. Use the documented module/provider and supported options for each. |
| Cloud and simulated actions | Represent a supported Graph command such as `Revoke-MgUserSignInSession` under its own module. Give browser-only operations explicit names, such as `Test-SimResourceAccess` for a fresh authorization check or `Add-SimCaseEvidence` for attaching an event. Supply discoverable help and executable equivalents for every case action available through the GUI. |
| Execution | `-WhatIf` on supporting commands previews targets without altering the domain, emitting a success audit event, or awarding progress. Honor supported confirmation behavior. Format results after pipeline processing. For a failed record in a pipeline, report the affected identity, keep earlier successful results, and show the committed effects. Implement `Read-Host -AsSecureString` with a masked, ephemeral lab input. Retain credential state and version only. Redact password inputs from transcripts, command history, and saved drafts. |

Test at least one valid discovery route that the walkthrough never displays. For example, `$u = Get-ADUser -Identity mali -Properties LockedOut` followed by `$u | Get-Member` must expose an AD user object. A splatted creation request must resolve its target container exactly as its named-parameter equivalent does. Never pass learner input to a host shell, network endpoint, or JavaScript evaluator.

### State, mistakes, and persistence

Use one normalized domain graph keyed by stable object GUIDs, with SIDs on security principals. Store containment, group membership, ACEs, resource permissions, service dependencies, GPO links, password policies, and session records as typed relationships. Keep indexes for identity, parent, membership, and audit time. Derive display paths from parent objects. A user created from the console must immediately appear in the right explorer container.

Route terminal commands and GUI saves through the same action handlers. Each action checks scope and authorization, commits a coherent result, appends the relevant events, calculates the before/after diff, and reruns affected ticket predicates. A GUI form carries the revision it opened against. A stale save shows the conflict and preserves the user’s draft for review.

Persist versioned campaign progress, seed, clock, and committed changes in `localStorage`. Reconstruct large immutable fixtures from seeds. Handle malformed saves, schema migrations, full storage, and two open tabs without silently discarding a newer campaign. Show whether a change was saved. Use a single writer or revision-aware synchronization.

Take a checkpoint after introducing each active case and before the learner’s first change. One campaign case is active at a time. Inbox previews are read-only. **Reset this attempt** restores that case’s starting state and clock while preserving prior completions. Replaying a completed case uses an isolated copy and cannot award the same completion twice. Reload must resume the current attempt.

Make mistakes observable and repairable. In case 08, if the analyst disables the SQL service identity, a simulated restart must record the resulting sign-in failure and mark the dependent service unhealthy. The learner can inspect the dependency and event, re-enable the account, and rerun the service test. Show a before/after diff for the approved cleanup and the repaired service, including which posture checks changed. Keep repair activity in the attempt history. An unresolved outage prevents closure.

### Workspace and grading

Use a dark, keyboard-accessible, responsive four-region workspace. Put the inbox, messages, and on-demand hints on the left. Put the collapsible directory, object properties, group memberships, access/policy inspectors, and filterable audit log above the console. Put the terminal and multiline script pad below, with history navigation, suggestions, and readable errors. Put rank, posture, active incidents, and the PowerShell/GUI toggle in the top bar. On narrow screens, use labeled tabs and preserve the active object, terminal draft, and ticket. Include user, computer, security group, service account, OU, and default-container nodes. Label the policy, recovery, and Entra views with their own tool names. The AD Users and Computers (ADUC) view needs working context menus and editors for account properties, credentials, and group memberships. Give each context menu a keyboard and button alternative. Show status in text as well as color.

Represent each ticket with a stable ID, fixture generator, approvals, preserved controls, evidence requirements, predicates, three hint levels, both solution routes, and debrief. Grade the actual identity, effective permissions, session state, service checks, and cited evidence relevant to the case. Accept valid alternate syntax and order wherever the outcome permits it. For a genuine order requirement, such as successful service cutover before retiring a legacy account, verify ordered events. Leave a criterion open if a learner obtains read access by granting broader write access. Display the observed and required outcome so they can recover.

### Acceptance and delivery

1. Run every ticket from a fresh seed using its annotated script and its GUI route. Repeat on the second seed. For each ticket also exercise one plausible wrong fix and one unrelated control object. Report results by ticket and route.
2. Check console/GUI parity in both directions. Test duplicate display names, a DN containing an escaped comma, mixed-case commands, invalid parameters, typed pipelines, splatting, default creation outside and inside the AD drive, password-policy partial failure, and a dry run whose before and after security state is identical.
3. Refresh during an open ticket, reopen a stale editor after a terminal edit, save from competing tabs, simulate storage failure, reset one attempt, and replay a closed case. Verify audit integrity, persistence, and one completion reward.
4. Exercise delayed and negative outcomes. An OU move alone cannot pass case 04. A password reset alone cannot pass case 06. An exactly-90-day user stays active in case 08. A recreated namesake cannot pass case 11. Case 16 closes only after the correct existing cloud object receives the update.
5. Render large trees and logs in windows or pages. Test a seeded domain of 2,000 objects and 10,000 events. Measure the 95th-percentile time to filter the log and refresh a normal ticket after a single edit across at least 30 runs. Target 200 ms for each on the stated test browser and machine. Test narrow-screen and keyboard-only paths.
6. Deliver the static build, source, run command, command/module support list, and actual test results. Identify any unimplemented syntax, simplified platform behavior, or unrun check. A ticket counts as shipped only when its evidence, both execution routes, verifier, and debrief all work.

### Microsoft Learn implementation references

- Check account creation defaults, inspection, and unlock behavior. [New-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/new-aduser?view=windowsserver2025-ps) · [Get-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser?view=windowsserver2025-ps) · [Unlock-ADAccount](https://learn.microsoft.com/en-us/powershell/module/activedirectory/unlock-adaccount?view=windowsserver2025-ps)
- Check authentication, group permissions, OU delegation, and ACL evaluation. [Kerberos](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-authentication-overview) · [Security groups](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-groups) · [OU delegation](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/delegation-control-wizard) · [ACE ordering](https://learn.microsoft.com/en-us/windows/win32/secauthz/order-of-aces-in-a-dacl)
- Check policy, service credentials, and object recovery. [GPO processing](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-policy/group-policy-processing) · [Fine-grained policies](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/adac/fine-grained-password-policies) · [gMSAs](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-managed-service-accounts/group-managed-service-accounts/manage-group-managed-service-accounts) · [Windows LAPS](https://learn.microsoft.com/en-us/windows-server/identity/laps/laps-overview) · [AD Recycle Bin](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/adac/active-directory-recycle-bin)
- Check timestamps, audit evidence, and hybrid identity. [Replicated logon timestamp](https://learn.microsoft.com/en-us/troubleshoot/mem/configmgr/discovery/lastlogontimestamp-not-accurate) · [Windows event IDs](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/appendix-l--events-to-monitor) · [Revoking Entra access](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access) · [Sync cycles](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sync-feature-scheduler) · [Troubleshooting object sync](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/tshoot-connect-objectsync)
