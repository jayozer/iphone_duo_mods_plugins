# duo-glance: see your Claude Code session at a glance on the iPhone Duo (v0.2.1)

It works alongside the [duo](../duo) mod, and you can also install it on its own.

## In the Claude app (Remote Control)
The Claude app joins a Remote Control session as a relay: it shows text but never draws a mod's panes. So in the app, send `/glance` and you get a short text summary instead:

```
Working 02:14 · Bash · npm test
Since your last message (6 min): 1 turn finished · 3 files changed
Tests failing · 9 passed, 2 failed
Waiting on you: Approve Bash · git push
Context 42% · Rate limit 30% · $0.84
Changed: app.ts, api.ts, app.test.ts
```

"Since your last message" counts from the last prompt you sent, from the app or the terminal. `/glance monitor` in the app gives the same text, since the monitor pane can't open there. The panes below are for a client that draws them.

## Away summary
When the Claude app on your phone leaves the session (you closed it or put the phone away), the mod starts counting what happens. When the phone opens the session again, a **While you were away** pane shows:
- how long you were gone, how many turns finished, which files changed and how many errors there were
- the latest test run, green or red, with pass and fail counts
- anything **waiting on you**, such as an approval or a question Claude asked

Its buttons are **Review changes** (Claude summarizes the changes file by file), **Monitor** and **Got it**. While you're away, a notification arrives whenever a turn finishes or something needs your OK. If nothing happened, no pane opens.

## Desk monitor
Run `/glance monitor`, or tap **Monitor**, then prop the Duo half-open next to your laptop. The monitor shows:
- a large timer for the running turn, and what Claude is doing right now
- the last test run in green or red
- context-window and rate-limit gauges (SVG bars on the phone, text on the terminal), and the cost so far

Folded, everything stacks in one column. Unfolded, it splits into status and gauges side by side.

## Commands
`/glance` or `/glance status` (the text summary) · `/glance monitor` · `/glance away` (starts counting now, useful for testing)

## Install
At the prompt of a terminal session:

```
/plugin install duo-glance --marketplace jayozer/iphone_duo_mods_plugins
```

To try it from a clone, run `claude --plugin-dir claude-code/mods/duo-glance --remote-control` and open the session from the Claude app on your phone. Run `claude plugin test claude-code/mods/duo-glance` for the tests (16 tests).

## Known limits
- The mod can't tell when the phone is half-folded, so you open the monitor yourself.
- Test runs are recognized by their command (npm/pnpm/yarn/bun test, pytest, jest, vitest, go/cargo test and others), and the pass and fail counts are read from the output text.
