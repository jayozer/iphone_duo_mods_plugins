# iPhone Duo mods and plugins

Mods, plugins and skills that make coding agents work well on the iPhone Duo, Apple's foldable (5.4" outer screen, 7.6" inner screen). The repo covers both **Claude Code** and **Codex**.

```
.claude-plugin/marketplace.json   Claude Code marketplace: lists every installable entry
claude-code/
  mods/<name>/                    function-hook mods (panes, buttons, tool and prompt hooks)
  plugins/<name>/                 classic plugins (skills, commands, agents, MCP servers)
codex/
  skills/<name>/SKILL.md          Codex skills
  prompts/<name>.md               Codex custom prompts
docs/                             design notes and research
scripts/check.sh                  validates and tests every Claude Code entry
```

## What's here

| Name | For | What it does |
| --- | --- | --- |
| [duo](claude-code/mods/duo) | Claude Code | Phone mode: a fold-aware pane, one-tap prompts, thumb approvals, compact tool rows |
| [duo-phone-style](codex/skills/duo-phone-style) | Codex | Short, narrow replies for reading on the phone |

## Install

**Claude Code**, at the prompt of a terminal session:

```
/plugin install duo --marketplace jayozer/iphone_duo_mods_plugins
```

Or from a shell, `claude plugin install duo --marketplace jayozer/iphone_duo_mods_plugins`. Answer `y` to add the marketplace, then pick a scope. To try a mod straight from a clone, run `claude --plugin-dir claude-code/mods/duo`.

**Codex:** see [codex/README.md](codex/README.md).

## Developing

Run `scripts/check.sh` before pushing. It runs `claude plugin validate` and `claude plugin test` on every Claude Code entry and validates the marketplace. [claude-code/README.md](claude-code/README.md) and [codex/README.md](codex/README.md) explain how to add a new entry.
