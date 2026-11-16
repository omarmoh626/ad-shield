# T02 — PowerShell language core

- **Slug:** `t02-ps-language`
- **Depends on:** T01 merged
- **Goal:** tokenizer, parser, registry, binder, typed pipeline, discovery cmdlets, and formatter. No Active Directory cmdlets yet.
- **SPEC sections:** PowerShell contract (intro paragraph; rows Discovery, Grammar, Execution; closing paragraph).
- **Out of scope:** AD cmdlets (T03), sim and event cmdlets (T04), terminal UI (T06).

## Split

**P1 — Codex builds, Claude audits: tokenizer and parser**

- `src/ps/tokenizer.ts`, `ast.ts`, `parser.ts`, `errors.ts`.
- Every token and node carries line and column, for highlighting and error messages.
- Supported: commands with named parameters (`-Name value`, `-Name:value`, switches), positional arguments, single-quoted and double-quoted strings, numbers, `$true`, `$false`, `$null`, variables and assignment, property access (`$u.Name`), comma lists, hashtable literals, splatting (`@params`), script blocks, `$_`, pipelines, `;` and newline separators, backtick and trailing-pipe line continuation, `#` and `<# #>` comments, comparison and logical operators inside script blocks (`-eq -ne -like -notlike -gt -ge -lt -le -and -or -not`).
- Unsupported syntax returns a parse error with position. List in the error what is unsupported: subexpressions, loops, `if`, functions, method calls, redirection, call operators.
- Files: `src/ps/tokenizer.ts`, `src/ps/ast.ts`, `src/ps/parser.ts`, `src/ps/errors.ts`, `tests/ps/tokenizer.test.ts`, `tests/ps/parser.test.ts`.

**P2 — Claude builds, Codex audits: registry, binder, runtime, discovery**

- `registry.ts` (CmdletSpec, modules, aliases), `binder.ts`, `runtime.ts`, `values.ts`, `format.ts`, `completion.ts`, `highlight.ts`.
- Binder: case-insensitive names, aliases, unambiguous parameter abbreviations, rejection of ambiguous abbreviations with the candidate list, positional and named binding, parameter set resolution, switches, `-Param:$false`, type conversion, `-WhatIf` and `-Confirm` common parameters.
- Runtime: variables, typed object pipeline, per-record errors that keep earlier results, a transcript, a `readSecure` hook, and a `dispatch` hook. Formatting runs after the pipeline.
- Cmdlets: `Get-Help` (with `-Examples`), `Get-Command` (with `-Module`), `Get-Member`, `Select-Object`, `Where-Object` with `$_`, `Write-Output`, `Read-Host` (with `-AsSecureString`).
- Unknown command error that includes a working `Get-Help` example.
- Start `docs/SUPPORT.md` with supported syntax, unsupported syntax, and the module list.
- Files: `src/ps/registry.ts`, `src/ps/binder.ts`, `src/ps/runtime.ts`, `src/ps/values.ts`, `src/ps/format.ts`, `src/ps/completion.ts`, `src/ps/highlight.ts`, `src/ps/cmdlets/core/**`, `src/ps/cmdlets/utility/**`, `tests/ps/**` except the two P1 test files, `docs/SUPPORT.md`.

## Contract (copy into HANDOFF_STATE.md)

- `parse(source): { script?: Script; errors: ParseError[] }`. Any error means nothing runs.
- AST node kinds and field names as P1 ships them. P2 consumes them without changes, or logs a `D#`.
- CmdletSpec: shape in CONTRACTS section 7.
- `run(source, rt): ConsoleResult` with `output`, `errors`, and `committed` action results.
- The parser never evaluates anything. Learner text never reaches `eval` or `new Function`.

## Checks (copy into HANDOFF_STATE.md)

- `npm run typecheck` -> expect: exit 0
- `npm test -- tests/ps` -> expect: 0 failed
- `npm run guard` -> expect: exit 0
- `npm test` -> expect: 0 failed (T01 tests still pass)

## Required tests

P1:
- Each supported construct parses to the expected node.
- Each unsupported construct gives a parse error with line and column.
- A quoted DN containing an escaped comma stays one token.
- Bare-word arguments such as `90.00:00:00` and `corp\mali` stay one token.
- Comments, multiline pipelines, and backtick continuation.
- Mixed-case command and parameter names tokenize the same as canonical case.
- Unterminated string and unbalanced brace give clear errors.

P2 (use a test-only fake module; AD cmdlets do not exist yet):
- Mixed-case command and parameter names bind.
- Unambiguous abbreviation binds. Ambiguous abbreviation errors and lists candidates.
- Positional binding equals named binding. Splatting equals named binding.
- `$x = Fake-Get ...` then `$x | Get-Member` shows the type name and members.
- `Select-Object` named properties. `Where-Object { $_.Prop -eq 'x' }`.
- A parse error dispatches nothing (spy on the dispatch hook).
- An invalid parameter name errors, names the parameter, and dispatches nothing.
- A failing record mid-pipeline: earlier results are kept and the error names the identity.
- `Read-Host -AsSecureString`: the value is absent from the transcript and from history.
- Registry test: every help example of every registered cmdlet executes without error.
- Tab completion offers cmdlet names, then parameter names for the bound cmdlet.

## Audit focus

P1 audit (Claude):
- No evaluation path. Parser output is data only.
- Position info on all nodes.
- Unsupported syntax fails closed.
- String rules: single quotes are literal, double quotes expand `$var`.

P2 audit (Codex):
- Mutations cannot happen before a full successful parse.
- Ambiguity handling in the binder.
- Secure value never stored or echoed.
- Formatting happens after the pipeline, not per cmdlet.
- Help, completion, and highlighting read from the registry and nothing else.

## Done when

All checks pass, both audits are closed, and `docs/SUPPORT.md` exists.
