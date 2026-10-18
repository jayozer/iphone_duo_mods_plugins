# Claude Code

| Folder | What goes here |
| --- | --- |
| `mods/<name>/` | Mods: function-hook plugins that change Claude Code's own interface or behaviour (panes, buttons, tool and prompt hooks) |
| `plugins/<name>/` | Classic plugins: skills, slash commands, agents, settings hooks, MCP servers |

Every entry is a folder with `.claude-plugin/plugin.json` and is listed in the repo's `.claude-plugin/marketplace.json`, which is what makes it installable.

## Adding one
1. Create `mods/<name>/` (or `plugins/<name>/`) with its `.claude-plugin/plugin.json`. For a mod, add `hooks/hooks.json` naming `./register.tsx`, the hooks module, its `types/index.d.ts` contract if it keeps state, and `tests/*.test.ts`.
2. Add `{ "name": "<name>", "source": "./claude-code/mods/<name>" }` to `plugins` in `.claude-plugin/marketplace.json`.
3. Run `scripts/check.sh` from the repo root.

While developing, run `claude --plugin-dir claude-code/mods/<name>` to load it from disk.

## Contents
- `mods/duo`: phone mode for the iPhone Duo. See [its README](mods/duo/README.md).
- `mods/duo-glance`: an away summary and a desk monitor. See [its README](mods/duo-glance/README.md).
