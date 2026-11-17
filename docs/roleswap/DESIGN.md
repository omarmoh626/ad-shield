# AD Shield design

This file is the approved look and layout for AD Shield. It applies to all UI work in T06 through T10. Omar approved it on 2026-11-17 from the v3 mockups.

Mockup canvas (for Omar; agents cannot open it): https://claude.ai/artifact/1iipVqWUwh2VdL7H9P2Wee, page "v3 · dark, calm".

Where this file and a task brief disagree about how the UI looks or where things sit, this file wins. Where it disagrees with `docs/SPEC.md` about layout, this file wins too: Omar changed the layout on purpose, and the changes are listed in section 9. It never removes a feature the spec requires. Section 8 says where each required feature lives.

## 1. Principles

1. **One thing at a time.** A learner sees the ticket first, then one work area. Panels the learner is not using stay behind a tab or a button.
2. **Calm dark, not scary dark.** Blue-gray slate, never pure black. One accent color. Orange only for "not yet" and warnings.
3. **It looks like an IT tool, not a course.** Monospace ticket IDs, event IDs, domain badge, SLA timer, a real-looking directory and console.
4. **Plain words first, technical words second.** "Maya's account is unlocked" before `LockedOut False`. Every new term is defined on first use.
5. **Status is never color alone.** Every status has a text label.

## 2. Color tokens

Define these once as CSS custom properties in `src/ui/theme.css`. Components use the variables, never raw hex values.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#161C25` | Page background |
| `--panel` | `#1D2430` | Cards, header, tree, details |
| `--border` | `#2F3A49` | Card and input borders |
| `--code-bg` | `#121821` | Inline code, chips, tab track, disabled buttons |
| `--console-bg` | `#0F151D` | Console and code blocks |
| `--console-input-bg` | `#0B1118` | Console input |
| `--console-note-bg` | `#18212C` | "What this means" box inside the console |
| `--console-divider` | `#243041` | Lines inside the console |
| `--text` | `#E7ECF2` | Main text |
| `--text-soft` | `#C3CCD8` | Secondary text |
| `--text-muted` | `#9AA6B5` | Labels, timestamps, hints |
| `--accent` | `#38BDF8` | Primary buttons, current step, done checks, selection |
| `--on-accent` | `#0B1220` | Text on accent |
| `--accent-soft` | `#17324A` | Goal card, success banner, current step pill |
| `--accent-text` | `#8FD3FF` | Text on `--accent-soft`, links |
| `--warn-soft` | `#3A2E21` | Warning card background |
| `--warn-text` | `#F4B266` | "Not yet", warnings, careful notes |
| Console syntax | cmdlet `#8EC5FF`, parameter `#D6B4FF`, string `#A8D8A8`, prompt and comments `#8A96A8`, output `#E3E8EF` | Console and code blocks |

Rules:

- Done and met are accent blue. Not yet and unmet are orange. Never use red and green to tell states apart.
- Waiting for propagation uses `--text-muted` with the word "Waiting".
- Errors in the console use `--warn-text` with a text prefix such as `Error:`. There is no red in the palette.
- All text pairs above were picked for at least 4.5:1 contrast. Keep it that way when adding colors.

## 3. Type, spacing, shape

- UI font: Inter, 400/500/600/700. Monospace: JetBrains Mono, 400/600. Bundle both locally; no network fonts at runtime.
- Base size 15px, line height 1.55. Page title 34px/700. Card title 16–20px/700. Labels 12–13px uppercase with 0.06em letter spacing.
- Monospace for: ticket IDs (`INC-01`), event IDs, sign-in names, distinguished names, the domain badge, times in the SLA timer, all console text.
- Spacing scale: 4, 6, 8, 10, 12, 14, 16, 18, 24, 28, 40 px.
- Radius: 6px chips, 9–12px buttons and inputs, 14px cards, 16px console and large cards, 999px pills.
- Touch targets at least 44px tall. Primary buttons 46–48px.
- Focus ring: 2px `--accent` outline with 2px offset on every focusable element.
- Icons: inline stroke SVG, 1.8–2.4 stroke width. No emoji. Decorative icons get `aria-hidden="true"`.

## 4. Screen flow

Each case moves through four steps shown in the header step bar: **Read → Investigate → Fix → Verify**, then the debrief. The step bar shows progress only. It never locks the learner out of a step.

| Screen | Mockup | When |
| --- | --- | --- |
| Inbox | not mocked; use the list style from v1 with v3 tokens | Landing screen and between cases |
| Read | A | A case was just opened |
| Work (Investigate, Fix, Verify) | B and C | After "Start investigating" |
| Debrief | D | After "Finish case" succeeds |
| Narrow screens | E | Below 760px wide |

## 5. Header (all screens)

Left to right, wrapping on narrow screens:

1. Shield icon, "AD Shield", the case ID chip in monospace, and the case title in muted text. On the inbox: the domain badge `corp.contoso.local · simulated` instead of the case.
2. Step bar: four pills. Done steps show a check icon. The current step is a filled `--accent-soft` pill with `aria-current="step"`.
3. Clock group: `SLA 00:41:12` in monospace, a **Pause** button, and **Advance lab time** when the case uses lab time.
4. **Progress button.** Its label shows rank and posture, for example `Helpdesk · 82%`. It opens a panel with rank, posture with the list of failing checks, and active incident count, as three separate values.
5. Save status as text: "Saved", "Saving…", or "Not saved".

## 6. Screens

### Read (mockup A)

Centered column, max 860px wide.

- Meta line: case ID chip, "New ticket from the Service Desk" (the real sender), a priority pill, and the SLA.
- Title in plain words: what is wrong and why it matters.
- One-paragraph story.
- **Your goal** card on `--accent-soft`: one sentence with the business outcome and any constraint.
- Three small cards: **Who** (person and sign-in name), **Already checked** (approval or identity verification), **Clue** (the evidence, with its event ID chip).
- A **Careful** card on `--warn-soft` when the case has a near-match or a control object.
- **New words in this ticket** as a collapsed `<details>` with each term defined.
- Messages from the requester and others (the communications feed for this case) appear below, oldest first.
- Primary button **Start investigating** and the note "Stuck? Hints open one level at a time, whenever you want."

### Work (mockups B and C)

Two columns, max 1320px wide: a left rail (300–340px) and the work area.

Left rail, top to bottom:

1. **Your goal** card.
2. **What done looks like** checklist: one row per predicate. Each row: icon, plain-language label, status text ("Done", "Done just now", "Not yet", "Waiting"). A row that needs a learner action can carry one button, for example **Test her sign-in**. Show observed versus required in a second line when a predicate is unmet and the learner opens the row.
3. **Finish case** button, disabled with "N to go" until every predicate is met.
4. **Stuck?** card with one button, **Show hint 1 of 3**. Opening a level replaces the button with the hint and a button for the next level. Level 3 shows the step-by-step script player (run one line, see the result, read what it means, then next) and the matching GUI steps.
5. **Re-read the ticket** link.
6. **Reset this attempt** as a quiet text button at the bottom, with a confirmation.

Work area:

- A segmented tab control: **PowerShell**, **Directory**, **Evidence** (with an item count). This replaces the spec's PowerShell/GUI toggle. A one-line helper text sits beside it.
- **PowerShell tab:** the console card. Header "PowerShell" and "Practice console · simulated". Transcript with syntax colors. After each command's output, a **What this means** box in plain words. Input row with the `PS C:\Lab>` prompt, a 46px input, and a **Run** button. Tab completion and history as in T06. A **Script pad** toggle in the console header switches the card to the multiline script pad.
- **Directory tab:** tree on the left (max 280px), details on the right. Tree shows the domain, OUs, and default containers, with each object's type in text ("Person", "Group", "Computer", "OU", "Container"). Details: name, sign-in name, tabs **General**, **Account**, **Groups**, then the editors. Editors save with explicit buttons. After a save: a success banner on `--accent-soft` with the event ID and "simulated", and a **Same change in PowerShell** box with the generated command and **Copy**. A stale save shows a warning card with what changed and keeps the draft.
- **Evidence tab:** audit log first (filters for text, source, event ID; source shown as text: Windows, Entra, Simulator), then the access inspector, then any case-specific views. Event IDs and hosts in monospace.

### Debrief (mockup D)

Centered column, max 900px wide.

- "Case N of 5 in Tier 1 · first time solved" (or "replay, not counted").
- Title: what the learner achieved, in plain words.
- A numbered timeline of what the learner actually did, each with lab time, a plain sentence, and the event ID. Built from attempt history.
- Two cards: **What you left alone** and **Saved to your cheat sheet** (with **Copy**).
- **Quick check:** the transfer question as radio options, then feedback.
- **Next ticket** primary button and **Try this case again, new details** secondary button.

### Narrow screens (mockup E)

Below 760px:

- Compact header: icon, case ID chip, case title, SLA.
- A line with the current step and checklist progress ("3 of 5 done"), which opens the checklist.
- One segmented tab row: **Ticket**, **PowerShell**, **Directory**, **Evidence**.
- The console keeps its input pinned to the bottom.
- Switching tabs keeps the active object, the terminal draft, and the open ticket.

## 7. Copy and tone

- Address the learner as "you". Use the people's names from the ticket.
- Lead with the plain meaning, follow with the technical value: "Locked out: yes (`LockedOut True`)".
- Every new term gets a definition on first use: in "New words in this ticket" on the Read screen, and as a dotted-underline term elsewhere.
- Put "simulated" next to anything that looks like a real sign-in, password prompt, or service action.
- Do not invent scores or penalties the engine does not have.

## 8. Where each required feature lives

| Spec requirement | Location in this design |
| --- | --- |
| Inbox, queued cases, read-only previews | Inbox screen; previews open the Read screen in read-only mode |
| Messages and communications feed | Read screen, below the ticket; a dot on **Re-read the ticket** when a new message arrives |
| On-demand hints, three levels | **Stuck?** card in the left rail |
| Live criteria (met, unmet, waiting) | **What done looks like** checklist |
| Toasts | Bottom-right, `--panel` with border, text label, `role="status"` |
| Rank, posture with failing checks, active incidents | Progress button and panel in the header |
| PowerShell/GUI toggle | Work-area tabs: PowerShell and Directory |
| Directory, properties, group memberships, ADUC editors and context menus | Directory tab; context menus also offered as visible buttons |
| Access inspector, policy, recovery, Entra views | Evidence tab now; later views add sections or tabs there |
| Filterable audit log | Evidence tab |
| Terminal and multiline script pad | PowerShell tab, with the Script pad toggle |
| Pausable SLA clock, Advance lab time | Header clock group |
| Save status | Header |
| Before/after diff | Directory success banner links to it; full diff in Evidence |
| Debrief and transfer question | Debrief screen |

## 9. Deliberate changes from SPEC.md

These are Omar's decisions. Record them in `docs/SUPPORT.md` under design choices.

1. The four-region workspace (left inbox and hints, upper tools, lower terminal, top bar) becomes a Read screen plus a two-column Work screen with tabs. Reason: showing every panel at once overwhelmed a beginner.
2. The PowerShell/GUI toggle becomes the PowerShell and Directory tabs.
3. Rank, posture, and active incidents move into the Progress button, whose label still shows rank and posture.
4. The dark theme is a blue-gray slate (`--bg #161C25`), not near-black.
