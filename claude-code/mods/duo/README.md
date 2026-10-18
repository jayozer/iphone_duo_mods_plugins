# duo: Claude Code phone mode for the iPhone Duo (v0.1)

A Claude Code mod for cloud sessions opened from the Claude iOS app.

## What it does
- **Turns on for the phone.** It activates when a `mobile` client attaches and opens a **Duo** pane. Use `/duo on|off|auto` to override; the choice is saved across sessions.
- **Fold-aware pane.** Folded (narrower than the breakpoint) it shows a status line, any pending approval and the quick-prompt buttons. Unfolded it adds two columns: recent tool calls on one side, files changed this turn on the other.
- **Quick-prompt deck.** One-tap buttons for Continue, Run tests, Fix error, Explain and Commit, since the phone can't show text fields inside mods. While Claude is working the deck becomes a **Stop** button.
- **Thumb approvals.** When a tool needs approval, the pane shows what it is and a risk label (reads only, writes files, runs a command, destructive or network). The **Reads: ask / Reads: auto** button auto-allows read-only tools (Read, Glob, Grep) while you're on the phone.
- **Compact tool rows.** Folded, each tool call in the transcript collapses to one line (`✓ Bash · npm test`).
- **Phone-style replies.** While a phone is attached, a short system-prompt section asks for short answers, narrow code and no wide tables.
- **Done notification.** Turns that take 30 seconds or more send a notification ("Finished in 84s, 3 files changed").

## Commands
`/duo status` · `/duo on` · `/duo off` · `/duo auto` · `/duo breakpoint <columns>` (default 56)

## Install
At the prompt of a terminal session:

```
/plugin install duo --marketplace jayozer/iphone_duo_mods_plugins
```

To try it from a clone, run `claude --plugin-dir claude-code/mods/duo`. Then open the session on your phone through Remote Control (`claude --plugin-dir claude-code/mods/duo --remote-control`).

To check it, run `claude plugin validate claude-code/mods/duo` and `claude plugin test claude-code/mods/duo` (4 tests).

## Known limits
- Approvals are still answered in the app's own permission prompt. A hook can't hold a decision open long enough to wait for a button press.
- The breakpoint of 56 columns is a guess. Run `/duo status` folded and unfolded on a real Duo and set the breakpoint between the two widths.
- Rotating the phone also changes the width, so the layout follows the width rather than the hinge.
