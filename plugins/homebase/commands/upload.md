---
description: Upload local files (or a link) to the Homebase library, tagged and optionally into a bucket
argument-hint: <files or folder> [to <bucket>] [tagged <tags>]
allowed-tools: mcp__plugin_homebase_homebase__list_buckets, mcp__plugin_homebase_homebase__create_upload, mcp__plugin_homebase_homebase__finish_upload, Bash(homebase buckets *), Bash(homebase upload *), Bash(node *homebase.mjs* buckets *), Bash(node *homebase.mjs* upload *), Bash(wc -c *)
---

Use the homebase skill to add these to the user's Homebase library:

$ARGUMENTS

1. Work out the files (or URL), the bucket and the tags from the request. Only upload what the user listed; never secrets or `.env` files. Video isn't supported through the API yet: send the user to the web app for videos.
2. Pick the path:
   - **Homebase MCP tools available**: check the bucket with `list_buckets`. For each file, call `create_upload` (filename, contentType, size from `wc -c < file`), PUT the bytes with `curl -sS --fail -X PUT` and exactly the headers it returns (`--data-binary @<file>`), then `finish_upload` with the tags and the bucket id. For a URL, use `import_from_url`.
   - **No MCP tools**: run `homebase upload <files…> [--bucket "<name>"] [--tag <t>]… --json` (`-r` for a folder; `homebase import <url> --json` for a URL). If `homebase` isn't installed, use the bundled copy: `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" upload …`.
3. If the named bucket doesn't exist, ask before creating it. If a bucket name matches several, ask which one.
4. If the result is a `duplicate_of`, say the file is already in the library (title and id) and offer to tag it or add it to the bucket instead. Don't upload a second copy unless the user asks.
5. Report each asset's title and id, and the bucket and tags it got. If a title is meaningless (like `x` or `IMG_2041`), suggest a better one, but rename only if the user agrees.
6. If you hit a limit (exit code 4 or `limit_reached`), stop and tell the user when it resets (`resets_at`). Don't retry.
