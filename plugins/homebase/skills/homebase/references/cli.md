# homebase CLI reference

If `homebase` isn't on the PATH, run the copy bundled with this skill: `node <skill folder>/scripts/homebase.mjs …` (Claude Code plugin: `node "${CLAUDE_PLUGIN_ROOT}/skills/homebase/scripts/homebase.mjs" …`). It needs Node 20+.

Add `--json` to every command. The output is then **one compact JSON document on stdout**, errors included. `login` is the only exception: it prints two JSON lines. Without `--json` the output is meant for people.

The global options can go anywhere in the command:

| Option | What it does |
|---|---|
| `--json` | Print JSON instead of human output |
| `--profile <name>` / `-p` | Which saved login to use. Also `HOMEBASE_PROFILE` |
| `--api <url>` | Which Homebase API to call. Also `HOMEBASE_API_URL` |
| `--help` | Show help for the command |

`HOMEBASE_TOKEN` overrides any saved login.

**Exit codes:**

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | other error |
| 2 | usage error |
| 3 | auth or permission problem |
| 4 | limit reached (402/429): **don't retry**. The first stderr line says `Limit reached: do not retry until <time>` |
| 5 | not found |
| 6 | confirmation required: a delete preview was printed and nothing was deleted |

**Error shape:**

```json
{"error":{"do_not_retry":"Limit reached: do not retry until 2026-11-01T00:00:00.000Z. …","code":"limit_reached","message":"…act on this…","resets_at":"2026-11-01T00:00:00.000Z","retry_after_s":2160000,"limit":"searches","used":20000,"max":20000,"upgrade_url":"…","status":429,"exit_code":4}}
```

`missing_scopes` is present on a 403 `insufficient_scope` error. A feature the server doesn't have yet fails with `code: "unsupported_by_server"` (exit 1) and a `hint`.

## Account

| Command | `--json` output |
|---|---|
| `homebase login [--no-browser] [--no-wait\|--resume]` | Prints `{"event":"login_started","verification_uri_complete","verification_uri","user_code","expires_at","profile","browser_opened","next_step"}` straight away, then `{"event":"logged_in","profile","workspace":{id,name,slug,url},"user":{name,email,role},"scopes":[…],"token_name","storage":"keychain"\|"file"}`. The `--no-wait` flag prints only the first line and exits; `--resume` finishes that login later |
| `homebase whoami` (alias `status`) | `{profile, tokenSource:"env"\|"keychain"\|"file", api, workspace:{id,name,slug,url}, user:{id,name,email,role}, token:{id,name,scopes}, subscription:{plan,status}, usage:{period,resetsAt,used:{…},limits:{…}}, rateLimit:{perMinute,remaining}}` |
| `homebase profiles` / `homebase profiles use <name>` | `{defaultProfile, profiles:[{name,default,workspace,api,scopes,storage,savedAt}]}` |
| `homebase logout [--keep-token]` | `{profile, removed, revoked, revoke:"revoked"\|"already_invalid"\|"unsupported"\|"failed", revoke_url, next_step}`. Revokes the saved token on the server (`POST /v1/auth/revoke`), then forgets it here. If the server can't revoke, `next_step` says to revoke it in Settings → Agents |
| `homebase doctor` | `{ok, api, mcp, checks:[{name,status:"ok"\|"warn"\|"fail",detail}]}` |

## Find

`homebase search ["<question>"] [--limit 1-50] [--cursor c] [--type image|document|video|link|embed|other] [--bucket <id|name|none>] [--tag t] [--source human|agent] [--ignore buckets|date|fileTypes|tags|source|sort|text]…`

```json
{"interpretation":{"query":"…","terms":[],"buckets":[{"id","name"}],"dateRange":{"from":"ISO","to":"ISO","label":"Summer 2026 (Jun–Aug)","kind":"created","source":"season","scope":"outsideBucket"},"fileTypes":[],"tags":[],"sort":"newest","notes":["…"],"ignored":[]},
 "groups":[{"label":"In Summer campaign 2026","kind":"bucket|also|results","results":[
   {"id","title","type","source":"human|agent","buckets":[{"id","name"}],"latestAt":"ISO","uploadedAt":"ISO","fileCreatedAt":"ISO","tags":[],"aiTags":[],"snippet":"…"}]}],
 "total":12,"nextCursor":"srch:…"|null,"textOnly":false}
```

- `--bucket` accepts an id, an exact name or slug, or a unique part of a name.
- No question (or `homebase recent [--type] [--bucket] [--tag] [--source]`) lists the newest assets, newest version first. Same output.
- Paging with `--cursor` is free. A new question counts as one search against the monthly limit.
- The results already carry titles, types, dates, tags and buckets. Use `get`/`view` only before describing an asset's contents.

| Command | `--json` output |
|---|---|
| `homebase get <id>` | The full asset: `{id,title,type,mimeType,size,source,addedBy,uploadedAt,updatedAt,fileCreatedAt,latestAt,linkUrl,thumbnailUrl,appUrl,tags,aiTags,description,visibleText,indexing:{status,reason},version,versionsCount,buckets:[{id,name,addedAt,shareUrl}]}` |
| `homebase versions <id>` | `{id,title,versions:[{version,current,uploadedAt,size,mimeType,addedBy,…}]}`, newest first |
| `homebase view <id> [-o file] [--original]` | `{id,title,path,kind:"preview"\|"original",bytes,contentType}`. Saves a 1280×720 JPEG preview. Open `path` to see the image |
| `homebase open <id> [--print]` | `{id,url,kind:"signed"\|"link",expiresAt,opened}`. Signed URLs last 1 hour |
| `homebase download <id…> [-o dir] [--force]` | `{downloaded:[{id,title,path,bytes,resumed}], skipped:[{id,reason,url}], failed:[{id,error}]}`. Links to web pages are skipped with their URL. A rerun resumes partial files |
| `homebase buckets [--limit 1-200] [--cursor c] [--all]` | `{buckets:[{id,name,slug,description,itemCount,shareUrl,createdAt,updatedAt}], nextCursor}` |
| `homebase bucket ls <bucket> [--limit 1-200] [--cursor c] [--all]` | `{bucket:{id,name}, assets:[{id,title,type,source,tags,addedAt,latestAt,…}], nextCursor}` |
| `homebase share-link <bucket>` | `{bucket:{id,name}, url, live?, source, note}`. Prints the client link for the **user** to send; Homebase and agents never send it |

## Change (each needs the permission named)

| Command | Permission | `--json` output |
|---|---|---|
| `homebase upload <file\|dir\|glob…> [--tag t]… [--bucket b]… [--title t] [-r] [--allow-duplicate]` | assets:write (+tags:write, buckets:write) | `{uploaded:[{id,title,type,mimeType,size,source,tags,buckets,linkUrl,appUrl,indexing}], duplicates:[{file,duplicate_of:{id,title,…},hint}], failed:[{file,error}], notTried:[…]}`. A file already in the library is reported in `duplicates`, not uploaded again; `hint` gives the tag/bucket commands to reuse it. The upload stops at an auth or limit error |
| `homebase import <url> [--title] [--tag]… [--bucket]… [--link] [--allow-duplicate]` | assets:write | the asset summary plus `"importedAs":"file"\|"link"`, or `{duplicate_of, imported:false, hint}`. Homebase fetches file URLs (image/PDF/document) server-side; pages become links; `--link` skips the fetch |
| `homebase tag <id…> --add a,b --remove c` | tags:write | `{results:[{id,tags,added,removed}]}` |
| `homebase rename <id> <title…>` | assets:write | `{id,title}` |
| `homebase bucket create <name…> [--description t]` | buckets:write | the bucket |
| `homebase bucket add\|remove <bucket> <id…>` | buckets:write | `{bucket:{id,name},added,removed,notFound}` |
| `homebase delete <id…> [--confirm-token t]` | assets:delete (owner/admin) | See below |
| `homebase deleted [--limit] [--cursor]` | assets:delete | `{assets:[{id,title,type,deletedAt,purgeAt,…}], nextCursor}` |
| `homebase restore <id…>` | assets:delete (owner/admin) | `{restored:[…], notFound:[…]}` |

### delete: preview first, always

1. `homebase delete <ids…> --json` never deletes on its own. Without a terminal it prints the preview and exits **6**:
   `{"confirmation_required":true,"preview":true,"assets":[{"id","title","type","buckets":[{"id","name","clientLinkLive","clientOpened"}]}],"notFound":[],"confirm_token":"…","expires_in":600,"next_step":"…","exit_code":6}`
2. Show the user every title and bucket, with a warning for each `clientLinkLive` bucket, and ask. End your turn.
3. Only after the user says yes in a new message: `homebase delete <same ids…> --confirm-token <t> --json` → `{deleted:[…],notFound:[…],restorable}`.

At a terminal, a person gets the same preview and a y/N prompt; `--yes` skips only the prompt, and is refused without a terminal. Agents never pass `--yes`. On servers without the preview step the CLI builds the preview itself and issues a `local_…` token that works once, for those ids, for 10 minutes.

Upload limits: images up to 50 MB, documents and other files up to 200 MB. Video isn't accepted through the API yet.

## Setup

| Command | What it does |
|---|---|
| `homebase connect <claude-code\|codex\|cursor\|claude-desktop\|claude-ai\|chatgpt> [--print] [--yes] [--scope user\|project\|local] [--token]` | Sets up the MCP connection for that client (Codex: OAuth by default; `--token` uses a Settings key from `$HOMEBASE_TOKEN`). See [setup.md](setup.md) |
| `homebase token [--force]` | Prints the raw token, only to a terminal (refuses pipes and agents unless `--force`). **Agents never run it**: the CLI uses the saved login |
