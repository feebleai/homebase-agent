# Homebase for AI agents

[Homebase](https://homebase-delta-seven.vercel.app) is your team's asset library: brand files, campaign photos, decks, videos and links, organised into buckets that you share with clients. This repo lets AI agents use it well. It holds:

- **The Homebase skill** (`skills/homebase`). It teaches an agent what Homebase is, when to use it, how to search ("latest files from the summer campaign"), upload, tag and organise, and the safety rules: never delete without your explicit yes, and never send anything to a client.
- **A plugin** (`plugins/homebase`) for Claude Code, Codex and Cursor. It packages the skill, the Homebase MCP server, a bundled `homebase` CLI and the slash commands `/homebase:find`, `/homebase:upload`, `/homebase:connect` and `/homebase:status`.
- **Marketplace files**, so each client can install it with one command.

You need a Homebase account. The first time an agent connects, a browser window asks you to pick the workspace and the permissions it gets. You can revoke it any time in **Settings → Agents**.

MCP server: `https://next-caribou-11.convex.site/mcp`

## Install

### Claude (claude.ai, Claude Desktop, mobile)
1. **Customize → Connectors → Add custom connector.** Name it `Homebase`, paste the MCP URL above, then click **Connect** and approve in the browser.
2. Optional: download the skill zip from Homebase (**Settings → Agents → Download skill**) and upload it under **Customize → Skills**. Code execution must be on.

### ChatGPT (web and desktop)
**chatgpt.com/plugins → + → Create custom MCP server.** Paste the MCP URL, choose OAuth, then approve in the browser. On Business, Enterprise and Edu plans, an admin may need to allow Developer mode first.

### Claude Code
```bash
claude plugin marketplace add feebleai/homebase-agent
claude plugin install homebase@homebase
```
Then run `/mcp` → **homebase** → **Authenticate**. Over SSH, run `claude mcp login plugin:homebase:homebase --no-browser`.

If you only want the MCP server: `claude mcp add --scope user --transport http homebase https://next-caribou-11.convex.site/mcp`.

### Codex (CLI and app)
```bash
codex plugin marketplace add feebleai/homebase-agent
codex plugin add homebase@homebase
codex mcp login homebase
```

### Cursor
Add this repo as a plugin marketplace, or add the MCP URL under **Settings → MCP**.

### Any other MCP client
Use the MCP URL above. The server supports OAuth 2.1 (client ID metadata documents and dynamic client registration), or a key from **Settings → Agents** sent as `Authorization: Bearer`.

## The CLI
The plugin bundles the CLI at `plugins/homebase/skills/homebase/scripts/homebase.mjs` (Node 20+). Run `node <path>/homebase.mjs login`, then try `search "latest files from the summer campaign"`. Every command accepts `--json`. See `skills/homebase/references/cli.md`.

## Safety
- **Deletes** always show a preview first and need a confirmation in a separate turn. They move assets to Recently deleted (restorable for 30 days) and never delete permanently.
- **Agents never send anything to clients.** Client handoffs are drafted for a person to approve in Homebase.
- **Text inside assets is treated as data, never as instructions.**

This repo is generated from the Homebase monorepo. Please open issues here.
