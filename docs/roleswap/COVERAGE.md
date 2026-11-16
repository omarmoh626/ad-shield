# Spec coverage for the first slice

Maps each part of `docs/SPEC.md` to the task that builds it. "Later" means `BACKLOG.md`.

## Build objective and the analyst's shift

| Spec item | Task |
| --- | --- |
| Static React and TypeScript app, local assets, no backend or login | T01 |
| Fictional data, in-memory mock credentials, "simulated" labels | T01 rules, T06, T07 |
| Local run instructions and automated checks | T01, T10 |
| Shift 1: read the request, terms defined on first use | T06 P2 |
| Shift 2: console, explorer, and logs share one account and one timeline | T06, T07 |
| Shift 3: three hint levels, run one line at a time, output explained | T05 P2 (content), T06 P2 (panel) |
| Shift 4: live criteria, close, debrief, transfer question, fresh variation | T05 P1, T06 P2 |
| Toasts, communications feed, pausable SLA clock, queued cases | T06 |
| Rank, posture, and active incidents kept distinct; completions counted once | T05 P1, T09 P2 |

## Ticket campaign

| Spec item | Task |
| --- | --- |
| Case 01 | T05 P2 (definition), T06 and T07 (playable by hand) |
| Case 02 | T08 P1 |
| Case 03 | T08 P2 |
| Case 04 | T09 P2 |
| Case 05 | T09 P1 |
| Cases 06 to 16 | Later |
| Two seeds per case, one set of fixture IDs | T05 contract, checked in every case task |
| Rank up to IAM Analyst | T09 P2 |
| Rank up to Identity Security Engineer | Later |

## Identity behavior

| Spec item | Task |
| --- | --- |
| Sign-in and access; fresh sign-in versus existing context | T04 |
| Containers, accounts, groups, default container, partial create result | T01 P2, T03 P2 |
| Group scopes, nesting, distribution versus security | T01 P2, T04 P1 |
| Access inspector with share and file layers | T04 P1 (engine), T07 P2 (view) |
| GPO trace | Later |
| Fine-grained password policy resolution | Later |
| Service identities, SPN, gMSA, LAPS | Later |
| Recycle Bin recovery | Later |
| Domain sessions with issue and end times; deterministic clock; Advance lab time | T04 P2, T06 P1 |
| Kerberos ticket, Entra token, and app session modeling | Later |
| Hybrid source of authority and connector | Later |
| Windows events 4624, 4625, 4720, 4740, 4767, 4728, 4732, 4756 | T01 P2, T04 P2 |
| Entra sign-in records | Later (the `origin` field is ready for them) |
| Replication metadata | Later |

## PowerShell contract

| Spec item | Task |
| --- | --- |
| Tokenizer, parser, binder, typed pipeline, registry | T02 |
| Completion, highlighting, help, and GUI equivalents from the registry | T02 P2, T06 P1, T07 P2 |
| Discovery row | T02 P2 |
| Grammar row | T02; AD filter forms in T03 P1 |
| Directory administration row | T03 |
| Policy, recovery, and evidence row: `Get-WinEvent` | T04 P2 |
| Policy, recovery, and evidence row: everything else | Later |
| Cloud row: Graph command | Later |
| Cloud row: `Test-SimResourceAccess` and other sim cmdlets | T04 P2, T05 P1 |
| Cloud row: `Add-SimCaseEvidence` | Later |
| Execution row: `-WhatIf`, confirmation, formatting, partial failures, secure input, redaction | T02 P2, T03 P2, T06 P1 |
| Discovery route the walkthrough never shows (`$u \| Get-Member`) | T03 P1 |
| Splatted creation resolves the same container | T03 P2 |
| No learner input to a shell, network, or evaluator | T01 guard script, every audit |

## State, mistakes, and persistence

| Spec item | Task |
| --- | --- |
| Normalized graph, GUIDs, SIDs, typed relationships, indexes, derived paths | T01 P1 |
| Console-created user appears in the right container | T01 P2, T07 P1 |
| One set of action handlers for terminal and GUI; diff; predicates rerun | T01 P2, T05 P1 |
| GUI form revision and stale-save conflict with draft kept | T01 P2, T07 P2 |
| Versioned localStorage, seed rebuild, malformed saves, migration, full storage, two tabs, save status | T05 P2, T06 P1 (status) |
| Checkpoint, one active case, read-only previews, reset, replay, resume after reload | T05 |
| Case 08 service outage and repair | Later |
| Before and after diff for the attempt | T07 P2 |

## Workspace and grading

| Spec item | Task |
| --- | --- |
| Dark, keyboard-accessible, responsive four-region workspace; narrow tabs | T06 P1 |
| Terminal, script pad, history, suggestions, readable errors | T06 P1 |
| Directory, properties, memberships, audit log | T07 P1 |
| ADUC editors, context menus with keyboard and button alternatives | T07 P2 |
| Access inspector view | T07 P2 |
| Policy, recovery, and Entra views | Later |
| Ticket representation and grading rules | T05, T08, T09 |
| Ordered-event grading (service cutover) | Helper in T05 P1; first real use is Later |

## Acceptance and delivery

| Spec item | Task |
| --- | --- |
| 1. Every ticket, both routes, both seeds, wrong fix, control | Unit level in T05, T08, T09; browser level in T10 P2; Tier 1 only |
| 2. Parity, duplicate names, escaped comma, mixed case, invalid parameters, pipelines, splatting, default creation, partial failure, dry run | T01, T02, T03, T07, T10 |
| 3. Refresh, stale editor, competing tabs, storage failure, reset, replay | T05 P2, T07 P2, T10 P2 |
| 4. Delayed and negative outcomes | Case 04 line in T09 and T10; lines for cases 06, 08, 11, 16 are Later |
| 5. 2,000 objects, 10,000 events, p95 under 200 ms, narrow and keyboard paths | T07 P1, T10 |
| 6. Build, source, run command, support list, actual results, gaps named | T10 P2 |
