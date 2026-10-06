---
description: Show which Homebase workspace you're connected to, your permissions, and this month's usage
allowed-tools: mcp__plugin_homebase_homebase__whoami, Bash(homebase whoami *), Bash(homebase profiles *), Bash(node *homebase.mjs* whoami *), Bash(node *homebase.mjs* profiles *)
---

If the Homebase MCP tools are available, call `whoami`. Otherwise run `homebase whoami --json` (and `homebase profiles --json` if there are several logins); if `homebase` isn't installed, use `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" whoami --json`. In a few lines, tell the user:
- the workspace and their role
- what this connection is allowed to do
- this month's usage against the limits, and when it resets

If it fails with an auth error (exit code 3), explain how to connect: `/mcp` → homebase → Authenticate for the MCP tools, or `homebase login` for the CLI.
