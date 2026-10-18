# Claude Code mod ideas for the iPhone Duo

## What we're designing for

**The device** (from Apple's launch coverage, Sept 2026): Apple's first foldable, book style. The outer screen is 5.4" and the inner screen is a 7.6" single panel; both have the same aspect ratio. It can sit half-folded ("smart tripod", DS-style), runs a Duo-specific iOS 27 with side-by-side apps, puts the dock on the right edge, has Touch ID in the side button and Pencil support coming later this year. It costs $1,999 and shipped October 23.

**How Claude Code reaches it.** On a phone, Claude Code runs in the Claude iOS app (the Code tab, Remote Control, or a cloud session like this one). To a mod, that is the **`mobile` surface**. These are the parts of this build's mod API (v2.1.302 types) that matter:

| Fact | Consequence for the mod |
| --- | --- |
| `mobile` draws `Box, Text, Button, Svg, Link, Code, Markdown`, with **no `Input`, `Select` or `Client`** | Every control has to be a button. Text entry stays in the app's own prompt box. |
| Every `ui.render` carries `e.surface` and `e.viewport.columns/rows`, and a **width change redraws** | Fold and unfold change the width, so the mod can tell the outer screen from the inner one with no device API. |
| `session.attach` / `session.detach` fire with `{ surface: "mobile", clientId, viewport }`. `$.session.surfaces()` lists every surface the session is drawing on | The mod knows when the phone joins or leaves, even while a laptop terminal is also attached. |
| Mobile reports `isFullscreen: false`, so a pane opens as a takeover, not a sidebar | Use bands above the prompt and short panes. Don't plan a docked sidebar. |
| `$.ui.notify`, `$.ui.toast`, `$.ui.status`, `$.ui.copy({ surface })` | Push notifications can reach the phone while it's closed in a pocket. |
| `$.audio.play` / `speak` play only on a macOS host | Sound won't come out of the phone. Skip audio features. |

**Detecting the Duo.** No API reports "this is a Duo." These three checks together work:
1. `surface === "mobile"`. Nothing else on this list can turn on without it.
2. **Width signature:** two widths seen for one `clientId` with a ratio of about 1.4:1 (5.4" vs 7.6", same aspect ratio). The first fold and unfold calibrates them, and the mod stores both widths in `$.store`, so later sessions recognize the device right away.
3. **Manual switch:** a `/duo on|off|auto` command, stored in `$.store`, as an override.

## Mod ideas

### 1. Fold-aware layout (the core feature, ★ recommended first build)
- **Folded (outer, ~5.4")**: a one-line band with the current step, a progress dot and a button for the next action. Tool rows collapse to one line each (the `ToolUse` render hook), and diffs show as `+12 −3 · file.ts` with a button to expand.
- **Unfolded (inner, ~7.6")**: a two-column band. The left column shows the plan or todo list, and the right column shows the live tool or diff. Code blocks get full width, and the full diff renders with `Code format: 'diff'`.
- Switching happens automatically on each redraw, because fold state is just a change in `viewport.columns`.

### 2. Thumb approvals
- When a permission prompt or `AskUserQuestion` comes up, the band shows large **Allow once / Always / Deny** buttons, placed toward the right edge to match the Duo's right-hand dock.
- On the outer screen, it summarizes what's being asked in one line. A Haiku-class `$.model.classify` labels the risk as safe, writes files, or network/destructive, so the person can decide one-handed.

### 3. Pocket mode / "close the book"
- When the phone detaches (`session.detach`) or the outer screen goes idle, the mod switches to **notify-only**: it pushes a `$.ui.notify` when a turn finishes, a test fails, or the session needs approval, and stays quiet otherwise.
- When the phone reattaches, a band shows "While you were away: 3 files changed, tests green, 1 question waiting," with buttons to jump to each item.

### 4. Quick-prompt deck (since mobile has no Input)
- A row of buttons on the outer screen (**Continue · Run tests · Explain this · Fix the error · Commit · Undo last**). Each one submits a canned prompt through a `prompt.submit` rewrite or a slash command.
- The deck learns from repetition: prompts the person types often get promoted to buttons, saved in `$.store`.

### 5. Tent / tripod "build monitor"
- When the phone is half-open and propped up (the inner screen with no prompt activity for a while), the mod opens a glanceable pane with large text: current step, elapsed time, test pass/fail counts, context-window fill (`$.session.usage()`) and cost.
- It's meant to sit on the desk beside a laptop while Claude works in the laptop's terminal. Both attach to the same session, and the phone becomes a second monitor.

### 6. Diff reader for the big screen
- When unfolded, `/review` opens a pane that pages through the turn's changed files, one file per "page" (Prev / Next buttons, like turning pages in a book), with Approve-file and Ask-about-this buttons.

### 7. Phone-friendly output style
- A `prompt.compose` hook adds a session section when the surface is mobile: shorter replies, no wide tables, code blocks under about 60 columns when folded, summary first.
- It changes with the fold: terse when folded, normal when unfolded.

### 8. Copy and hand-off buttons
- Buttons next to commands, URLs and error text call `$.ui.copy({ surface: 'mobile' })`, so the text lands on the phone's clipboard to paste into another app in Duo split view (Slack, Notes, Safari).

## Suggested v0.1 scope
Ideas **1 + 2 + 3** plus the `/duo` toggle. Together they cover detection, the fold-aware layout and the most common phone task (approving while away) in one mod. Ideas 4 and 7 are cheap additions for v0.2.

## Open questions for you
- Will you mostly use it as a remote for a laptop session (Remote Control), or for cloud sessions started from the phone? Remote use favors ideas 3 and 5; cloud sessions favor 1 and 4.
- The width numbers are estimates until someone opens a session on a real Duo. The calibration step handles that, but one real reading would let us set sensible defaults.

Sources: [Tom's Guide](https://www.tomsguide.com/phones/iphones/iphone-duo-is-official-price-release-date-specs-and-everything-you-need-to-know), [PetaPixel](https://petapixel.com/2026/09/09/apples-iphone-duo-argues-no-other-foldable-has-gotten-it-right/), Claude Code mod API types (build 2.1.302).
