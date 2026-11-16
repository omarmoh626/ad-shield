# AD Shield Role-Swap pack

This pack splits `docs/SPEC.md` (the AD Shield v2 master build prompt) into ten Role-Swap tasks. Together they build the first slice: the engine plus Tier 1, cases 01 through 05.

Each task is one `swap` run. In every task Codex builds Part 1 and Claude audits it, then Claude builds Part 2 and Codex audits it. The brief for each task already fixes the split, the files, the contract, and the checks, so the planning step is short.

## Files

| File | Purpose |
| --- | --- |
| `../SPEC.md` | The master build prompt, unchanged. |
| `CONTRACTS.md` | Shared architecture decisions. Both agents read it first. |
| `DECISIONS.md` | Defaults chosen where the spec left a choice open. Review before T01. |
| `T01` to `T10` | One brief per swap task. |
| `COVERAGE.md` | Which task covers which part of the spec, and what is deferred. |
| `BACKLOG.md` | Tier 2 and Tier 3 tasks for later. |
| `../../CLAUDE.md`, `../../AGENTS.md` | Project rules for both agents. Same text in both. |

## Task order

Run them in order. Each one needs the earlier ones merged to `main`.

| Task | Builds | Part 1: Codex builds | Part 2: Claude builds |
| --- | --- | --- | --- |
| T01 | Scaffold, domain graph, action pipeline | Scaffold, graph, DNs, IDs, clock | Dispatch pipeline, handlers, base fixture |
| T02 | PowerShell language core | Tokenizer, parser | Registry, binder, runtime, discovery cmdlets |
| T03 | Active Directory cmdlets | Read cmdlets, filter engine | Write cmdlets, `-WhatIf`, secure input |
| T04 | Access, sessions, evidence | Permission evaluation, trace | Sessions, sim cmdlets, `Get-WinEvent` |
| T05 | Tickets, persistence, case 01 | Campaign engine, predicates, scoring | Save and resume, case 01 |
| T06 | Workspace shell | Layout, top bar, terminal | Inbox, ticket, hints, criteria, debrief |
| T07 | Directory GUI | Tree, properties, audit log | Editors, access inspector, parity |
| T08 | Cases 02 and 03 | Case 02 | Case 03 |
| T09 | Cases 04 and 05 | Case 05 | Case 04, Tier 1 flow |
| T10 | Acceptance and delivery | Large fixture, perf run | Browser tests, README, report |

First hands-on moment: after T06 you can close case 01 in the browser with the terminal. After T07 you can close it with the GUI.

## One-time setup

Download `ad-shield-roleswap-pack.zip`, then run this in Terminal:

```bash
mkdir -p ~/Projects && cd ~/Projects
unzip ~/Downloads/ad-shield-roleswap-pack.zip
cd ad-shield
git init -b main
git add -A
git commit -m "Add AD Shield spec and Role-Swap task pack"
```

Then open `docs/roleswap/DECISIONS.md`, change any default you disagree with, and commit the change.

## Running a task

1. Start from an up-to-date `main`.

    ```bash
    cd ~/Projects/ad-shield && git switch main
    ```

2. Start the swap. Change the task number and file name for each task.

    ```bash
    swap "AD Shield T01. Follow docs/roleswap/T01-scaffold-domain.md. Use its slug, split, files, contract, and checks as written."
    ```

3. Claude shows the split. Reply `OK`.
4. When Claude asks for the Codex audit of Part 2, type the `/codex:adversarial-review` line it gives you.
5. When Claude reports `phase: DONE`, merge the task branch. The branch name is `task/` plus the slug at the top of the brief.

    ```bash
    git switch main && git merge --ff-only task/t01-scaffold-domain
    ```

6. Run the next task.

Swap commands for all ten tasks:

```bash
swap "AD Shield T01. Follow docs/roleswap/T01-scaffold-domain.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T02. Follow docs/roleswap/T02-ps-language.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T03. Follow docs/roleswap/T03-ad-cmdlets.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T04. Follow docs/roleswap/T04-access-sessions.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T05. Follow docs/roleswap/T05-tickets-persist.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T06. Follow docs/roleswap/T06-workspace-shell.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T07. Follow docs/roleswap/T07-directory-gui.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T08. Follow docs/roleswap/T08-cases-02-03.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T09. Follow docs/roleswap/T09-cases-04-05.md. Use its slug, split, files, contract, and checks as written."
swap "AD Shield T10. Follow docs/roleswap/T10-acceptance.md. Use its slug, split, files, contract, and checks as written."
```

## Codex usage

Each task uses about two to four Codex jobs: the Part 1 build, possibly a fix round, the Part 2 audit, possibly a re-review. Ten tasks is roughly 20 to 40 Codex jobs. Run T01 first and look at how much of your Codex window it used before planning the rest of the week.

If Codex hits its limit mid-task, the Role-Swap rules mark the task `BLOCKED (quota)` and Claude stops. After the reset time, open Claude Code in the project folder and say: "Continue the Role-Swap from HANDOFF_STATE.md."

Part 1 is kept smaller than Part 2 in most tasks for this reason. If a Part 1 still runs out, ask Claude to split that Part 1 in two and log it as a decision.

## What you approve

- The split at the start of each task.
- Any `X#` dispute Claude brings to you.
- Every push. Nothing is pushed until you say so.

## What the slice does not include

- Cases 06 through 16. The app says so after case 05, and the acceptance report lists them as not shipped.
- Group Policy, fine-grained password policy, Recycle Bin, service accounts, directory ACL delegation, Windows LAPS, hybrid sync, Kerberos ticket and Entra token modeling.
- The matching cmdlets. See `COVERAGE.md` for the full list and `BACKLOG.md` for the follow-up tasks.
