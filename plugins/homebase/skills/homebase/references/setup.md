# Connecting to Homebase

These steps are for the user. An agent can run the CLI parts once the user agrees, but a person approves every login in the browser, and picks the workspace and permissions there.

The MCP server is at `<api>/mcp` (today `https://next-caribou-11.convex.site/mcp`). `homebase connect <client>` returns the steps below as JSON, and applies them with `--write` once the user agrees.

## Claude

| Client | Setup |
|---|---|
| **Claude Code** | Install the plugin: `claude plugin marketplace add feebleai/homebase-agent`, then `claude plugin install homebase@homebase`. It brings this skill, the MCP server, the `/homebase:*` commands and a bundled copy of the CLI (no global install needed). Then run `/mcp`, pick **homebase** and choose **Authenticate**. Over SSH or headless: `claude mcp login plugin:homebase:homebase --no-browser`, open the printed link on any machine, approve, and paste the redirect URL back. Without the plugin: `claude mcp add --transport http --scope user homebase <url>` (what `homebase connect claude-code` runs), then `/mcp` or `claude mcp login homebase --no-browser`. For CI, add the server with a Settings key instead: `claude mcp add --transport http --scope user homebase <url> --header "Authorization: Bearer $HOMEBASE_TOKEN"` |
| **claude.ai / Claude Desktop** | **Customize → Connectors**, then **+** → **Add custom connector**, with the URL. Click **Connect** and approve in the Homebase window. On Team/Enterprise an owner adds it first in the organization's connector settings. Optionally add this skill under **Customize → Skills** (upload `homebase-skill.zip`) |

### Claude Code permissions

Allow the specific commands you want to run without prompts rather than everything (`Bash(homebase *)`). For example, read-only plus uploads:

```json
{ "permissions": { "allow": [
  "Bash(homebase search *)", "Bash(homebase recent *)", "Bash(homebase get *)", "Bash(homebase view *)",
  "Bash(homebase buckets *)", "Bash(homebase bucket ls *)", "Bash(homebase whoami *)",
  "Bash(homebase upload *)", "Bash(homebase tag *)", "Skill", "Read"
] } }
```

Add `Bash(homebase import *)` or `Bash(homebase download *)` when you want those too. For the plugin's bundled copy, use the same subcommands in the form `Bash(node *homebase.mjs* search *)` (the trailing `*` after `.mjs` covers a quoted path). `Read` lets Claude look at the image `homebase view` saves. Never allow `homebase delete` or `homebase login` without a prompt. For MCP, allow read tools by name (`mcp__plugin_homebase_homebase__search_assets`, …) rather than the whole server. In `claude -p` scripts, allow `Skill` as well, or the skill can't load.

## OpenAI

| Client | Setup |
|---|---|
| **Codex** (CLI and app) | Install the plugin: `codex plugin marketplace add feebleai/homebase-agent`, then `codex plugin add homebase@homebase`. Then `codex mcp login homebase` (OAuth in the browser; add `--no-browser` over SSH and paste the callback URL). Without the plugin: `homebase connect codex` shows a diff adding `[mcp_servers.homebase] url = "…"` to `config.toml`, `homebase connect codex --write` writes it, and then you run `codex mcp login homebase`. `homebase connect codex --token` uses a Settings key from `$HOMEBASE_TOKEN` instead (`bearer_token_env_var`) |
| **ChatGPT** | Go to **chatgpt.com/plugins**, click **+**, then **Create custom MCP server**: name Homebase, the URL, authentication OAuth. Accept the risk notice, create it, and approve in the Homebase window. Custom MCP servers need **Developer mode**: OpenAI's help center lists it for Business, Enterprise and Edu (an admin allows it in workspace settings; members turn it on in Settings → Apps → Advanced settings). If you don't see **Create custom MCP server**, turn Developer mode on first. The skill can be uploaded under Skills → Create |

### Codex: headless runs (`codex exec`)

`codex exec` runs with approval policy `never`, so any MCP tool call that would ask for approval is refused ("MCP tool call requires approval, but approval policy is never"). Homebase's read tools and plain writes (tag, rename, buckets) don't ask. `import_from_url`, `remove_from_bucket` and `delete_assets` do, because they reach the web or remove things. To let a trusted headless job run a specific tool, approve it by name in `config.toml`. **Where the setting goes depends on where the server comes from:**

```toml
# Server from the Homebase plugin (codex plugin add homebase@homebase):
[plugins."homebase@homebase".mcp_servers.homebase.tools.import_from_url]
approval_mode = "approve"

# Server added by `homebase connect codex` ([mcp_servers.homebase] url = "…"):
[mcp_servers.homebase.tools.import_from_url]
approval_mode = "approve"
```

`approval_mode` is `auto` (the default: decided by the tool's annotations), `prompt`, `writes` or `approve`; `default_tools_approval_mode` sets it for every tool on the server. Don't auto-approve `delete_assets`: deleting needs the user's yes in a separate turn.

For a one-off run, the same works as a `-c` override, **without quotes around the plugin id** (Codex splits `-c` keys on dots and keeps quotes as part of the name):

```sh
codex exec -c 'plugins.homebase@homebase.mcp_servers.homebase.tools.import_from_url.approval_mode="approve"' "…"
```

Never use `-c mcp_servers.homebase.…` for the plugin's server: it creates a second, incomplete server entry and Codex stops with `Error loading config.toml: invalid transport`. (Verified with codex-cli 0.160.0: no config → "MCP tool call requires approval, but approval policy is never"; the plugin table or the unquoted `-c` → the call goes through.)

Also for `codex exec`: shell commands need `--sandbox workspace-write` with `sandbox_workspace_write.network_access = true` to reach Homebase through the CLI, and scripts should close stdin (`< /dev/null`). Uploads go through `homebase upload` (one call), so no MCP approval is needed for them.

## Cursor

`homebase connect cursor` prints a one-click `cursor://` install link and the `~/.cursor/mcp.json` entry.

## The CLI

1. Use the plugin's bundled copy (`node <skill folder>/scripts/homebase.mjs`), or install it: until it's published, `cd <homebase repo>/cli && npm link`. It needs Node 20 or newer.
2. `homebase login` opens Homebase in the browser and prints `login_started` with the `verification_url` at once. If the user is already signed in there, it's one click: the workspace and everyday permissions are preselected (still changeable), and Approve returns to the CLI on this computer, which prints `logged_in`. The login is stored in the OS keychain and renews itself (an hourly access token plus a rotating refresh token); Settings → Agents lists it as "Homebase CLI on <computer>" with Revoke.
   - Pick the workspace up front: `homebase login --workspace <slug>`. Ask for specific permissions: `--scopes search,assets:read`.
   - A second workspace: `homebase login --profile <name>`.
   - Over SSH, in CI or without a browser, the CLI switches to `homebase login --device` on its own: the user approves a code from any device.
   - An agent runs `homebase login` (it opens the browser on this computer) and relays `verification_url` from the first line in case the user needs it. If the user is on another device, or the agent's shell would time out, use `homebase login --device --no-wait`, show `verification_url` and `user_code`, and run `homebase login --resume` after they approve.
3. Check the setup with `homebase doctor`.
4. CI: create a key in Homebase Settings → Agents with only the permissions the job needs, and provide it as `HOMEBASE_TOKEN` from your CI's secret store. Don't put tokens in shell profiles or dotfiles. No CLI command ever prints a token.
5. `homebase logout` ends the login on the server and forgets it here.
6. A saved login is only ever sent to the API it was issued for. With `--api` or `HOMEBASE_API_URL` naming another server, the CLI needs a login for that server (or `HOMEBASE_TOKEN`) and otherwise stops with exit 2.

## Permissions

Each token or connection has its own permissions, chosen when it's approved:

| Permission | What it allows | On by default |
|---|---|---|
| `search` | search and read details | yes |
| `assets:read` | download | yes |
| `assets:write` | upload, add links, rename | yes |
| `tags:write` | tag | yes |
| `buckets:write` | manage buckets | yes (recommended) |
| `assets:delete` | soft delete and restore; owners and admins only | no |

You can see each connection in Settings → Agents, narrow or widen its permissions there, or revoke it.
