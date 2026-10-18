# Codex

Codex has no mod API like Claude Code's hooks, so the Duo work for Codex is skills and custom prompts.

| Folder | What goes here | Installs to |
| --- | --- | --- |
| `skills/<name>/SKILL.md` | A skill: frontmatter `name` and `description`, then instructions | `~/.codex/skills/<name>/` |
| `prompts/<name>.md` | A custom prompt, run as `/<name>` | `~/.codex/prompts/` |

Install everything from a clone of this repo:

```sh
mkdir -p ~/.codex/skills ~/.codex/prompts
cp -R codex/skills/* ~/.codex/skills/
cp codex/prompts/*.md ~/.codex/prompts/ 2>/dev/null || true
```

## Contents
- `skills/duo-phone-style`: short, narrow replies for reading on the phone (the Codex side of the Duo mod's phone style).
