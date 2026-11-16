# AD Shield project rules (Claude Code + Codex)

These rules add to the global Role-Swap rules. `CLAUDE.md` and `AGENTS.md` hold the same text. Keep them identical.

## Read order

1. `HANDOFF_STATE.md`, when it exists.
2. `docs/roleswap/CONTRACTS.md`.
3. The current task brief in `docs/roleswap/` (one `T##-*.md` file).
4. `docs/SPEC.md`, only the sections the brief names. Find them with `grep -n '^###' docs/SPEC.md`.

Do not read other task briefs unless the current brief points to one.

## Safety rules

- Learner input must never reach `eval`, `new Function`, a host shell, or the network. Do not add `fetch`, `XMLHttpRequest`, `WebSocket`, or a dynamic import of learner text anywhere in `src/`.
- Never store, log, or persist a password value. Keep credential state and version only. Redact secure input from transcripts, command history, and saved drafts.
- All people, hosts, tenants, and events are fictional. Show the word "simulated" wherever a learner could mistake an action for a real sign-in, password, or service operation.
- Code in `src/domain`, `src/engine`, `src/access`, `src/ps`, and `src/tickets` is pure and deterministic. Time comes from the lab clock in state. Randomness comes from the seeded generator. Real timers are allowed only in `src/ui`.
- `npm run guard` enforces the first and fourth rules. Never weaken that script to make a check pass.

## Scope rules

- Build only what the current brief lists. Tier 2 and Tier 3 work is in `docs/roleswap/BACKLOG.md` and is out of scope for this slice.
- A contract in `CONTRACTS.md` changes only through a `D#` entry in `HANDOFF_STATE.md`, and the builder updates `CONTRACTS.md` in the same phase.
- New runtime dependencies need a `D#` entry. Dev dependencies for testing are fine.

## Honesty rules

- Never mark a check as passed unless you ran it in this session. Report an unrun check as unrun.
- Record simplified platform behavior and unimplemented syntax in `docs/SUPPORT.md` when you introduce it.
- A ticket counts as shipped only when its evidence, script route, GUI route, verifier, and debrief all work.
