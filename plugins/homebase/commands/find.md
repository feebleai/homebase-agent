---
description: Search the Homebase library in plain words and show the best matches
argument-hint: <what you're looking for, e.g. latest files from the summer campaign>
allowed-tools: mcp__plugin_homebase_homebase__search_assets, mcp__plugin_homebase_homebase__list_bucket_assets, mcp__plugin_homebase_homebase__list_buckets, Bash(homebase search *), Bash(homebase recent *), Bash(homebase bucket ls *), Bash(homebase buckets *), Bash(node *homebase.mjs* search *), Bash(node *homebase.mjs* recent *), Bash(node *homebase.mjs* bucket ls *), Bash(node *homebase.mjs* buckets *)
---

Use the homebase skill to answer this request from the user's Homebase library:

$ARGUMENTS

1. One search, with the request in the user's own words (don't rewrite it into keywords): `search_assets` if the Homebase MCP tools are connected, otherwise the bundled CLI, `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" search "<request>"` (one plain command; `homebase search` if it's installed). Either is one call.
2. Start with one line saying how Homebase read the request (`interpretation`: buckets, date range, types, tags, notes).
3. List the results by group, in the order returned ("In <bucket>", "Also from <period>", other matches): title, type, latest date, tags, and id. These come with the search; don't fetch each asset to list them.
4. Don't describe what an asset shows unless you looked at it first (`view_asset`, or `homebase view <id>` and read the saved file).
5. If the reading was wrong or nothing matched, say so and offer a better phrasing. Don't download, change or delete anything unless asked.
