# Working in this repo

This repo holds mods, plugins and skills for Claude Code and Codex, all aimed at using them on the iPhone Duo. Read the root README for the layout.

- Claude Code entries live in `claude-code/mods/<name>` (function-hook mods) or `claude-code/plugins/<name>` (classic plugins). Each new one gets an entry in `.claude-plugin/marketplace.json`.
- Codex entries live in `codex/skills/<name>/SKILL.md` and `codex/prompts/<name>.md`.
- Mods target the `mobile` surface first, and that surface has no `Input` or `Select`, so all controls are buttons. Layout follows the width (`bodyColumns`): folded is about 40 columns, unfolded about 60.
- Before committing, run `scripts/check.sh` and make sure it passes.
- Never commit `.claude-plugin/types/` inside a mod: the engine regenerates it.
