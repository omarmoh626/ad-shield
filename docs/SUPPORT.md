# AD Shield console support

The AD Shield console is a simulated PowerShell subset. It runs in the browser. It never reaches a real system, a host shell, or the network. This file lists what the console supports, what it rejects, and where it is simpler than Windows PowerShell. Every task that adds or changes console behavior updates this file.

## Modules and cmdlets

| Module | Cmdlets | Aliases | Added in |
| --- | --- | --- | --- |
| `Microsoft.PowerShell.Core` | `Get-Help`, `Get-Command`, `Where-Object` | `help`, `man`, `gcm`, `where`, `?` | T02 |
| `Microsoft.PowerShell.Utility` | `Get-Member`, `Select-Object`, `Write-Output`, `Read-Host` | `gm`, `select`, `echo`, `write` | T02 |
| `ActiveDirectory` | None yet | | T03 |
| `ADShield.Sim` | None yet | | T04 |

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
- Script blocks that hold one comparison expression, with `$_` or `$PSItem` as the current object.
- Comparison and logical operators inside script blocks: `-eq`, `-ne`, `-like`, `-notlike`, `-gt`, `-ge`, `-lt`, `-le`, `-and`, `-or`, `-not`.
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
- Commands inside a script block. A script block holds one comparison expression only.
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
- **Bare words `true`, `false`, and `null`.** The console reads these bare words as the values `$true`, `$false`, and `$null`. Windows PowerShell reads them as text. Quote the word to pass it as text.
- **Numbers.** A bare number such as `007` becomes the number `7`. Quote the value to keep the leading zeros.
- **Confirmation.** A cmdlet with high impact asks for confirmation unless the command has `-Confirm:$false`. `-Confirm` asks for any cmdlet that changes the simulated domain. When the console cannot ask, the change is cancelled and nothing changes.
- **`-WhatIf`.** The cmdlet previews the change through the action pipeline. The simulated domain does not change, no audit event is written, and no progress is awarded.
- **`Read-Host`.** Without `-AsSecureString`, the typed line is returned as text and appears in the transcript. Do not type a password there.
- **`Read-Host -AsSecureString`.** The input is simulated secure input. The lab checks the typed characters against the simulated password policy and then discards them. The console keeps the policy verdict only. The characters never enter a variable, the transcript, the command history, a saved draft, or the simulated domain. The returned object shows as `System.Security.SecureString`.
- **Prompts in the middle of a script.** `Read-Host` and confirmation questions get their answer from the lab user interface. When the answer is not ready, the console stops the run and shows the prompt. A stopped run changes nothing: the simulated domain, the variables, the command history, and the transcript stay as they were before the run. After the learner answers, the console runs the same input again from the start, and each change is applied exactly once. The learner sees one run. The terminal user interface arrives in T06.
- **One transaction per input.** The console works on its own copy of the simulated domain while an input runs. The lab receives the new domain state only when the run finishes. An input with a syntax error, an unknown command, or an unknown parameter name returns the domain unchanged.
- **Type conversion.** The binder converts between text, whole numbers, and Boolean values. `true` and `false` in any letter case convert to a Boolean value. It does not convert dates or other .NET types.
- **Parameter sets.** The console picks the first parameter set that fits the named and positional arguments, starting with the default set. It does not prompt for a missing mandatory parameter. It reports an error instead.
