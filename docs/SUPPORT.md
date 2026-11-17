# AD Shield console support

The AD Shield console is a simulated PowerShell subset. It runs in the browser. It never reaches a real system, a host shell, or the network. This file lists what the console supports, what it rejects, and where it is simpler than Windows PowerShell. Every task that adds or changes console behavior updates this file.

## Modules and cmdlets

| Module | Cmdlets | Aliases | Added in |
| --- | --- | --- | --- |
| `Microsoft.PowerShell.Core` | `Get-Help`, `Get-Command`, `Where-Object` | `help`, `man`, `gcm`, `where`, `?` | T02 |
| `Microsoft.PowerShell.Utility` | `Get-Member`, `Select-Object`, `Write-Output`, `Read-Host` | `gm`, `select`, `echo`, `write` | T02 |
| `Microsoft.PowerShell.Management` | `Set-Location`, `Get-Location` | `cd`, `sl`, `chdir`, `gl`, `pwd` | T03 P2 |
| `ActiveDirectory` | `Get-ADUser`, `Get-ADGroup`, `Get-ADGroupMember`, `Get-ADObject`, `Get-ADPrincipalGroupMembership`, `Search-ADAccount` | | T03 P1 |
| `ActiveDirectory` | `New-ADUser`, `Set-ADUser`, `Move-ADObject`, `Enable-ADAccount`, `Disable-ADAccount`, `Unlock-ADAccount`, `Set-ADAccountPassword`, `Add-ADGroupMember`, `Remove-ADGroupMember`, `Add-ADPrincipalGroupMembership` | | T03 P2 |
| `Microsoft.PowerShell.Diagnostics` | `Get-WinEvent` | | T04 |
| `ADShield.Sim` | `Test-SimSignIn`, `Test-SimResourceAccess`, `Step-SimClock`, `Add-SimResourcePermission`, `Remove-SimResourcePermission` | | T04 |
| `ADShield.Sim` | `Get-SimTicket`, `Close-SimTicket`, `Reset-SimAttempt` | | T05 P1 |

Supported parameters:

| Cmdlet | Parameters |
| --- | --- |
| `Get-Help` | `[-Name] <string>`, `-Examples` |
| `Get-Command` | `[-Name] <string[]>` with wildcards, `-Module <string[]>` |
| `Where-Object` | `[-FilterScript] <scriptblock>` |
| `Get-Member` | `[-Name] <string[]>` with wildcards, `-InputObject <Object>` |
| `Select-Object` | `[-Property] <string[]>` with wildcards, `-ExpandProperty <string>`, `-First <int>`, `-Last <int>` |
| `Write-Output` | `[-InputObject] <Object[]>` |
| `Read-Host` | `[-Prompt] <string>`, `-AsSecureString` |
| `Get-ADUser` | `-Identity`, `-Filter`, `-Properties`, `-SearchBase`, `-SearchScope` |
| `Get-ADGroup` | `-Identity`, `-Filter`, `-Properties`, `-SearchBase`, `-SearchScope` |
| `Get-ADObject` | `-Identity`, `-Filter`, `-Properties`, `-SearchBase`, `-SearchScope` |
| `Get-ADGroupMember` | `-Identity`, `-Recursive` |
| `Get-ADPrincipalGroupMembership` | `-Identity` |
| `Search-ADAccount` | `-AccountInactive`, `-TimeSpan`, `-DateTime`, `-LockedOut`, `-AccountDisabled`, `-UsersOnly` |
| `New-ADUser` | `[-Name] <string>`, `-SamAccountName`, `-GivenName`, `-Surname`, `-DisplayName`, `-Description`, `-Department`, `-Title`, `-Office`, `-EmailAddress`, `-UserPrincipalName`, `-Path`, `-AccountPassword <securestring>`, `-Enabled <bool>`, `-ChangePasswordAtLogon <bool>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Set-ADUser` | `[-Identity]` (pipeline), `-GivenName`, `-Surname`, `-DisplayName`, `-Description`, `-Department`, `-Title`, `-Office`, `-EmailAddress`, `-UserPrincipalName`, `-ChangePasswordAtLogon <bool>`, `-Replace <hashtable>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Move-ADObject` | `[-Identity]` (pipeline), `[-TargetPath] <string>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Enable-ADAccount` | `[-Identity]` (pipeline), `-PassThru`, `-WhatIf`, `-Confirm` |
| `Disable-ADAccount` | `[-Identity]` (pipeline), `-PassThru`, `-WhatIf`, `-Confirm` |
| `Unlock-ADAccount` | `[-Identity]` (pipeline), `-PassThru`, `-WhatIf`, `-Confirm` |
| `Set-ADAccountPassword` | `[-Identity]` (pipeline), `-Reset`, `-NewPassword <securestring>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Add-ADGroupMember` | `[-Identity] <group>` (pipeline), `[-Members] <principals>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Remove-ADGroupMember` | `[-Identity] <group>` (pipeline), `[-Members] <principals>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Add-ADPrincipalGroupMembership` | `[-Identity] <principal>` (pipeline), `[-MemberOf] <groups>`, `-PassThru`, `-WhatIf`, `-Confirm` |
| `Get-WinEvent` | `[-FilterHashtable] <hashtable>` with keys `LogName` (required), `Id` (one or a list), `StartTime`, `EndTime`; `-ComputerName <string>`, `-MaxEvents <int>` |
| `Test-SimSignIn` | `[-Identity] <user>`, `[-ComputerName] <string>`, `-SimulateBadPassword` |
| `Test-SimResourceAccess` | `[-Identity] <user>` or `-Session <id or Test-SimSignIn output>`, `-Resource <share>`, `-Right Read\|Write\|Modify\|FullControl` |
| `Step-SimClock` | `-Minutes <int>`, `-Hours <int>`, `-Days <int>` |
| `Add-SimResourcePermission` | `[-Resource] <share>`, `[-Identity] <principal>`, `-Right <right>`, `-Layer Share\|File\|Both`, `-WhatIf`, `-Confirm` |
| `Remove-SimResourcePermission` | `[-Resource] <share>`, `[-Identity] <principal>`, `-Right <right>`, `-Layer Share\|File\|Both`, `-WhatIf`, `-Confirm` |
| `Get-SimTicket` | none; reads active ticket, predicate observations, and completion IDs |
| `Close-SimTicket` | `-WhatIf`; reports observed and required values when predicates block closure |
| `Reset-SimAttempt` | none; restores checkpoint state and lab clock, keeps completions |
| `Set-Location` | `[-Path] <string>` |
| `Get-Location` | none |

Run `Get-Help <cmdlet> -Examples` in the console to see examples. A test runs every example, so each one works.

## Supported syntax

- Commands with named parameters (`-Name value`, `-Name:value`), switches, and positional arguments.
- Command names, aliases, and parameter names in any letter case.
- Parameter name abbreviations, when the abbreviation matches one parameter only. An abbreviation that matches two or more parameters is an error that lists the matches.
- Single-quoted strings, which are literal. A doubled quote (`''`) is one quote character.
- Double-quoted strings, which expand `$variable`. A backtick before `$` keeps the dollar sign literal.
- Numbers, `$true`, `$false`, and `$null`.
- Variables and assignment: `$u = Get-Command`.
- Property access, including nested access: `$u.Name`, `$u.Manager.Name`.
- Comma lists: `-Property Name, Source`.
- Hashtable literals: `@{ Name = 'x'; Count = 2 }`.
- Splatting a hashtable or a list: `Get-Command @params`.
- Script blocks passed to ActiveDirectory `-Filter` keep their source and use the same parsed comparison grammar as quoted filters. Property names can appear bare or through `$_`/`$PSItem`.
- Other script blocks hold one comparison expression, with `$_` or `$PSItem` as the current object. Comparison and logical operators: `-eq`, `-ne`, `-like`, `-notlike`, `-gt`, `-ge`, `-lt`, `-le`, `-and`, `-or`, `-not`.
- Pipelines of typed objects.
- `;` and a new line as statement separators.
- Line continuation with a backtick at the end of a line, or with a `|` at the end of a line.
- Comments: `# to the end of the line` and `<# block #>`.
- The common parameters `-WhatIf` and `-Confirm` on cmdlets that change the simulated domain.

## Unsupported syntax

The console rejects each of these with an error that gives the line and column. A rejected input runs nothing and changes nothing.

- Subexpressions: `$( ... )`, `@( ... )`, and parentheses for grouping. This includes `$( ... )` inside a double-quoted string.
- Loops: `for`, `foreach`, `while`, `do`.
- `if` statements.
- Function definitions.
- Method calls: `$x.ToString()`.
- Redirection: `>`, `>>`, `2>&1`, `<`.
- The call operator `&` and dot-sourcing.
- Commands inside a script block, except ActiveDirectory `-Filter` blocks that use the constrained filter grammar above.
- Assignment inside a script block.
- Assignment to a property: `$u.Name = 'x'`.
- Compound assignment: `+=`, `-=`.
- Arithmetic operators: `+`, `-`, `*`, `/`.
- Other comparison operators: `-match`, `-contains`, `-in`, `-replace`, and the case-sensitive forms such as `-ceq`.
- The comparison form of `Where-Object` without braces: `Where-Object Name -eq 'x'`. Use `Where-Object { $_.Name -eq 'x' }`.
- Calculated properties in `Select-Object`.
- Common parameters other than `-WhatIf` and `-Confirm`, such as `-ErrorAction` and `-Verbose`.
- `${name}` inside a double-quoted string. The text stays literal.

## Simplified behavior

- **Active Directory reads.** Identity lookup accepts sAMAccountName, distinguished name, GUID, and SID, ignoring case. Display names are rejected as identity keys. Filter text supports comparisons, wildcards, logical operators, and `*`; it is parsed as data and never evaluated as code. Inactivity search uses `lastLogonTimestamp`; accounts exactly at the cutoff match. Missing timestamps do not match.
- **Active Directory writes.** Every write cmdlet builds an action and sends it through the simulated action pipeline; none changes the domain directly. Pipeline input accepts AD objects from `Get-AD*` and `Search-ADAccount`, objects from `Select-Object` (bound by `DistinguishedName` or `SamAccountName`), and strings. A successful change prints nothing unless `-PassThru` is given.
- **`-WhatIf` messages.** The preview line reads `What if: Performing the operation "<op>" on target "<DN>". (simulated preview; nothing changed)`. `<op>` is `New` for `New-ADUser`, `Move` for `Move-ADObject`, `Set-ADAccountPassword` for that cmdlet, and `Set` for the others. For the membership cmdlets the target is the `-Identity` object.
- **`New-ADUser` container.** `-Path` wins. Without it, the account goes to the current `AD:` container when the console is inside the drive below its root, and to `CN=Users,DC=corp,DC=contoso,DC=local` otherwise (including at `AD:\` itself). A splatted request resolves the same container as the named form.
- **`New-ADUser` defaults.** `-SamAccountName` defaults to `-Name`. This default is a lab choice; Microsoft Learn does not document one. Accounts start disabled. `-Enabled $true` enables the account only with a passing simulated `-AccountPassword`.
- **`New-ADUser` partial results.** With a password that fails the lab policy, the account is still created, stays disabled, has no credential, and the console writes an error that explains the partial result. With `-Enabled $true` and no password, the account is created disabled and the console writes an error. This follows the New-ADUser page on Microsoft Learn: accounts are never enabled unless a valid password is set, and "the account is created if the password fails for any reason." `-PasswordNotRequired` is not modeled.
- **`-ChangePasswordAtLogon`.** Stored as the attribute `changePasswordAtLogon` instead of setting `pwdLastSet` to 0. Read it with `Get-ADUser -Properties ChangePasswordAtLogon`.
- **`Set-ADAccountPassword`.** Administrator reset only: `-Reset` is required and `-OldPassword` is not modeled. Without `-NewPassword` the console asks once for a masked simulated password. A preview never asks. A reset does not unlock the account or end issued sessions.
- **`Remove-ADGroupMember` confirmation.** The console asks once per member removed, not once per command. `-Confirm:$false` skips the question. `-WhatIf` never asks.
- **`Move-ADObject`.** Accepts a sAMAccountName as well as a DN or GUID. The GUID, SID, and group memberships stay the same.
- **`AD:` drive.** The prompt starts at `PS C:\Lab>`. `C:\Lab` is the only simulated file system location. `Set-Location` accepts `AD:`, `AD:\<DN>`, `..`, a full DN at the drive root, and an RDN such as `OU=Finance` below it. Only domains, OUs, and containers can be the location. `Get-Location` returns an object with a `Path` property, and `$PWD` returns the path as text. The `Get-AD*` cmdlets do not use the location as a default `-SearchBase`.
- **Shares and permissions.** The lab models two shares on FS01, Pharmacy and Finance. Each has a share layer and a file (NTFS) layer, and both must allow. Rights are Read, Write, Modify (read and write), and FullControl. Entries are evaluated in Windows DACL order: explicit deny, explicit allow, inherited deny, inherited allow. The first entry that applies decides the layer. A deny applies when its right overlaps the request; an allow must cover the whole request. Allow entries are not added together across entries. Directory object ACLs, `Get-Acl`, and `Set-Acl` are not modeled.
- **Security context.** A context holds the user SID, the primary group, and every security group reached through valid nesting. Distribution groups never appear in it.
- **`Test-SimResourceAccess`.** Read-only: it records no event, issues no session, has no `-WhatIf`, and awards nothing. Without `-Session` it models a fresh sign-in from current memberships; if that sign-in would fail, it says why and runs no access check. With `-Session` it uses the snapshot taken at sign-in time.
- **Sessions.** `Test-SimSignIn` issues a session that keeps its security context until it ends or expires after ten lab hours. Nothing refreshes it: a membership change reaches only a new sign-in. Permission changes on a share apply to existing sessions at the next check, as in Windows. A password reset does not end sessions. Kerberos tickets and Entra tokens are not modeled separately.
- **Sign-in checks.** In order: disabled (4625, sub-status `0xC0000072`), locked out (`0xC0000234`), no credential or `-SimulateBadPassword` (`0xC000006A`), must change password (`0xC0000224`). Only a bad password counts toward lockout. Five in a row lock the account and record 4740 on DC01. A success resets `badPwdCount`. Lockout has no duration and no observation window: the account stays locked until `Unlock-ADAccount`. Every sign-in is interactive (logon type 2).
- **`-ChangePasswordAtLogon`.** A sign-in is refused while `changePasswordAtLogon` is `$true` or `pwdLastSet` is 0. The lab has no password-change dialog. Clear the flag with `Set-ADUser -ChangePasswordAtLogon $false` after a reset.
- **Event hosts.** 4624 and 4625 are recorded on the computer where the user signed in. 4740 and directory changes are recorded on DC01. Simulator activity (clock, permission changes, ending a session) has origin `simulator` and never appears in `Get-WinEvent`.
- **`Get-WinEvent`.** As in Windows, without `-ComputerName` it reads the local computer only. The lab console runs on the analyst's admin workstation `IT-ADM01`, so directory events such as 4740 need `-ComputerName DC01`, and sign-in events need the computer where the user signed in. Only the `FilterHashtable` parameter set is supported. Times are UTC lab time, shown as `YYYY-MM-DDTHH:MM:SSZ`. When nothing matches, it writes the Windows error "No events were found that match the specified selection criteria."
- **Lab clock.** `Step-SimClock` moves the lab clock forward only. The real clock is never read.
- **Search scope.** `Base` includes only the base object, `OneLevel` includes direct children, and `Subtree` includes the base and descendants.

These behaviors differ from Windows PowerShell on purpose.

- **Check before run.** The console parses the whole input first. Then it checks every command name and every parameter name. If any check fails, nothing runs, including earlier lines of the same input. Windows PowerShell would run the earlier lines.
- **Splatted names are checked later.** The console checks the keys of a splatted hashtable when that command binds. An unknown key stops that command. Earlier statements have already run.
- **Errors inside a pipeline.** When one record fails, the console reports the identity of the record and continues with the next record. When a cmdlet stops with an error, the results it returned before the error are kept, and later statements still run.
- **Formatting.** Formatting runs once per statement, after the whole pipeline has finished. Objects with up to four display properties show as a table. Objects with more show as a list. Column alignment is left for every type.
- **Help.** `Get-Help` returns text built from the cmdlet registry. It has `NAME`, `SYNOPSIS`, `SYNTAX`, `ALIASES`, `MODULE`, and `REMARKS` sections, or the examples with `-Examples`. There are no `-Full`, `-Detailed`, `-Online`, or `about_` topics.
- **Aliases.** `help` and `man` are aliases of `Get-Help`. They do not page the output.
- **`Get-Command`.** It lists the cmdlets of this lab only. `CommandType` is always `Cmdlet`. There is no `Version` column.
- **`Get-Member`.** It shows properties only. It does not show methods, because the console does not support method calls.
- **`Select-Object`.** A property name that an object does not have becomes an empty column, as in Windows PowerShell. Selected objects have the type name `Selected.<original type>`.
- **Comparisons.** `-eq`, `-ne`, `-like`, and `-notlike` ignore letter case. The left value decides whether a comparison is numeric or text. A list on the left returns the items that pass.
- **`$true`, `$false`, and `$null` inside double quotes.** They expand as in Windows PowerShell: `"x $true"` becomes `x True`, `$false` becomes `False`, and `$null` becomes empty text. So `-Filter "Enabled -eq $true"` reaches the filter as `Enabled -eq True`. Single-quoted text is never expanded.
- **Bare words `true`, `false`, and `null`.** The console reads these bare words as the values `$true`, `$false`, and `$null`. Windows PowerShell reads them as text. Quote the word to pass it as text.
- **Numbers.** A bare number such as `007` becomes the number `7`. Quote the value to keep the leading zeros.
- **Confirmation.** A cmdlet with high impact asks for confirmation unless the command has `-Confirm:$false`. `-Confirm` asks for any cmdlet that changes the simulated domain. When the console cannot ask, the change is cancelled and nothing changes.
- **`-WhatIf`.** The cmdlet previews the change through the action pipeline. The simulated domain does not change, no audit event is written, and no progress is awarded.
- **Ticket campaign cmdlets.** `Get-SimTicket`, `Close-SimTicket`, and `Reset-SimAttempt` use an optional host-provided campaign hook. Without an active campaign, they report that no simulated ticket is active. `Close-SimTicket -WhatIf` checks predicates without recording completion. All output labels ticket activity as simulated.
- **`Read-Host`.** Without `-AsSecureString`, the typed line is returned as text and appears in the transcript. Do not type a password there.
- **`Read-Host -AsSecureString`.** The input is simulated secure input. The lab checks the typed characters against the simulated password policy and then discards them. The console keeps the policy verdict only. The characters never enter a variable, the transcript, the command history, a saved draft, or the simulated domain. The returned object shows as `System.Security.SecureString`.
- **Prompts in the middle of a script.** `Read-Host` and confirmation questions get their answer from the lab user interface. When the answer is not ready, the console stops the run and shows the prompt. A stopped run changes nothing: the simulated domain, the variables, the command history, and the transcript stay as they were before the run. After the learner answers, the console runs the same input again from the start, and each change is applied exactly once. The learner sees one run. The terminal user interface arrives in T06.
- **One transaction per input.** The console works on its own copy of the simulated domain while an input runs. The lab receives the new domain state only when the run finishes. An input with a syntax error, an unknown command, or an unknown parameter name returns the domain unchanged.
- **Type conversion.** The binder converts between text, whole numbers, and Boolean values. `true` and `false` in any letter case convert to a Boolean value. It does not convert dates or other .NET types.
- **Parameter sets.** The console picks the first parameter set that fits the named and positional arguments, starting with the default set. It does not prompt for a missing mandatory parameter. It reports an error instead.
- **`Reset-SimAttempt`.** The cmdlet restores the case checkpoint with the same ticket-engine reset that the GUI uses. It is not a directory action, so it writes no audit event. The console returns the restored domain state, and the attempt's action log starts empty again.
- **Case 01 setup.** The lockout is produced by five simulated bad-password sign-ins at the user's workstation, through the normal sign-in handler. The simulated lockout threshold is 5. The near-match coworker is created through the action pipeline when the case is introduced, so that account's creation event comes before the case checkpoint.
- **Password reset and lockout.** A simulated password reset does not unlock the account, as in Windows Server. An unlock is a separate action (event 4767).

## Saving

- The simulator saves to one browser storage key, `adshield.v1`. The save holds the campaign progress, the base and case seeds, the lab clock, and the committed actions since each case checkpoint. It holds no directory state and no password values. Loading rebuilds the directory from the seeds and replays the actions.
- If the save cannot be read, the simulator keeps a copy under `adshield.v1.backup`, shows a notice, and starts a new campaign. If the save comes from a newer version, the tab shows a notice and does not write, so the save stays as it is.
- Only one tab saves at a time. The first tab takes a browser Web Lock named `adshield-writer` and keeps it while it stays open. Any other tab opens read-only and says so. When the saving tab closes, the next tab loads the newest save and starts saving.
- Each save also checks the save's revision number. A tab never writes over a save that is newer than the one it last loaded or wrote. If that happens, the tab becomes read-only and says so.
- **Simplified:** in a browser without Web Locks (`navigator.locks`), the simulator shows a notice and relies on the revision check alone. Two tabs that save at almost the same moment could then both write, and the later save would win. Keep the simulator open in one tab only in that browser.
- When storage is full or blocked, the simulator shows a notice and keeps working. It shows "Not saved" until a later save succeeds.
