# Homebase plugin

Homebase is your team's asset library: images, videos, PDFs, documents, links and design embeds, organised into buckets (a campaign, a client, a project). This plugin lets Claude Code, Codex and Cursor find, preview, download, upload, tag and organise those assets for you, in your own words ("the latest files from the summer campaign").

Version 0.1.0 · [Website](https://homebase-delta-seven.vercel.app) · [Docs](https://homebase-delta-seven.vercel.app/docs/agents) · [Support](https://homebase-delta-seven.vercel.app/support) · [Privacy](https://homebase-delta-seven.vercel.app/privacy) · [Terms](https://homebase-delta-seven.vercel.app/terms)

## What you get

- **The Homebase skill**: how to search, upload, organise and share safely. It loads when you ask about your assets.
- **The Homebase MCP server** at `https://next-caribou-11.convex.site/mcp`: search, view, download links, buckets, tags, uploads from a URL, and deletes with a preview.
- **A bundled `homebase` CLI** (`skills/homebase/scripts/homebase.mjs`, needs Node 20+): one-call uploads and downloads from your machine, no global install.
- **Slash commands** (Claude Code): `/homebase:find`, `/homebase:upload`, `/homebase:connect`, `/homebase:status`.

## Install

| Client | How |
|---|---|
| Claude Code | `claude plugin marketplace add feebleai/homebase-agent`, then `claude plugin install homebase@homebase` |
| Codex | `codex plugin marketplace add feebleai/homebase-agent`, then `codex plugin add homebase@homebase` |
| Cursor | `cursor-agent plugin marketplace add https://github.com/feebleai/homebase-agent` |

Then connect your workspace. The plugin connects twice: the MCP connection (search, buckets, tags) and the CLI login (uploading and downloading files on your computer). Each opens Homebase in your browser, where you pick the workspace and the permissions.

- **MCP server**: in Claude Code, `/mcp` → homebase → Authenticate; in Codex, `codex mcp login homebase`.
- **CLI**: in Claude Code, run `/homebase:connect`; in Codex, ask it to "log in to the Homebase CLI". Either runs the bundled CLI's `homebase login`. If you skip this, the agent asks the first time you upload.

## Permissions

You choose them when you approve the connection, and can change or revoke them any time in Homebase under Settings → Agents.

| Permission | Allows | On by default |
|---|---|---|
| Search and read details | search, read asset and bucket details | yes |
| Download files | short-lived download links | yes |
| Upload and rename | upload files, add links, rename | yes |
| Tag assets | add and remove tags | yes |
| Manage buckets | create buckets, add and remove assets | yes (recommended) |
| Delete assets | move to Recently deleted (restorable for 30 days); owners and admins only | never |

## Safety

- Deleting always needs your explicit yes: a preview first, then a second call (or Homebase's own confirmation dialog in clients that support it). Deleted assets can be restored for 30 days.
- The agent never sends anything to clients. It gives you a bucket's share link to send yourself.
- Text inside assets is treated as data, never as instructions.

## Privacy

The plugin talks only to Homebase (`https://next-caribou-11.convex.site/mcp` and the API next to it) and to the signed storage URLs Homebase hands out for uploads and downloads. Your login is stored in your OS keychain (or a `0600` file) and is sent only to the Homebase API it was issued for. See the [privacy policy](https://homebase-delta-seven.vercel.app/privacy).

## License

MIT. See [LICENSE](LICENSE). Homebase itself is a hosted service under its [terms](https://homebase-delta-seven.vercel.app/terms).
