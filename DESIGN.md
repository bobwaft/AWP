# AWP — Design Spec

**Direction:** a dark, tactical, precision-instrument UI built around a 3D sniper rifle. The rifle is the app's map: each stage lives on a part of the rifle, and the camera follows the bullet's journey as AWP "one-shots" the project. Working screens are crisp 2D panels layered over a dimmed 3D scene.

---

## 1. Design principles

1. **The rifle is the navigator, not the workspace.** 3D shows where you are; 2D panels are where you work.
2. **Precision over decoration.** Thin lines, exact alignment, HUD-style labels, generous dark space.
3. **Progress is physical.** Phase progress = the bullet's position in the barrel. Readiness = a scope reticle closing in.
4. **Always readable.** Every panel meets WCAG AA contrast; the 3D scene never sits behind body text at more than 15% opacity.
5. **Motion explains, never delays.** Camera moves run ≤ 1.2 s and can be skipped with any key or click.

## 2. The 3D rifle

### 2.1 Model requirements
- **Original model only.** Do not use, extract, or trace Valve's CS:GO/CS2 AWP model or textures.
- **Built in Blender by Claude via Blender MCP** (`ahujasid/mcp-for-blender`, see REGISTRY.md G10), as a stylized, original bolt-action long-range rifle. Allowed inputs: procedural or hand-modelled geometry, Blender's own materials, and CC0 textures/HDRIs (e.g. Poly Haven). **Not allowed:** Sketchfab or other downloaded models, and AI-generated meshes (e.g. Hyper3D) unless their terms are checked and allow redistribution under MIT. Record every external asset and its license in `assets/3d/SOURCES.md`.
- Format: glTF binary (`.glb`), Draco-compressed, ≤ 5 MB, ≤ 80k triangles, PBR materials, baked AO.
- Livery: gunmetal and matte graphite with tracer-orange accent details (not the green game livery).
- Named nodes, so code can target parts: `case`, `bolt`, `round`, `scope`, `bipod`, `rail`, `barrel`, `safety`, `muzzle`, `bullet`, `target`.
- The barrel interior has a spline (`barrel_path`) the bullet follows; the target sits on a separate scene object down-range.

### 2.2 Stage → part map ("load → aim → fire")

| # | Stage | Rifle part | Scene moment |
|---|---|---|---|
| 1 | Setup | Case / assembly | Rifle parts lie in an open case and snap together as accounts connect |
| 2 | Ideation | Chambering the round | Round slides into the chamber; bolt closes when PRD has zero blocking questions |
| 3 | Design | Scope | Camera pushes into the scope; reticle shows the chosen theme's palette |
| 4 | Planning | Bipod / zeroing | Bipod deploys; scope turrets click as phases are defined (one click per phase) |
| 5 | Connectors | Rail attachments | Approved tools appear as attachments mounting onto the rail |
| 6 | Implementation | Barrel | Bullet travels down the barrel; rifling segments = phases; bullet advances as each phase completes |
| 7 | Testing | Scope check | Camera looks through the scope at the bullet's path; failed checks show as drift marks |
| 8 | Security | Safety catch | Safety switches from SAFE to FIRE when the security report is clean or accepted |
| 9 | Polishing | Muzzle | Muzzle brake comes into focus; revisions appear as fine adjustments |
| 10 | Shipping | Target hit | Slow-motion shot exits the muzzle, flies down-range, hits center; summary card reveals |

Each stage hotspot on the rifle shows a state: locked (dim steel), current (tracer-orange pulse), done (solid steel with check), stale (amber outline, when an earlier spec changed).

### 2.3 Camera
- One camera preset per stage: `{ position, target, fov }`, stored in `src/scene/cameraPresets.ts`.
- Transitions: GSAP timeline, 1.2 s, `power3.inOut`. Any input skips to the end state.
- Implementation stage: camera rides a follow-cam on the bullet along `barrel_path`; bullet position = completed phases / total phases.
  - Phased mode: the bullet advances one rifling segment per passed phase and rests between phases.
  - One-shot mode: the bullet moves continuously as phases build, with a faint tracer trail behind it. A halt freezes it mid-barrel with a `--warning` marker.
- Idle: slow 0.5°/s orbit on the home view only; never during work.

### 2.4 Lighting and rendering
- Dark studio HDRI at low intensity, one cool key light, one tracer-orange rim light.
- Post-processing: subtle bloom on orange accents only; light vignette. No depth of field during work screens.
- Render with react-three-fiber; scene lazy-loaded after the first 2D paint.

### 2.5 Performance fallback (2D mode)
- On launch, detect GPU tier (e.g. `detect-gpu`). Tier 0–1 → start in 2D mode.
- If the scene runs under 45 fps for 3 s, show a toast offering 2D mode.
- Settings → Display → "3D scene / 2D mode / Reduced motion".
- **2D mode** replaces the scene with a static, blueprint-style SVG rifle diagram with the same hotspots and states. Progress shows as a bullet icon moving along a 2D barrel.
- **Reduced motion** (also follows the OS setting): no camera flights; cross-fades of 150 ms; no idle orbit.

## 3. Layout

### 3.1 Home (project open)
```
┌──────────────────────────────────────────────────────────────┐
│ Top bar: AWP · Project name · Stage 4/10 · Claude ● · Usage   │
├────┬─────────────────────────────────────────────────────────┤
│ S  │                                                         │
│ t  │              3D rifle (full bleed)                      │
│ a  │         hotspots on parts; click to enter stage         │
│ g  │                                                         │
│ e  │                                                         │
│    │   [ Continue: Planning → ]                              │
│ r  │                                                         │
│ a  │                                                         │
│ i  │                                                         │
│ l  │                                                         │
└────┴─────────────────────────────────────────────────────────┘
```

### 3.2 Stage work view (Ideation, Design, Planning)
```
┌──────────────────────────────────────────────────────────────┐
│ Top bar                                                      │
├────┬────────────────────────┬────────────────────────────────┤
│ S  │ Chat (interview)       │ Live spec: PRD.md              │
│ t  │  …messages…            │ [Edit] [Preview] [Diff]        │
│ a  │  [Form summary card]   │                                │
│ g  ├────────────────────────┤                                │
│ e  │ FORM · FEATURE SPEC    │                                │
│    │  Name  [__________]    │                                │
│    │  Story [__________]    │                                │
│    │  Criteria + Add        │                                │
│    │ [Submit] Answer in chat│                                │
│    ├────────────────────────┤                                │
│    │ Open questions (3)     │ Readiness ◎ 72                 │
│    │ ● blocking  ○ optional │ [Complete stage] (disabled)    │
├────┴────────────────────────┴────────────────────────────────┤
│ Terminal drawer (collapsed: 28 px bar · Ctrl+`)               │
└──────────────────────────────────────────────────────────────┘
        3D scene behind panels at 15% opacity, 8px blur
```
- Chat column 40%, spec column 60%, resizable, min 360 px each.
- **Input dock** (bottom of the chat column) shows the chat composer by default. When the agent calls `request_form`, the dock swaps to the form, up to 60% of the column height with its own scroll. The chat history stays visible above it. "Answer in chat instead" swaps back. Only one form can be open, because the agent waits on it. Flow rules are in §3.5.
- Submitted forms collapse into a **form summary card** in the chat history (title, 3–5 key values, "Edit" reopens it prefilled).
- Fields sit in one column, with labels above inputs and help text below. Required fields are marked with a label, not color alone. Errors show inline on blur and on submit, and focus jumps to the first error.
- The Design stage's design-schema form uses rich fields: color pickers with a live contrast readout, a font picker with pairing preview, and sliders for density, radius and motion. The spec column previews the result live.
- Stage rail: 56 px wide collapsed, 220 px expanded; 10 entries, each a mono stage number + label.

### 3.3 Implementation + Testing view
- Header: execution mode segmented control `Phased | One-shot` (Phased preselected; switching mid-run shows "Applies after the current phase").
- Left: phase list as barrel segments (vertical), current phase highlighted.
- Center: agent run stream (steps, tool calls, files changed, commands), with Stop.
- Right: test checklist for the finished phase; bug cards below.

### 3.4 Terminal
- **Drawer** at the bottom of every screen: collapsed to a 28 px bar (`TERMINAL` HUD label, tab count), toggled with `` Ctrl+` ``, and resizable from 160 px up to 70% of window height. Tabs show shell + folder. A "+" opens a new tab, and "Open Claude Code here" starts `claude` in a new tab.
- **Setup inline panel:** in Setup, the terminal sits beside the status cards instead of in the drawer. "Fix in terminal" types the command at the prompt with a highlighted `Press Enter to run` hint. When the command exits, its status card re-checks and animates to the new state.
- Uses Geist Mono 13/18. The ANSI palette is derived from theme tokens, with separate light and dark sets, all 16 colors meeting AA against the terminal background. The terminal never sits over the 3D scene (opaque `--bg-1`).

### 3.5 Flows (Intent pass, 2026-10-15)
Assumption to validate in dogfooding (about 5 users): the primary user is only moderately comfortable with terminals and may never have used `winget` or `gh`.

**Setup flow**
1. On first launch, Setup opens with the cards in dependency order: **Required**: Git → Claude Code (installed) → Claude Code (signed in). **Optional** (collapsed group, neutral styling, "Not needed yet"): GitHub CLI, Semgrep. Optional items are offered again in context when a stage needs them (Ship asks for `gh`, Security for Semgrep).
2. Card states: `checking` → `missing` | `needs sign-in` | `outdated` (outside the tested version range) | `ready` | `error`. Each non-ready state has one primary action, "Fix in terminal", plus "Do it manually" (plain steps + official download link). Status is always text + icon, never color alone.
3. **Fix in terminal** opens a *new* tab named after the fix (e.g. `Setup · Claude Code`) and pre-types a command from AWP's built-in fix list. The same command is shown on the card with one sentence on what it does and where it comes from ("Installs Claude Code using Anthropic's official installer"). Enter is never pressed for the user.
4. While a fix tab is open, its card is `waiting` and re-runs detection every 3 s and when the command exits. There's also a manual "Re-check". This covers interactive logins (`claude` then `/login`, `gh auth login`) that never exit or that open a browser.
5. Windows: detection re-reads `PATH` from the registry (user + machine) instead of the stale process env, so a fresh install is found without restarting AWP. Each fix gets a fresh tab with the refreshed env.
6. On `ready`, the card shows what was found: version, and for sign-ins **which account and plan** will be used.
7. On a non-zero exit, the card says "That didn't finish. The terminal shows what happened" and lists 1–2 common fixes (e.g. "winget isn't available: use Do it manually").
8. **Continue to Ideation** is enabled when all Required cards are `ready`. Optional ones never block.
- Only AWP's fix list and the user can type into a terminal; **agents have no tool that writes to a PTY** (blocks prompt-injected commands).
- "Open Claude Code here" sessions run outside AWP's orchestration. Spec edits made there are caught by the spec watcher and appear as user edits (with stale propagation); AWP shows "Changes made outside AWP were detected" on return.

**Input dock flow (chat + forms)**
1. The agent chooses the input mode per question. **Form** only when the answer has a known shape with 3+ fields (templates or ad-hoc). **`ask_user` with choices** for single questions. **Chat** for open-ended talk. At most one form per interview turn.
2. The agent prefills from earlier answers. AI-filled values carry a small `from your earlier answer` marker until the user touches them.
3. When a form arrives, it is announced politely ("AWP is asking for: Feature spec"). Focus moves to its first field only if the user isn't typing in the composer.
4. Every required field has **"Not sure, help me"**. Choosing it either lets the agent propose a value (shown as a marked suggestion) or records an open question for the critic (blocking if the field fills a required section).
5. **"Ask about this form"** (a single line under the form) sends a chat message without leaving the form. The agent answers in chat and re-sends the form with the draft intact.
6. Submit: `Ctrl+Enter` or the button. Errors show inline, and focus goes to the first error. `Esc` never discards a form.
7. "Answer in chat instead" returns to the composer. That template isn't offered again during this stage visit unless the user asks for it.
8. Submitted forms collapse into a summary card. **Edit** reopens the form prefilled from the spec section as it is *now* (hand edits win), and resubmitting shows the spec diff.
9. If the run stops or crashes while a form is open, the draft stays and the dock offers "Continue this form". On submit it is sent to the next run as structured data.
- Ordering rules: the **design-schema** form opens *after* a theme is picked, prefilled with that theme for tweaking, never blank. The **bug-report** form opens prefilled from the failed checklist item (steps, expected); the user writes only what actually happened. **Feature spec** handles one feature per form, with "Add another feature" on its summary card.

### 3.6 Window sizes
- Minimum window 1100 × 700. Optimized for 1440 × 900 and up.

## 4. Design tokens

**Light and dark themes ship in v1.** Settings → Display → Theme: `System` (default, follows the OS) / `Dark` / `Light`, applied as `data-theme` on `<html>`. Both themes use the same token names; only values change. Tokens live in `src/styles/tokens.css` and are mirrored in `tokens.json` (`{ dark: {...}, light: {...} }`).

### 4.0 Light theme rules
- Dark is the reference identity (§4.1). Light is a "daylight range" version: warm off-white and paper-grey surfaces with graphite text. Keep the thin lines, HUD labels and tight radii.
- **Contrast constraints to solve:** tracer orange `#FF6B1A` is about 2.9:1 on white and scope cyan `#4FD1C5` is lower still, so neither may carry text or thin icons in light mode. Light mode needs a deeper accent for text and accent-filled buttons, keeping the bright orange only for large fills, the bullet and glows. Status colors also need darker light-mode variants.
- 3D scene in light mode: light studio backdrop, softer key light, orange rim light kept. The 2D rifle diagram switches from a blueprint look to an ink-on-paper look.
- **Light token values are defined in Phase 1 with Impeccable** (visual design belongs to Impeccable per CLAUDE.md), checked for AA, and then recorded in §4.1 as a second column.

### 4.1 Color

Dark values below; light values TBD in Phase 1 (§4.0).

| Token | Hex (dark) | Use |
|---|---|---|
| `--bg-0` | `#0B0D0F` | App background, scene clear color |
| `--bg-1` | `#121519` | Panels |
| `--bg-2` | `#1A1E23` | Raised surfaces, inputs, cards |
| `--bg-3` | `#232830` | Hover, selected rows |
| `--line` | `#2A3038` | Borders, dividers |
| `--line-strong` | `#3A424C` | Focused borders |
| `--text-1` | `#E8EAED` | Primary text |
| `--text-2` | `#A3ABB5` | Secondary text |
| `--text-3` | `#6B7480` | Hints, disabled |
| `--steel` | `#8A949E` | Done states, inactive hotspots |
| `--accent` | `#FF6B1A` | Tracer orange: primary actions, current stage, bullet |
| `--accent-dim` | `#FF6B1A26` | Accent fills at 15% |
| `--scope` | `#4FD1C5` | Scope glass cyan: links, focus rings, info |
| `--success` | `#3DD68C` | Pass, clean scan |
| `--warning` | `#F5B83D` | Stale specs, non-blocking questions, medium findings |
| `--danger` | `#F2555A` | Fail, blocking questions, high findings |

Rules: one accent-filled button per view. Orange is never used for errors. Status always pairs color with an icon or label.

### 4.2 Typography
- **UI:** Geist Sans (OFL). **Code, labels, numbers:** Geist Mono (OFL).
- Scale (px / line-height): 12/16, 13/18, 14/20 (body), 16/24, 20/28, 24/32, 32/40, 48/56 (ship screen only).
- HUD labels: Geist Mono 11–12 px, uppercase, letter-spacing 0.08em, `--text-2`. Example: `STAGE 04 · PLANNING`.
- Markdown preview uses 15/24 body with max line length 72ch.

### 4.3 Spacing, radius, elevation
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 4 (inputs, chips), 8 (cards, panels), 999 (pills). Keep corners tight; no large rounded blobs.
- Elevation by border + background, not heavy shadows: panels use `1px solid var(--line)`; overlays add `0 8px 32px #00000080`.

### 4.4 Iconography
- Lucide icons, 16 px in UI, 1.5 px stroke. Stage icons are custom line icons of each rifle part, same stroke.

## 5. Motion

| Use | Duration | Easing | Library |
|---|---|---|---|
| Hover, press | 120 ms | `power1.out` | CSS |
| Panel open/close, tab switch | 240 ms | `power2.out` | GSAP |
| Camera between stages | 1200 ms | `power3.inOut` | GSAP + R3F |
| Bullet advance per phase | 800 ms | `power2.inOut` | GSAP |
| Ship shot | 3–4 s total, skippable | custom timeline | GSAP |
| Long scrolling (docs, logs) | — | — | Lenis (smooth scroll in Markdown preview only) |

Reduced motion: all transforms replaced by 150 ms opacity fades; camera jumps cut.

## 6. Components

| Component | Notes |
|---|---|
| `StageRail` | 10 entries; states locked/current/done/stale; keyboard 1–0 to jump |
| `RifleScene` | R3F canvas, hotspots, camera rig, 2D fallback swap |
| `RifleDiagram2D` | SVG fallback with identical hotspots |
| `ChatPanel` | Streaming messages, attachments (images, files), quick-reply chips for AWP questions |
| `SpecPanel` | CodeMirror 6 Markdown editor, preview, diff view of AI edits (accept/reject per hunk) |
| `QuestionList` | Open questions grouped blocking / non-blocking; answering one sends it to chat |
| `ReadinessReticle` | Circular scope reticle; ring fills 0–100; turns success at 100 and 0 blocking |
| `ThemeCard` | Design stage proposal: name, palette swatches, type sample, mini component preview |
| `StackOption` | Planning stage option with trade-off table |
| `PhaseBarrel` | Vertical list of phases styled as barrel segments with progress; shows `built` (One-shot, untested) distinct from `passed` |
| `InputDock` | Bottom of the chat column; holds the chat composer or the active form plus "Ask about this form"; "Continue this form" after an interrupted run |
| `SetupCard` | Tool status (checking / missing / needs sign-in / outdated / waiting / ready / error), command preview, Fix in terminal, Do it manually, detected version + account |
| `FormCard` | Renders a `request_form` schema (text, longtext, number, boolean, select, multiselect, color, font, file, url, list); validation, drafts, Submit / Answer in chat instead |
| `FormSummaryCard` | Collapsed submitted form in the chat history; Edit reopens it prefilled |
| `TerminalDrawer` | xterm.js tabs, resize, `` Ctrl+` ``, "Open Claude Code here"; inline variant in Setup |
| `ThemeSwitch` | System / Dark / Light in Settings → Display |
| `ModeSwitch` | `Phased \| One-shot` segmented control with a one-line explanation of each |
| `SuggestionCard` | Connectors stage item: why it fits, cost, license, source; Approve / Reject |
| `AgentRunStream` | Step list, tool calls, diffs, terminal output; Stop button; agent + model badge |
| `TestChecklist` | Items with Pass / Fail, notes, screenshot attach |
| `BugCard` | Bug ID, severity chip, status, linked phase |
| `FindingRow` | Security finding: severity, tool, file:line, fix action |
| `UsageMeter` | Tokens and cost per stage/phase |
| `CommandPalette` | Cmd/Ctrl+K: jump to stage, open spec, run action |
| `Toast` | Bottom-right, 4 s, stacks to 3 |

## 7. Voice and copy
- Plain, short, active. "Answer 3 blocking questions to continue." not "Please kindly resolve...".
- Rifle language only in stage names, scene captions, and the ship moment. Buttons stay literal: "Complete stage", "Approve", "Run phase".
- Never claim a project is "secure" or "legal"; say "No issues found by these checks".

## 8. Accessibility
- All hotspots and stage actions reachable without the 3D scene (stage rail + command palette).
- Focus ring: 2 px `--scope`, 2 px offset.
- Screen-reader labels on hotspots ("Stage 3, Design, done").
- Minimum hit target 32 × 32 px.
- Forms: every field has a programmatic label; errors are announced (`aria-live`); the whole form is keyboard-operable, including color and font pickers (text input fallback).
- Terminal: focus is trapped in the terminal only while it is focused; `` Ctrl+` `` and `Esc Esc` return focus to the app. Screen-reader mode is enabled in xterm.js.
- Both themes meet WCAG AA.
- Setup never requires the terminal: every fix has a "Do it manually" path that works with a screen reader.

## 9. Assets checklist
- [ ] Original rifle `.glb` with named nodes and `barrel_path` spline (built via Blender MCP; `.blend` source and `assets/3d/SOURCES.md` committed)
- [ ] Target model and down-range environment
- [ ] 2D SVG rifle diagram with matching hotspots
- [ ] 10 stage line icons
- [ ] App icon (original mark; not a game logo)
- [ ] Sounds: bolt click, round chambering, safety switch, shot, target hit. Off by default; toggle in Settings → Display. Free-use sources only (CC0 preferred, e.g. Freesound CC0 or Kenney); each file and its license listed in `assets/audio/SOURCES.md` and `THIRD_PARTY_NOTICES.md`

## 10. Open questions
- ~~Light theme~~ Decided: in v1, values defined in Phase 1 (§4.0).
- ~~Intent pass on Setup + input dock~~ Done (§3.5). Wireframes for both screens can follow with `/wireframe` before Phases 4 and 6 if wanted.
- ~~Sound effects~~ Decided: include, free-use sources, off by default (§9).
- ~~Who builds the rifle model~~ Decided: Claude via Blender MCP (§2.1).
