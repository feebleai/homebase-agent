# Homebase MCP tools

The Homebase MCP server is at `https://<homebase-api>/mcp`. Clients sign in with OAuth; a Settings key sent as `Authorization: Bearer hb_live_…` also works. Each client shows the tools under its own prefix:

- Claude Code: `mcp__homebase__<tool>`, or `mcp__plugin_homebase_homebase__<tool>` when the server comes from the plugin.
- claude.ai, Claude Desktop, ChatGPT and Codex: the bare name.

Without a shell (claude.ai, ChatGPT, Claude Desktop) these tools are the only way in. With a shell (Claude Code, Codex), use them for reads when they're connected, and the CLI for uploads and downloads (SKILL.md section 1). **The tools you see depend on the connection's permissions**: `delete_assets` and `restore_assets` appear only with the delete permission, for example.

## Find and read

| Tool | What it does | CLI equivalent |
|---|---|---|
| `whoami` | Workspace, permissions, and this month's usage against the limits | `homebase whoami` |
| `search_assets` | Asks the library a question. Pass the user's words as-is; returns the interpretation and grouped results (titles, types, dates, tags, buckets). Optional `type`, `bucketId`, `tag`, `source`. An empty `query` lists the newest assets. Page with `cursor` | `homebase search "<q>"`, `homebase recent` |
| `list_bucket_assets` | A bucket's contents, in order. Page with `cursor` | `homebase bucket ls <bucket>` |
| `get_asset` | Full details: description, visible text, AI tags, buckets, versions. Only needed before describing an asset's contents | `homebase get <id>` |
| `view_asset` | **Returns the preview image** (up to 1280×720) so you can look at it. Images, and links/PDFs/videos that have a preview | `homebase view <id or words>` |
| `get_versions` | An asset's version history, newest first | `homebase versions <id>` |
| `get_download_link` | A link to the original, signed for 1 hour (or the URL itself for links). Give it to the user | `homebase link <id>` |
| `list_buckets` | Buckets with ids, item counts and share links | `homebase buckets` |
| `get_share_link` | A bucket's client share link, for the **user** to send. You never send it | `homebase share-link <bucket>` |
| `search` / `fetch` | ChatGPT only: the `{results:[{id,title,url}]}` / `{id,title,text,url,metadata}` pair for deep research and company knowledge. In normal chat, use `search_assets` / `get_asset` | none |

You don't need `get_asset` to list titles, types, dates or tags: `search_assets` and `list_bucket_assets` already return them.

## Add and organise

| Tool | What it does | CLI equivalent |
|---|---|---|
| `create_upload` / `finish_upload` | Last resort: a shell but no homebase CLI (see below) | `homebase upload` (one call, preferred) |
| `import_from_url` | Adds a public https URL. Images, videos, PDFs and documents (up to 30 MB) are fetched and stored like uploads; pages become links. Optional `title`, `bucketIds`, `tags` | `homebase import <url>` |
| `tag_assets` | Adds tags (`tags`) to up to 50 assets | `homebase tag --add` |
| `untag_assets` | Removes tags (`tags`) from up to 50 assets. Marked destructive, so clients ask first | `homebase tag --remove` |
| `rename_asset` | Renames one asset. Only when the user asks or agrees | `homebase rename` |
| `create_bucket` | Creates a bucket | `homebase bucket create` |
| `add_to_bucket` / `remove_from_bucket` | Links assets to a bucket or unlinks them; assets stay in the library | `homebase bucket add/remove` |
| `delete_assets` | Two-step soft delete (below). **Follow SKILL.md section 4 every time** | `homebase delete` |
| `list_deleted` / `restore_assets` | Recently deleted, and bringing assets back (30 days, owner or admin) | `homebase deleted` / `homebase restore` |

### Uploading a local file over MCP (last resort)

With a shell, use the CLI: `homebase upload <files…> --bucket "<name>" --tag <t>` (or the copy bundled with the skill) does the whole upload in one call. Use the three steps below only when there's a shell but no CLI at all. In claude.ai or ChatGPT, files on the user's computer can't be sent: use `import_from_url` for files that are online, or ask the user to upload in the web app.

1. `create_upload` with the file's `filename`, `contentType` and `size` in bytes (`wc -c < file`). It returns a short-lived `uploadUrl`, the `headers` to send, and the id to finish with.
2. PUT the bytes exactly as told, for example:
   `curl -sS --fail -X PUT -H "Content-Type: image/png" --data-binary @./x.png "<uploadUrl>"`
   Send every header it lists. Don't print the URL back to the user; it's a credential for this one upload.
3. `finish_upload` with what `create_upload` returned, plus `title`, `tags` and `bucketIds` if wanted. It returns the new asset, or `duplicate_of` when the same file is already in the library (then offer to tag it or add it to the bucket instead; pass `allowDuplicate: true` only if the user wants a second copy).

### Deleting over MCP

1. `delete_assets` with `ids` and **no** `confirm_token` returns `{preview: true, assets: [{id, title, type, buckets: [{id, name, clientLinkLive, clientOpened}]}], confirm_token, expires_in}`. Nothing is deleted.
2. Show the user every title and bucket, and warn about any `clientLinkLive` bucket (the client will stop seeing it). Ask, then end your turn.
3. Only after the user says yes in a new message: `delete_assets` with the same `ids` and the `confirm_token`.

"Clean up", "tidy" or "dedupe" are not a yes. Never send the token in the same turn as the preview.

If your client supports MCP elicitation (protocol 2026-07-28), Homebase shows the user its own confirmation dialog during the first `delete_assets` call and deletes only if they tick yes. The result is then `{preview: false, deleted, notFound}`, or `{declined: true}` with nothing deleted; don't ask again unless the user brings it up.

## Errors over MCP

A failed tool returns `isError: true` with the server's message:

- **`limit_reached` / `subscription_required`**: stop. Don't retry. Tell the user the message and when it resets (`resets_at`).
- **Auth errors**: an OAuth connection means "reconnect Homebase in your app's connector settings" (Claude Code: `/mcp` → homebase → Authenticate; Codex: `codex mcp login homebase`). A Settings key means the user needs a new key.
- **Missing permissions**: ask the user to grant them when they reconnect, or in Settings → Agents.
- **Unknown tool** (for example `create_upload` on an older server): use the CLI upload, or tell the user it isn't available yet.

Never retry in a loop.
