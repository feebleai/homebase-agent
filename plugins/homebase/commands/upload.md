---
description: Upload local files (or a link) to the Homebase library, tagged and optionally into a bucket
argument-hint: <files or folder> [to <bucket>] [tagged <tags>]
allowed-tools: mcp__plugin_homebase_homebase__list_buckets, mcp__plugin_homebase_homebase__import_from_url, Bash(homebase upload *), Bash(homebase import *), Bash(homebase buckets *), Bash(node *homebase.mjs* upload *), Bash(node *homebase.mjs* import *), Bash(node *homebase.mjs* buckets *)
---

Use the homebase skill to add these to the user's Homebase library:

$ARGUMENTS

Run the CLI as the bundled copy, `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" …` (written `homebase …` below), one plain command per call: no `command -v` checks, `&&`/`||` chains or pipes. Every command prints one JSON document.

1. Work out the files (or URL), the bucket and the tags from the request. Only upload what the user listed; never secrets or `.env` files. Video isn't supported through the API yet: send the user to the web app.
2. Files: one call, `homebase upload <files…> [--bucket "<exact bucket name>"] [--tag <t>]…` (`-r` for a folder). It checks the bucket and sends the bytes itself: don't list buckets first, and don't use `curl` or the MCP `create_upload` tools. A URL: `homebase import <url> [--bucket …] [--tag …]` (or the MCP `import_from_url`).
3. If it fails with `bucket_not_found`, ask before creating the bucket; if a name matches several, ask which one (`homebase buckets` lists them). Exit 3 means the CLI isn't logged in: tell the user, and with their OK run `homebase login` and relay `verification_url`.
4. If a file comes back in `duplicates`, say it's already in the library (title and id) and offer to tag it or add it to the bucket instead (`hint` has the commands). Don't upload a second copy unless the user asks.
5. Report each asset's title and id, and the bucket and tags it got. If a title is meaningless (like `x` or `IMG_2041`), suggest a better one, but rename only if the user agrees.
6. If you hit a limit (exit 4, `limit_reached`), stop and tell the user when it resets (`resets_at`). Don't retry.
