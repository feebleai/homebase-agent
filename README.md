# Homebase for AI agents

Everything an AI client needs to use Homebase, the asset library for AI agents: the Homebase **skill** (how to use the product), a **plugin** that packages the skill with the MCP server and slash commands, and **marketplace** files so Claude Code and Codex can install it with one command. The command-line tool is [`homebase-cli`](https://www.npmjs.com/package/homebase-cli) on npm.

```
skills/homebase/                    the skill
  SKILL.md                          what Homebase is, when to use it, search/upload/bucket workflows, safety rules, errors
  references/cli.md                 every CLI command and its JSON output
  references/mcp-tools.md           the MCP tools, mapped to the CLI
  references/setup.md               installing, logging in, connecting each client
  agents/openai.yaml                Codex display metadata (ignored elsewhere)
  assets/, LICENSE                  icons and license
plugins/homebase/                   one plugin folder for Claude Code, Codex and Cursor
  .claude-plugin/plugin.json        Claude Code manifest (MCP server inline, type http)
  plugin.json                       Agent Plugins 1.0 manifest (Codex, Cursor) + com.openai interface
  mcp.json                          Agent Plugins MCP config (streamable-http)
  commands/{find,upload,connect,status}.md   /homebase:* slash commands (Claude Code)
  skills/homebase/                  the skill, plus scripts/homebase.mjs (the bundled CLI)
  assets/                           logo.png (512), icon.png (192), logo.svg
  README.md, LICENSE                the plugin's README and MIT license
.claude-plugin/marketplace.json     Claude Code marketplace (Cursor reads it too)
.agents/plugins/marketplace.json    Codex marketplace
CHANGELOG.md, LICENSE               one changelog for the CLI and plugin; MIT
```

Without a shell (claude.ai, ChatGPT) the skill uses the Homebase MCP tools. With a shell (Claude Code, Codex) it uses whichever takes fewer calls: the MCP tools or the `homebase` CLI for reads, and always the CLI for uploads (one call, no `curl`) and downloads. The CLI prints one JSON document per command. No global install is needed: the plugin ships the CLI inside the skill folder. Claude Code commands run it as `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs"`, and Codex resolves `scripts/homebase.mjs` relative to SKILL.md. (Not a top-level `bin/`: Claude Code would put that on the PATH, but claude.ai and Cowork refuse to install plugins that have one.) Anywhere else with Node 20 or newer, `npx -y homebase-cli <command>` runs the same CLI.

## Install

| Client | How |
|---|---|
| **Claude Code** | `claude plugin marketplace add feebleai/homebase-agent`, then `claude plugin install homebase@homebase` (or `/plugin marketplace add feebleai/homebase-agent` and `/plugin install homebase@homebase` inside a session). You get the skill, the bundled CLI, the MCP server and `/homebase:find`, `/homebase:upload`, `/homebase:connect` and `/homebase:status`. To try it for one session from a clone of this repo: `claude --plugin-dir plugins/homebase`. Authenticate the MCP server with `/mcp` → homebase → Authenticate; over SSH, `claude mcp login plugin:homebase:homebase --no-browser` and paste the redirect URL back. For the skill alone, copy `skills/homebase` to `~/.claude/skills/` or `<project>/.claude/skills/` |
| **Codex** (CLI and app) | `codex plugin marketplace add feebleai/homebase-agent`, then `codex plugin add homebase@homebase`. That installs the skill, the bundled CLI and the MCP server; then `codex mcp login homebase` (OAuth; `--no-browser` over SSH). For the skill alone, copy `skills/homebase` to `~/.agents/skills/` (or `~/.codex/skills/`). For the MCP server alone, use `npx -y homebase-cli connect codex` |
| **Cursor** | `cursor-agent plugin marketplace add https://github.com/feebleai/homebase-agent`, or put the `plugins/homebase` folder in `~/.cursor/plugins/local/`. Cursor reads the Agent Plugins `plugin.json`. For the MCP server alone, run `npx -y homebase-cli connect cursor` (deeplink + `mcp.json` snippet) |
| **claude.ai / Claude Desktop** | Zip the skill folder so `homebase/SKILL.md` is at the top (from a clone: `cd skills && zip -r ../homebase-skill.zip homebase`), then upload it in **Customize → Skills → + → Create skill → Upload a skill** (needs Settings → Capabilities → code execution). Add the MCP server under **Customize → Connectors → Add custom connector** with `<api>/mcp`; `npx -y homebase-cli connect claude-ai` prints the steps and the URL |
| **ChatGPT** | There is no package to install. Go to **chatgpt.com/plugins → + → Create custom MCP server** with `<api>/mcp` and OAuth (`npx -y homebase-cli connect chatgpt`). Custom MCP servers need Developer mode: OpenAI's help center lists it for Business, Enterprise and Edu (an admin allows it; members turn it on in Settings → Apps → Advanced settings). If **Create custom MCP server** is missing, turn Developer mode on first. Optionally, upload the same skill zip as for claude.ai under **Skills → Create → Upload from your computer** |

## Headless and CI notes

- **Claude Code `-p`**: allow the Skill tool as well as specific commands, e.g. `--allowedTools "Skill" "Bash(homebase search *)" "Bash(homebase get *)"`, rather than all of `homebase`. If `Skill` isn't allowed, the skill is denied and the model may make up a reason. Never pre-allow `homebase delete` or `homebase login`.
- **Codex `exec`**:
  - Its approval policy is `never`, so MCP tools that would ask (`import_from_url`, `remove_from_bucket`, `delete_assets`) are refused. Approve specific tools in config: for the plugin's server under `[plugins."homebase@homebase".mcp_servers.homebase.tools.<tool>] approval_mode = "approve"` (not `[mcp_servers.homebase…]`, which only applies to a server added with `homebase connect codex`). Details in `skills/homebase/references/setup.md`.
  - Shell commands (the CLI) need `--sandbox workspace-write` and `sandbox_workspace_write.network_access = true`.
  - Close stdin (`< /dev/null`) in scripts.
- An MCP connector that shows "needs auth" doesn't affect the CLI. The skill says so, because a model once took the connector state as the reason the CLI couldn't work.

## Issues and contributions

This repository is published from Homebase's main source on every release (`v<version>` tags), so changes made here directly would be overwritten. Report problems and suggestions in [Issues](https://github.com/feebleai/homebase-agent/issues).
