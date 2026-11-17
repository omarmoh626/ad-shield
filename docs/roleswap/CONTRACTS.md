# AD Shield contracts

Shared decisions that every task builds on. Both agents read this file before a task brief. A contract changes only through a `D#` entry in `HANDOFF_STATE.md`, and the builder updates this file in the same phase.

The type sketches show shape and names. Builders may add fields. Builders may not rename or remove a listed field without a `D#` entry.

## 1. Stack and commands

- Vite, React, TypeScript in strict mode. Static build to `dist/` with `base: './'`.
- Vitest for unit and component tests. Playwright for browser tests, added in T10.
- Runtime dependencies: `react`, `react-dom`. Anything else needs a `D#` entry.
- No backend, no login, no network calls at runtime. All assets are bundled locally.

| Command | Purpose | Added in |
| --- | --- | --- |
| `npm run dev` | Local dev server | T01 |
| `npm run build` | Static build to `dist/` | T01 |
| `npm run typecheck` | `tsc --noEmit` | T01 |
| `npm test` | `vitest run`; accepts a path filter, for example `npm test -- tests/ps` | T01 |
| `npm run guard` | Safety and purity greps, see section 2 | T01 |
| `npm run e2e` | Playwright browser tests | T10 |
| `npm run perf` | Performance run, prints p95 values | T10 |

## 2. Guard script

`npm run guard` exits non-zero when either grep prints a match.

- Safety: no `eval(`, `new Function`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `child_process`, or `import(` with a non-literal argument anywhere in `src/`.
- Purity: no `Date.now`, `new Date(`, `Math.random`, `setTimeout`, `setInterval`, `localStorage`, `window.`, or `document.` in `src/domain`, `src/engine`, `src/access`, `src/ps`, `src/tickets`.

`src/persist` may use `localStorage` through one adapter file. `src/ui` may use timers and the DOM.

## 3. Directory layout and owners

| Path | Holds | First built in |
| --- | --- | --- |
| `src/domain/` | Types, IDs, distinguished names, graph and indexes, clock, seeded generator | T01 P1 |
| `src/engine/` | Action union, dispatch pipeline, authorization, diff, audit event builders, handlers | T01 P2 |
| `src/fixtures/` | Base domain `corp.contoso.local`; large perf fixture | T01 P2, T10 P1 |
| `src/ps/` | Tokenizer, parser, registry, binder, runtime, formatter, cmdlets by module | T02, T03, T04 |
| `src/access/` | Security context, permission evaluation, access trace, sessions | T04 |
| `src/tickets/` | Ticket types, campaign engine, predicates, scoring, `cases/` | T05, T08, T09 |
| `src/persist/` | Save schema, storage adapter, migration, cross-tab sync | T05 P2 |
| `src/ui/` | Workspace, terminal, inbox, hints, directory, editors, inspectors, log | T06, T07 |
| `tests/` | Mirrors `src/` | every task |
| `e2e/` | Playwright specs | T10 |
| `docs/SUPPORT.md` | Command and module support list, simplifications, unimplemented syntax | T02 P2, updated by every later task |

## 4. Domain state

```ts
type Guid = string & { readonly __brand: 'Guid' };
type Sid = string & { readonly __brand: 'Sid' };

interface DirObject {
  guid: Guid;                 // stable for the object's whole life
  sid?: Sid;                  // security principals only; never reused
  objectClass: ObjectClass;   // 'user' | 'computer' | 'group' | 'organizationalUnit' | 'container' | 'domain' | ...
  rdn: string;                // unescaped name part, for example "Ali, Maya"
  parent: Guid | null;        // containment; the DN is derived from this chain
  attrs: Record<string, AttrValue>;
  rev: number;                // state revision of the last change to this object
}

interface DomainState {
  revision: number;           // +1 on every committed action
  now: number;                // lab clock, epoch milliseconds; never the real clock
  ids: { guidCounter: number; nextRid: number; rngState: number };
  objects: Record<Guid, DirObject>;
  memberships: Membership[];  // { group: Guid; member: Guid }
  resources: Record<string, Resource>;
  aces: Ace[];
  sessions: Session[];
  events: AuditEvent[];       // append-only inside an attempt
}
```

Rules:

- Distinguished names and display paths are derived from `parent`. They are never stored.
- New GUIDs and RIDs come from `state.ids`. The same seed and the same action log always produce the same IDs.
- A move or rename keeps `guid`, `sid`, and every membership.
- The primary group is the `primaryGroupID` attribute. It is not a row in `memberships`.
- Indexes exist for identity (GUID, SID, case-insensitive `sAMAccountName`, case-insensitive DN), parent to children, group to members, member to groups, and audit time. Every commit keeps them consistent.

## 5. Action pipeline

One pipeline serves the console, the GUI, and system events.

```ts
type Source = 'console' | 'gui' | 'system';

interface ActionCtx {
  actor: Guid;            // the analyst's operator account
  source: Source;
  whatIf: boolean;
  baseRevision?: number;  // GUI forms send the revision they opened against
}

interface ActionResult {
  ok: boolean;
  state: DomainState;     // the same reference as the input when nothing was committed
  events: AuditEvent[];
  diff: Change[];         // before and after per attribute or relationship
  warnings: ActionWarning[];
  error?: ActionError;    // 'notFound' | 'denied' | 'invalid' | 'conflict' | 'stale' | ...
}

function dispatch(state: DomainState, action: Action, ctx: ActionCtx): ActionResult;
```

Rules:

- `dispatch` is pure. It checks scope and authorization, commits a coherent result or nothing, appends events, and computes the diff.
- With `whatIf: true` the result carries the preview diff, the returned state is the input reference, and no event is appended.
- A GUI action is rejected with `stale` when any object it touches has `rev > baseRevision`. The caller keeps the draft.
- Cmdlets and GUI editors never change state directly. They build an `Action` and call `dispatch`.
- A partial result is `ok: true` plus a warning. Example: `user.create` when the password fails policy leaves a disabled account and returns a `passwordRejected` warning.

Tier 1 action types: `user.create`, `user.setAttrs`, `user.setEnabled`, `user.unlock`, `user.resetPassword`, `object.move`, `group.addMember`, `group.removeMember`, `acl.addEntry`, `acl.removeEntry`, `session.signIn`, `session.end`, `clock.advance`.

## 6. Audit events

```ts
interface AuditEvent {
  seq: number;
  time: number;                                // lab clock
  origin: 'windows' | 'entra' | 'simulator';   // shown as visibly different sources
  host?: string;                               // recording host
  log?: string;                                // for example 'Security'
  eventId?: number;                            // Windows events only
  actor?: Guid;
  target?: Guid;
  source: Source;                              // console, gui, or system
  data: Record<string, string>;
}
```

Windows event IDs in this slice: 4624 and 4625 on the recording host, 4720, 4740, 4767, and 4728, 4732, 4756 for additions to global, domain local, and universal security groups. Extra IDs are listed in `DECISIONS.md` D3.

## 7. PowerShell subset

```ts
interface CmdletSpec {
  name: string;                 // 'Get-ADUser'
  module: string;               // 'ActiveDirectory'
  aliases?: string[];
  parameterSets: ParameterSet[];
  inputTypes: string[];         // accepted pipeline type names
  outputType?: string;          // for example 'Microsoft.ActiveDirectory.Management.ADUser'
  defaultDisplay?: string[];    // property names for default output
  supportsWhatIf: boolean;
  confirmImpact: 'none' | 'low' | 'medium' | 'high';
  help: { synopsis: string; examples: { code: string; explain: string }[] };
  run(inv: Invocation, rt: Runtime): Iterable<PsValue>;
}
```

Rules:

- `parse(source)` runs first. If it returns any error, nothing is dispatched.
- The registry is the single source for tab completion, syntax highlighting, console help, and GUI equivalents.
- Every help example must execute in the simulator. A test iterates the registry and runs them all.
- Pipeline values are typed objects with a `typeName`. Formatting happens after the pipeline finishes.
- Secure input is requested through the runtime (`rt.readSecure(prompt)`). The value never enters the transcript, history, saved drafts, or state. Handlers receive a policy verdict and a new credential version only.
- Unknown commands and unsupported syntax return an error with a working `Get-Help` example. They change nothing.
- `run(source, rt, state): ConsoleResult` owns the transaction (T02 D9). The runtime threads `state` through the pure `dispatch` of section 5 itself, as the configured operator account with `source: 'console'`. The host supplies no dispatch hook. Cmdlets read `rt.state` and call `rt.dispatch(action, inv)`.
- `ConsoleResult` carries `output`, `errors`, `state`, `committed`, and an optional `pending`. `state` is the new domain state. It is the input reference, unchanged, when the input has a parse error or a name error, when the run is pending, and when no action changed anything. `run` never changes the state object it receives.
- `run` and the input hooks (`readLine`, `readSecure`, `confirm`) are synchronous (T02 D5, D8). An input hook returns `undefined` when the learner has not answered yet. `run` then returns `pending: { kind, prompt }` with the input `state`, empty `output`, `errors`, and `committed`, and it restores the runtime's variables, history, and transcript to their values before the run.
- The T06 terminal handles a prompt in the middle of a script by replay. When `run` returns `pending`, the terminal keeps its state, shows the prompt (a masked field labelled "simulated" for `secure`, a yes or no question for `confirm`), adds the answer to a queue, and calls `run` again with the same source and the same state. Each hook call takes the next answer from the queue. The terminal replaces its state with `result.state` only when `run` returns without `pending`. Replay is exact because the engine is pure and deterministic, so each action commits exactly once.
- For `secure`, the terminal checks the typed characters against the password policy, queues the verdict, and discards the characters before it calls `run` again. With no `confirm` hook, a change that needs confirmation is cancelled and the error names `-Confirm:$false` (T02 D6).

Modules: `ActiveDirectory`, `Microsoft.PowerShell.Core`, `Microsoft.PowerShell.Utility`, `Microsoft.PowerShell.Management`, `Microsoft.PowerShell.Diagnostics`, and `ADShield.Sim` for browser-only operations. `GroupPolicy`, `Microsoft.PowerShell.Security`, and the Graph module arrive with Tier 2 and Tier 3.

`ADShield.Sim` cmdlets in this slice: `Test-SimSignIn`, `Test-SimResourceAccess`, `Step-SimClock`, `Add-SimResourcePermission`, `Remove-SimResourcePermission`, `Get-SimTicket`, `Close-SimTicket`, `Reset-SimAttempt`. Each prints the word "simulated" in its output and has discoverable help.

## 8. Access and sessions

- A session holds a security context snapshot: user SID, group SIDs at issue time, issuer, issue time, and expiry or end time.
- A fresh sign-in builds a new context from current state. An existing session keeps its old context until it ends.
- Access evaluation takes a security context, a resource, and a requested right. For a share it evaluates the share layer and the file layer, and both must allow.
- The trace returns the membership path, the entries considered in evaluation order, the per-layer result, and the final result.
- Distribution groups never appear in a security context.

## 9. Tickets

```ts
interface TicketDef {
  id: string;                     // 'case01' ... stable
  tier: 1 | 2 | 3;
  seeds: number[];                // at least two
  build(seed: number): CaseFixture;
}

interface CaseFixture {
  ticketId: string;                // stable ID from TicketDef.id
  ids: Record<string, Guid>;      // one source for names, approvals, hints, routes, predicates
  introduce(base: DomainState): DomainState;
  request: TicketRequest;         // sender, priority, impact, SLA, read-screen story, evidence, and requester need
  responsibility: { account: string; outcome: string };
  predicates: Predicate[];        // outcome, control, evidence, and order checks
  hints: [Hint, Hint, Hint];      // level 3 uses routes.script
  routes: { script: ScriptStep[]; gui: GuiStep[] };
  wrongFixes: { name: string; steps: ScriptStep[]; expectUnmet: string[] }[];
  debrief(attempt: Attempt): Debrief;
  transfer: { question: string; choices?: string[]; answer: string; feedback: string };
}

interface TicketRequest {
  sender: string;
  priority: string;
  impact: string;
  sla: string;
  title: string;
  story: string;
  goal: string;                   // one sentence: outcome and constraint
  who: { person: string; account: string };
  alreadyChecked: string;
  clue: { text: string; eventId?: number };
  careful?: string;               // required when the case has a near-match or control object
  glossary: { term: string; definition: string }[];
  needs: string;
  evidence: string[];
}

interface Predicate {
  id: string;
  label: string;                  // plain-language checklist label (DESIGN section 6 Work)
  kind: 'outcome' | 'control' | 'evidence' | 'order';
  weight?: number;
  posture?: 'security' | 'availability'; // only tagged checks affect posture
  evaluate(state: DomainState, attempt: Attempt):
    { status: 'met' | 'unmet' | 'waiting'; observed: string; required: string };
}

interface CampaignState {
  base: DomainState;
  queue: string[];                 // TicketDef IDs only; no build functions in saved campaign state
  completed: string[];
  active?: Attempt;
  history: Attempt[];
  slaRemainingMs?: number;         // T06 D4: UI-only countdown for the active case; not domain time
}

// src/tickets/routes.ts (D4: moved out of engine.ts so the runtime -> engine import has no cycle)
function runScriptRoute(fixture: CaseFixture, steps?: ScriptStep[], base?: DomainState, seed?: number, input?: { readSecure?; confirm? }): RouteResult;
function runGuiRoute(fixture: CaseFixture, base?: DomainState, seed?: number): RouteResult;
// Helpers use fixture.ticketId and ids.operator; each returns closed plus live predicates.
// runGuiRoute dispatches with source 'gui' and baseRevision set to the attempt's current revision.

// D1 adds read-screen and transfer content; it does not rename existing contract fields.
// PredicateResult remains { status, observed, required } with status met | unmet | waiting.

interface ScriptStep { code: string; explain: string }
interface GuiStep { path: string[]; action: Action }   // path is what the learner clicks
```

Rules:

- Predicates grade state and evidence, never the commands typed. Valid alternate syntax and order must pass.
- Unit tests replay `routes.gui` through `dispatch` with `source: 'gui'`. Playwright clicks the same path in T10.
- One campaign case is active at a time. Inbox previews are read-only.
- A checkpoint is taken after a case is introduced and before the first change. Reset restores that state and clock and keeps earlier completions.
- A replay of a completed case runs on an isolated copy and cannot award a second completion.
- `-WhatIf` never awards progress.

## 10. Persistence

- One key: `adshield.v1`. Payload carries `schema`, campaign progress, case seed, lab clock, the committed action log since the checkpoint, and a writer revision.
- Load rebuilds the fixture from its seed and replays the action log.
- The UI shows saved, saving, or not saved.
- Malformed data, an unknown schema, and a full store each produce a visible notice and never a crash. A malformed payload is kept under a backup key before a new campaign starts.
- Two tabs: the tab holding the older writer revision becomes read-only and says so. A newer campaign is never overwritten silently.
