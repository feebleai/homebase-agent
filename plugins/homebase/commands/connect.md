---
description: Check the Homebase connection (MCP, CLI login, permissions) and help connect another AI client
argument-hint: [claude-code | codex | cursor | claude-desktop | claude-ai | chatgpt]
allowed-tools: mcp__plugin_homebase_homebase__whoami, Bash(homebase doctor *), Bash(homebase connect *), Bash(node *homebase.mjs* doctor *), Bash(node *homebase.mjs* connect *)
---

Use the homebase skill to check and set up the user's Homebase connection. The client to connect, if any: $ARGUMENTS

The CLI below is `homebase`, or, if it isn't installed, the bundled copy: `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs"`.

1. If the Homebase MCP tools are available, call `whoami` and summarise the workspace and permissions. If they show as needing authentication, tell the user to run `/mcp`, pick homebase and choose Authenticate (over SSH: `claude mcp login plugin:homebase:homebase --no-browser`, then paste the redirect URL back).
2. Run `homebase doctor --json` and summarise each check in one line.
3. If the CLI isn't logged in and the user wants it, explain that the login happens in the browser. With their OK, run `homebase login --json --no-browser`, show them `verification_uri_complete` and `user_code`, and wait for the `logged_in` line. Never print the token, and never run `homebase token`.
4. If a client was named, run `homebase connect <client> --json` and walk the user through `next_step` or `steps`. Only pass `--yes` (which edits that client's config) after the user has seen the diff and agreed.
