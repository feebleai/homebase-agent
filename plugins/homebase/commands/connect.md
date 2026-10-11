---
description: Check the Homebase connection (MCP, CLI login, permissions) and help connect another AI client
argument-hint: [claude-code | codex | cursor | claude-desktop | claude-ai | chatgpt]
allowed-tools: mcp__plugin_homebase_homebase__whoami, Bash(homebase doctor *), Bash(homebase connect *), Bash(node *homebase.mjs* doctor *), Bash(node *homebase.mjs* connect *)
---

Use the homebase skill to check and set up the user's Homebase connection. The client to connect, if any: $ARGUMENTS

Run the CLI as the bundled copy, `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" …` (written `homebase …` below), one plain command per call: no `command -v` checks, `&&`/`||` chains or pipes. Every command prints one JSON document.

1. If the Homebase MCP tools are connected, call `whoami` and summarise the workspace and permissions. If they show as needing authentication, tell the user to run `/mcp`, pick homebase and choose Authenticate (over SSH: `claude mcp login plugin:homebase:homebase --no-browser`, then paste the redirect URL back).
2. Run `homebase doctor` and summarise each check in one line.
3. If the CLI isn't logged in and the user wants it (uploads and downloads go through the CLI), explain that a person approves the login in the browser. With their OK, run `homebase login`, show them `verification_url` (and `user_code` for a device login), and wait for `logged_in`. Never print a token.
4. If a client was named, run `homebase connect <client>` and walk the user through `next_step`, the `diff` or the `steps`. Run it again with `--write` (which edits that client's config) only after the user has seen the plan and agreed.
