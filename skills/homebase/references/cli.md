# homebase CLI reference

If `homebase` isn't on the PATH, run the copy bundled with this skill: `node <skill folder>/scripts/homebase.mjs …` (Claude Code plugin: `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" …`). It needs Node 20+. `homebase --help`, `homebase <cmd> --help` and `homebase schema` are the authoritative reference.

## Contract (`"schema": 1`)

Every command prints **one compact JSON document on stdout**. No flag is needed (`--json` is accepted and changes nothing). Nothing ever prompts.

- Success: `{"ok":true,"schema":1, …fields below}`.
- Failure: `{"ok":false,"schema":1,"error":{"code","message","exit_code",…}, …partial results}`. `error` carries the server's fields verbatim (`resets_at`, `retry_after_s`, `limit`, `upgrade_url`, `missing_scopes`, `duplicate_of`), plus `status`, `hint` and, on limits, `do_not_retry`.
- `login` prints two documents: `login_started` at once, then `logged_in` when the user has approved.
- stderr has only short notices, one JSON object per line (`{"notice":"api_override","message":"…"}`). Ignore them unless they explain a failure.
- Dates are ISO 8601. Lists carry `{id,title,type,buckets:[name],latestAt,tags}` per asset; `--with-thumbnails` adds `thumbnailUrl`, `--full` returns every field. `get` cuts `description` and `visibleText` to about 500 characters with `"truncated":true`; `--full` lifts it.

| Exit | Meaning |
|---|---|
| 0 | ok |
| 1 | other error (network, server, `unsupported_by_server`) |
| 2 | usage: fix the command |
| 3 | auth or permission: run `homebase login`, or the user grants `missing_scopes` |
| 4 | limit reached (402/429): **don't retry** before `resets_at` |
| 5 | not found |
| 6 | confirmation required: a delete preview was printed, nothing was deleted |

Global flags: `--profile <name>` (env `HOMEBASE_PROFILE`), `--api <url>` (env `HOMEBASE_API_URL`), `--pretty`. A saved login is only sent to the API it was issued for: never pass `--api` or set `HOMEBASE_API_URL` to a server the user didn't name; if the CLI says the login is for another server (exit 2), tell the user.

## Find and look

| Command | Output fields |
|---|---|
| `search ["<request>"] [--type t] [--bucket b\|none] [--tag t] [--source human\|agent] [--ignore part]… [--limit 1-25] [--cursor c]` | `interpretation:{buckets?,dateRange?:{label,from,to},fileTypes?,tags?,terms?,source?,sort?,notes?,ignored?}, groups:[{label,kind:bucket\|also\|results,results:[Item]}], total, nextCursor?` |
| `recent [same filters]` | same as search, newest first |
| `get <id>` | `{id,title,type,mimeType?,source?,addedBy?,buckets:[name],tags,aiTags?,latestAt,uploadedAt,fileCreatedAt?,linkUrl?,appUrl,indexing?,description?,visibleText?,truncated?}` |
| `view <id \| "words">` | `{id,title,path,kind:preview\|original,bytes,contentType,search?:{query,alternatives:[{id,title,type}]}}`. Read the file at `path` to see it (a private per-user cache unless `-o file`). With words, the top search match is shown |
| `versions <id>` | `{id,title,currentVersion,versions:[{version,current,date,by?,note}]}` |
| `link <id>` | `{id,url,kind:signed\|link,expiresAt?}`: a 1-hour link to give the user |
| `download <id…> [-o dir] [--force]` | `{downloaded:[{id,title,path,bytes,resumed}],skipped:[{id,reason,url}],failed:[{id,error}]}` |
| `buckets [--all]` | `{buckets:[{id,name,itemCount,updatedAt}],nextCursor?}` |
| `bucket ls <bucket> [--all]` | `{bucket:{id,name},assets:[{id,title,type,latestAt,addedAt,tags}],nextCursor?}` |
| `share-link <bucket>` | `{bucket:{id,name},url,itemCount?,clientOpened?,note}`: for the **user** to send |

Item = `{id,title,type,buckets:[name],latestAt,tags}`. A bucket argument is an id, an exact name or slug, or (reads only) a unique part of a name. Paging with `--cursor` is free; a new question counts as one search against the monthly limit.

## Change (each needs the permission named)

| Command | Permission | Output fields |
|---|---|---|
| `upload <file\|dir\|glob…> [--bucket b]… [--tag t]… [--title t] [-r] [--allow-duplicate]` | assets:write (+ tags:write, buckets:write) | `{uploaded:[{file,id,title,type,buckets,tags}],duplicates:[{file,duplicate_of:{id,title,buckets},hint}],failed:[{file,error}],notTried:[file]}`; `file` is relative to the working directory when inside it, else absolute. Does the presigned PUT itself, 4 files at once. A wrong bucket name fails before any bytes move. Stops at an auth or limit error (`ok:false`, the lists still there) |
| `import <url> [--title] [--tag]… [--bucket]… [--link] [--allow-duplicate]` | assets:write | `{imported:true,importedAs:file\|link,id,title,type,buckets,tags}` or `{imported:false,duplicate_of,hint}` |
| `tag <id…> --add a,b --remove c` | tags:write | `{results:[{id,tags,added,removed}]}` |
| `rename <id> <title…>` | assets:write | `{id,title}` |
| `bucket create <name…> [--description t]` | buckets:write | `{id,name,itemCount,updatedAt,shareUrl?}` |
| `bucket add\|remove <bucket> <id…>` | buckets:write | `{bucket:{id,name},added\|removed,notFound}`. Needs the exact name or id |
| `delete <id…> [--confirm-token t]` | assets:delete (owner/admin) | see below |
| `deleted [--limit] [--cursor]` | assets:delete | `{assets:[{id,title,type,deletedAt,purgeAt,buckets}],nextCursor?}` |
| `restore <id…>` | assets:delete (owner/admin) | `{restored,notFound}` |

Upload limits: images up to 50 MB, videos (MP4, MOV, M4V, WebM) up to 500 MB, documents and other files up to 200 MB. Videos aren't AI-indexed yet: search finds them by title and tags.

### delete: two calls, always

1. `homebase delete <ids…>` never deletes. It exits **6** with `{"ok":false,"confirmation_required":true,"assets":[{id,title,type,buckets:[{name,clientLinkLive?,clientOpened?}]}],"notFound":[],"confirm_token":"…","expires_in":600,"next_step":"…","error":{"code":"confirmation_required",…}}`.
2. Show the user every title and bucket, with a warning for each `clientLinkLive` bucket, and ask. End your turn.
3. Only after the user says yes in a new message: `homebase delete <same ids…> --confirm-token <t>` → `{deleted,notFound,restorable}`.

There is no flag that skips the preview.

## Account

| Command | Output fields |
|---|---|
| `login [--device] [--no-wait\|--resume] [--no-browser] [--workspace slug] [--scopes list]` | First `{event:"login_started",flow:browser\|device,verification_url,user_code?,expires_at,browser_opened,next_step}`; relay `verification_url` (and `user_code`) to the user. Then `{event:"logged_in",profile,api,workspace:{name,slug},user,scopes,storage,renews}`. A browser login's URL must be opened on this computer; a device login's anywhere. If your shell would time out, use `--device --no-wait`, then `homebase login --resume` after the user approves |
| `whoami` | `{profile,tokenSource,api,login,workspace,user,token:{name,scopes},subscription?,usage?,rateLimit?}` |
| `profiles`, `profiles use <name>` | `{defaultProfile,profiles:[…]}` |
| `logout [--keep-token]` | `{profile,removed,revoked,revoke?,revoke_url?,next_step?}` |
| `doctor` | `{api,mcp,checks:[{name,status,detail}]}` |
| `connect [client] [--write]` | the setup plan for claude-code, codex, cursor, claude-desktop, claude-ai or chatgpt; `--write` applies it, only after the user agreed. See [setup.md](setup.md) |
| `schema [command]` | every output shape and exit code, as JSON |

No command prints a token, and you never need one.
