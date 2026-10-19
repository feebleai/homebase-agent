#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/errors.ts
function withData(error, data) {
  error.data = { ...error.data, ...data };
  return error;
}
function usageError(message, hint) {
  return new CliError(message, { exitCode: EXIT.usage, code: "usage", hint });
}
function exitCodeFor(status, code2) {
  if (status === 401) return EXIT.auth;
  if (status === 403) return EXIT.auth;
  if (status === 402 || status === 429) return EXIT.limit;
  if (status === 404) return EXIT.notFound;
  if (code2 === "access_denied" || code2 === "expired_token") return EXIT.auth;
  return EXIT.other;
}
function fromServer(status, body) {
  const server = extractServerError(body);
  if (server) {
    return new CliError(server.message, { exitCode: exitCodeFor(status, server.code), code: server.code, status, server });
  }
  const text = typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : `HTTP ${status}`;
  return new CliError(`Homebase answered ${status}: ${text}`, { exitCode: exitCodeFor(status), code: `http_${status}`, status });
}
function extractServerError(body) {
  if (!body || typeof body !== "object") return void 0;
  const error = body.error;
  if (!error || typeof error !== "object") return void 0;
  const { code: code2, message } = error;
  if (typeof code2 !== "string" || typeof message !== "string") return void 0;
  return error;
}
function isMissingRoute(error, extra) {
  if (!(error instanceof CliError)) return false;
  if (error.code === "method_not_allowed" || error.status === 405) return true;
  if (error.code !== "not_found" && error.status !== 404) return false;
  return /^There is no (GET|POST|PATCH|PUT|DELETE) /.test(error.message) || Boolean(extra?.test(error.message));
}
function unsupportedError(feature, hint) {
  return new CliError(`This Homebase server doesn't support ${feature} yet. Nothing was changed.`, { code: "unsupported_by_server", exitCode: EXIT.other, hint });
}
function doNotRetryLine(error) {
  if (error.exitCode !== EXIT.limit) return void 0;
  const server = error.server;
  const when = server?.resets_at ?? (server?.retry_after_s !== void 0 ? new Date(Date.now() + server.retry_after_s * 1e3).toISOString() : void 0);
  return `Limit reached: do not retry until ${when ?? "the limit resets"}. Stop and tell the user${server?.upgrade_url ? ` (an owner can upgrade at ${server.upgrade_url})` : ""}.`;
}
function errorBody(error) {
  const stop = doNotRetryLine(error);
  return {
    ...error.server ?? {},
    code: error.code,
    message: error.message,
    ...stop ? { do_not_retry: stop } : {},
    ...error.status !== void 0 ? { status: error.status } : {},
    ...error.hint ? { hint: error.hint } : {},
    exit_code: error.exitCode
  };
}
function errorJson(error) {
  return { ok: false, schema: SCHEMA, ...error.data ?? {}, error: errorBody(error) };
}
var SCHEMA, EXIT, CliError;
var init_errors = __esm({
  "src/errors.ts"() {
    "use strict";
    SCHEMA = 1;
    EXIT = {
      ok: 0,
      other: 1,
      usage: 2,
      auth: 3,
      limit: 4,
      notFound: 5,
      /** A destructive action needs the user's explicit yes (delete preview printed). */
      confirm: 6
    };
    CliError = class extends Error {
      exitCode;
      code;
      status;
      server;
      hint;
      /** What the command did before failing (uploaded, failed, a delete preview…): printed beside `error`. */
      data;
      constructor(message, opts = {}) {
        super(message);
        this.name = "CliError";
        this.exitCode = opts.exitCode ?? EXIT.other;
        this.code = opts.code ?? "error";
        this.status = opts.status;
        this.server = opts.server;
        this.hint = opts.hint;
        this.data = opts.data;
      }
    };
  }
});

// src/constants.ts
function mcpUrl(api) {
  return `${api.replace(/\/+$/, "")}/mcp`;
}
var DEFAULT_API_URL, WEBSITE_URL, DEFAULT_CLIENT_ID, REFRESH_SKEW_MS, REFRESH_TIMEOUT_MS, LOGIN_TIMEOUT_MS, CLI_VERSION, CLIENT_NAME, USER_AGENT, KEYCHAIN_SERVICE, ALL_SCOPES, SEARCH_LIMIT_MAX, SEARCH_LIMIT_DEFAULT, BROWSE_LIMIT_DEFAULT, PAGE_LIMIT_MAX, BUCKETS_LIMIT_DEFAULT, BUCKET_ASSETS_LIMIT_DEFAULT, DELETED_LIMIT_DEFAULT, MAX_AUTO_RETRY_S, MAX_RATE_WAITS;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    DEFAULT_API_URL = "https://next-caribou-11.convex.site";
    WEBSITE_URL = "https://homebase-delta-seven.vercel.app";
    DEFAULT_CLIENT_ID = `${WEBSITE_URL}/oauth/homebase-cli.json`;
    REFRESH_SKEW_MS = 5 * 60 * 1e3;
    REFRESH_TIMEOUT_MS = 30 * 1e3;
    LOGIN_TIMEOUT_MS = 10 * 60 * 1e3;
    CLI_VERSION = "0.1.3";
    CLIENT_NAME = "Homebase CLI";
    USER_AGENT = `homebase-cli/${CLI_VERSION} (node ${process.version}; ${process.platform})`;
    KEYCHAIN_SERVICE = "homebase-cli";
    ALL_SCOPES = ["search", "assets:read", "assets:write", "tags:write", "buckets:write", "assets:delete"];
    SEARCH_LIMIT_MAX = 25;
    SEARCH_LIMIT_DEFAULT = 24;
    BROWSE_LIMIT_DEFAULT = 10;
    PAGE_LIMIT_MAX = 200;
    BUCKETS_LIMIT_DEFAULT = 100;
    BUCKET_ASSETS_LIMIT_DEFAULT = 50;
    DELETED_LIMIT_DEFAULT = 50;
    MAX_AUTO_RETRY_S = 60;
    MAX_RATE_WAITS = 30;
  }
});

// src/specs.ts
function exitLine() {
  return `Exit: ${Object.entries(EXIT_CODES).map(([code2, meaning]) => `${code2} ${meaning.split(":")[0].split(" (")[0]}`).join(" \xB7 ")}`;
}
function topHelp() {
  const byName = new Map(SPECS.map((spec) => [spec.name, spec]));
  const lines = [
    `homebase ${CLI_VERSION}: the Homebase asset library for AI agents. Every command prints one JSON document on stdout.`,
    ""
  ];
  for (const [title, names] of SECTIONS) {
    lines.push(`${title}:`);
    for (const name of names) {
      const spec = byName.get(name);
      if (spec) lines.push(`  ${spec.usage.replace(/^homebase /, "")}`);
    }
  }
  lines.push(
    "",
    `Global: ${Object.entries(GLOBAL_OPTIONS).filter(([, spec]) => !spec.hidden).map(([name, spec]) => `--${name}${spec.type === "string" ? ` <${spec.value}>` : ""}`).join(" ")} (--json accepted, no effect)`,
    "Env: HOMEBASE_TOKEN, HOMEBASE_API_URL, HOMEBASE_PROFILE, HOMEBASE_CONFIG_DIR, HOMEBASE_NO_KEYCHAIN=1",
    `Output: ${ENVELOPE}`,
    `Error: ${TYPES.Error}`,
    "stderr: notices only, one JSON object per line: {notice,message}",
    exitLine(),
    "Details: homebase <command> --help \xB7 homebase schema"
  );
  return lines.join("\n");
}
function optionLine(name, spec) {
  const flag = `${spec.short ? `-${spec.short}, ` : ""}--${name}${spec.type === "string" ? ` <${spec.value ?? "value"}>` : ""}${spec.multiple ? "\u2026" : ""}`;
  return `  ${flag.padEnd(26)} ${spec.description ?? ""}`;
}
function withTypes(output) {
  const used = Object.keys(TYPES).filter((name) => new RegExp(`\\b${name}\\b`).test(output));
  return used.map((name) => `  ${name} = ${TYPES[name]}`);
}
function helpFor(spec) {
  const lines = [spec.usage, spec.summary];
  const options = Object.entries(spec.options ?? {});
  if (options.length) lines.push("Flags:", ...options.map(([name, option]) => optionLine(name, option)));
  lines.push(`Output: {"ok":true,"schema":1, ${spec.output}}`, ...withTypes(spec.output));
  if (spec.exits) lines.push(`Exit: ${spec.exits}`);
  lines.push(exitLine(), `Global: --profile <name> --api <url> --pretty`);
  return lines.join("\n");
}
function groupHelp(group) {
  return SPECS.filter((spec) => spec.name.startsWith(`${group} `)).map((spec) => spec.usage).join("\n");
}
function schemaJson(name) {
  const pick = name ? SPECS.filter((spec) => spec.name === name || spec.aliases?.includes(name)) : SPECS;
  return {
    envelope: ENVELOPE,
    error: TYPES.Error,
    types: TYPES,
    exitCodes: EXIT_CODES,
    commands: Object.fromEntries(pick.map((spec) => [spec.name, { usage: spec.usage, output: spec.output, ...spec.exits ? { exits: spec.exits } : {} }])),
    version: CLI_VERSION
  };
}
var GLOBAL_OPTIONS, TYPES, EXIT_CODES, FULL, THUMBS, LIMIT, CURSOR, FILTERS, SEARCH_OUT, SPECS, SECTIONS, ENVELOPE;
var init_specs = __esm({
  "src/specs.ts"() {
    "use strict";
    init_constants();
    GLOBAL_OPTIONS = {
      profile: { type: "string", short: "p", value: "name", description: "Saved login to use (env HOMEBASE_PROFILE)" },
      api: { type: "string", value: "url", description: "API base URL (env HOMEBASE_API_URL)" },
      pretty: { type: "boolean", description: "Indent the JSON (debugging only)" },
      json: { type: "boolean", description: "Accepted for compatibility; output is always JSON", hidden: true },
      help: { type: "boolean", short: "h", description: "This reference" },
      version: { type: "boolean", description: "Print the CLI version" }
    };
    TYPES = {
      Item: "{id,title,type,buckets:[name],latestAt,tags:[],thumbnailUrl?}",
      Asset: "{id,title,type,mimeType?,size?,source?,addedBy?,buckets:[name],tags:[],aiTags?,latestAt,uploadedAt,fileCreatedAt?,version?,versionsCount?,linkUrl?,appUrl,thumbnailUrl?,indexing?:{status,reason?},description?,visibleText?,truncated?}",
      Created: "{id,title,type,buckets:[name],tags:[],linkUrl?}",
      Bucket: "{id,name,itemCount,updatedAt}",
      Error: "{code,message,exit_code,hint?,status?,do_not_retry?,resets_at?,retry_after_s?,limit?,upgrade_url?,missing_scopes?,duplicate_of?}"
    };
    EXIT_CODES = {
      "0": "ok",
      "1": "other error (network, server, unsupported_by_server)",
      "2": "usage: fix the command",
      "3": "auth or permission: not logged in, revoked, insufficient_scope",
      "4": "limit reached (402/429): do not retry before resets_at",
      "5": "not found",
      "6": "confirmation required: delete preview printed, nothing deleted"
    };
    FULL = { type: "boolean", description: "Every field the server sends, text uncut" };
    THUMBS = { type: "boolean", description: "Add thumbnailUrl to each asset" };
    LIMIT = {
      type: "string",
      value: "n",
      description: `Results per page, 1-${SEARCH_LIMIT_MAX} (default ${SEARCH_LIMIT_DEFAULT} for a search, ${BROWSE_LIMIT_DEFAULT} without words or for recent)`
    };
    CURSOR = { type: "string", value: "c", description: "nextCursor from the previous page (valid 10 min)" };
    FILTERS = {
      type: { type: "string", value: "t", description: "image|document|video|link|embed|other" },
      bucket: { type: "string", value: "b", description: "Bucket id, name, or none (in no bucket)" },
      tag: { type: "string", value: "t", description: "Only assets with this tag" },
      source: { type: "string", value: "s", description: "human|agent (who added it)" }
    };
    SEARCH_OUT = "interpretation:{buckets?:[name],dateRange?:{label,from,to},fileTypes?,tags?,terms?,source?,sort?,notes?,ignored?}, groups:[{label,kind:bucket|also|results,results:[Item]}], total, nextCursor?, textOnly?";
    SPECS = [
      /* ---- find ---- */
      {
        name: "search",
        aliases: ["find"],
        module: "library",
        summary: "Search the library with the user's own words; the server reads buckets, seasons, dates, types, tags and 'latest'. No words: newest first.",
        usage: 'homebase search ["<request>"] [--type t] [--bucket b] [--tag t] [--source s] [--ignore part]\u2026 [--limit n] [--cursor c] [--with-thumbnails] [--full]',
        options: {
          limit: LIMIT,
          cursor: CURSOR,
          ...FILTERS,
          ignore: { type: "string", multiple: true, value: "part", description: "Drop part of the reading: buckets|date|fileTypes|tags|source|sort|text" },
          "with-thumbnails": THUMBS,
          full: FULL
        },
        output: SEARCH_OUT,
        exits: "5 bucket not found"
      },
      {
        name: "recent",
        aliases: ["latest"],
        module: "library",
        summary: "Newest assets by latest version date, optionally filtered. Same output as search.",
        usage: "homebase recent [--type t] [--bucket b] [--tag t] [--source s] [--limit n] [--cursor c] [--with-thumbnails] [--full]",
        options: { limit: LIMIT, cursor: CURSOR, ...FILTERS, "with-thumbnails": THUMBS, full: FULL },
        maxArgs: 0,
        output: SEARCH_OUT
      },
      {
        name: "get",
        aliases: ["show"],
        module: "library",
        summary: "One asset: buckets, dates, tags, AI description and visible text (cut to 500 chars unless --full).",
        usage: "homebase get <id> [--with-thumbnails] [--full]",
        options: { "with-thumbnails": THUMBS, full: FULL },
        minArgs: 1,
        maxArgs: 1,
        output: "...Asset"
      },
      {
        name: "versions",
        module: "library",
        summary: "Version history, newest first. 'Latest' means the newest version date.",
        usage: "homebase versions <id>",
        minArgs: 1,
        maxArgs: 1,
        output: "id, title, currentVersion, versions:[{version,current,date,by?,note}]"
      },
      {
        name: "view",
        module: "library",
        summary: "Save an asset's preview image (1280x720 JPEG) and print its path; read that file to see it. Takes an id, or the user's words: then the top search match is shown and the next ones are listed.",
        usage: 'homebase view <id | "request"> [-o file] [--original]',
        options: {
          output: { type: "string", short: "o", value: "file", description: "Where to save (default: your private cache, e.g. ~/.cache/homebase/previews)" },
          original: { type: "boolean", description: "The original image instead of the preview (images up to 20 MB)" }
        },
        minArgs: 1,
        output: "id, title, path, kind:preview|original, bytes, contentType, search?:{query,alternatives:[{id,title,type}]}",
        exits: "5 no match, or no preview (not an image, or not drawn yet: see error.message)"
      },
      {
        name: "link",
        aliases: ["open"],
        module: "library",
        summary: "A download link for the user: signed (valid 1 hour) for files, the URL itself for links.",
        usage: "homebase link <id>",
        minArgs: 1,
        maxArgs: 1,
        output: "id, url, kind:signed|link, expiresAt?"
      },
      {
        name: "download",
        module: "library",
        summary: "Save files to disk with their real names; resumes partial downloads; up to 4 at once.",
        usage: "homebase download <id>\u2026 [-o dir] [--force]",
        options: {
          output: { type: "string", short: "o", value: "dir", description: "Folder to save into (default: current folder)" },
          force: { type: "boolean", description: "Overwrite same-named files instead of adding (2), (3)\u2026" }
        },
        minArgs: 1,
        output: "downloaded:[{id,title,path,bytes,resumed}], skipped:[{id,reason,url}], failed:[{id,error:{code,message}}]"
      },
      {
        name: "buckets",
        module: "buckets",
        summary: "The workspace's buckets (campaigns, client handoffs), newest first.",
        usage: "homebase buckets [--limit n] [--cursor c] [--all] [--full]",
        options: {
          limit: { type: "string", value: "n", description: `Per page, 1-${PAGE_LIMIT_MAX} (default ${BUCKETS_LIMIT_DEFAULT})` },
          cursor: { type: "string", value: "c", description: "nextCursor from the previous page" },
          all: { type: "boolean", description: "Every page" },
          full: FULL
        },
        maxArgs: 0,
        output: "buckets:[Bucket], nextCursor?"
      },
      {
        name: "bucket ls",
        aliases: ["bucket list", "bucket show"],
        module: "buckets",
        summary: "A bucket's assets in the bucket's order.",
        usage: "homebase bucket ls <bucket> [--limit n] [--cursor c] [--all] [--with-thumbnails] [--full]",
        options: {
          limit: { type: "string", value: "n", description: `Per page, 1-${PAGE_LIMIT_MAX} (default ${BUCKET_ASSETS_LIMIT_DEFAULT})` },
          cursor: { type: "string", value: "c", description: "nextCursor from the previous page" },
          all: { type: "boolean", description: "Every page" },
          "with-thumbnails": THUMBS,
          full: FULL
        },
        minArgs: 1,
        output: "bucket:{id,name}, assets:[{id,title,type,latestAt,addedAt,tags:[],thumbnailUrl?}], nextCursor?",
        exits: "5 bucket not found"
      },
      {
        name: "share-link",
        module: "buckets",
        summary: "A bucket's client share link, for the user to send. Never send it yourself.",
        usage: "homebase share-link <bucket>",
        minArgs: 1,
        output: "bucket:{id,name}, url, itemCount?, clientOpened?, note"
      },
      /* ---- change ---- */
      {
        name: "upload",
        module: "library",
        summary: "Upload local files (presigned PUT done here, 4 at once), optionally tagged and into buckets. Needs assets:write.",
        usage: "homebase upload <file|dir|glob>\u2026 [--bucket b]\u2026 [--tag t]\u2026 [--title t] [-r] [--allow-duplicate]",
        options: {
          bucket: { type: "string", multiple: true, value: "b", description: "Also put it in this bucket: id or exact name (needs buckets:write)" },
          tag: { type: "string", multiple: true, value: "t", description: "Tag it (repeat or comma-separate)" },
          title: { type: "string", value: "t", description: "Title, one file only (default: from the filename)" },
          recursive: { type: "boolean", short: "r", description: "Folders' contents, including subfolders" },
          "allow-duplicate": { type: "boolean", description: "Upload even if the same bytes are already in the library" }
        },
        minArgs: 1,
        output: "uploaded:[{file,...Created}], duplicates:[{file,duplicate_of:{id,title,buckets:[name]},hint}], failed:[{file,error:{code,message}}], notTried:[file]  (file: the path relative to the working directory when inside it, else absolute)",
        exits: "on a failure: ok:false with these lists and error = the first failure; stops at auth (3) or limit (4)"
      },
      {
        name: "import",
        module: "library",
        summary: "Add a URL: image/PDF/document URLs are fetched and stored like uploads; web pages become links.",
        usage: "homebase import <url> [--title t] [--tag t]\u2026 [--bucket b]\u2026 [--link] [--allow-duplicate]",
        options: {
          title: { type: "string", value: "t", description: "Title (default: file name or page title)" },
          tag: { type: "string", multiple: true, value: "t", description: "Tag it" },
          bucket: { type: "string", multiple: true, value: "b", description: "Also put it in this bucket: id or exact name" },
          link: { type: "boolean", description: "Save as a link even if it's a file" },
          "allow-duplicate": { type: "boolean", description: "Add it even if it's already in the library" }
        },
        minArgs: 1,
        maxArgs: 1,
        output: "imported:true, importedAs:file|link, ...Created  |  imported:false, duplicate_of:{id,title,buckets:[name]}, hint"
      },
      {
        name: "tag",
        module: "library",
        summary: "Add or remove tags (free-form; case and spacing don't matter). Needs tags:write.",
        usage: "homebase tag <id>\u2026 [--add t]\u2026 [--remove t]\u2026",
        options: {
          add: { type: "string", multiple: true, value: "t", description: "Tag to add (repeat or comma-separate)" },
          remove: { type: "string", multiple: true, value: "t", description: "Tag to remove" }
        },
        minArgs: 1,
        output: "results:[{id,tags:[],added,removed}]"
      },
      {
        name: "rename",
        module: "library",
        summary: "Rename an asset (only when the user asked or agreed). Needs assets:write.",
        usage: "homebase rename <id> <new title\u2026>",
        minArgs: 2,
        output: "id, title"
      },
      {
        name: "bucket create",
        module: "buckets",
        summary: "Create a bucket. Check `buckets` first; ask before creating one the user didn't name. Needs buckets:write.",
        usage: "homebase bucket create <name\u2026> [--description text]",
        options: { description: { type: "string", value: "text", description: "What the bucket is for" } },
        minArgs: 1,
        output: "...Bucket, shareUrl?"
      },
      {
        name: "bucket add",
        module: "buckets",
        summary: "Add library assets to a bucket (linked, not copied). Needs buckets:write.",
        usage: "homebase bucket add <bucket> <id>\u2026",
        minArgs: 2,
        output: "bucket:{id,name}, added, notFound:[id]",
        exits: "2 bucket name only partly matches (use the exact name or id)"
      },
      {
        name: "bucket remove",
        module: "buckets",
        summary: "Take assets out of a bucket; they stay in the library. Needs buckets:write.",
        usage: "homebase bucket remove <bucket> <id>\u2026",
        minArgs: 2,
        output: "bucket:{id,name}, removed, notFound:[id]",
        exits: "2 bucket name only partly matches (use the exact name or id)"
      },
      /* ---- delete ---- */
      {
        name: "delete",
        module: "trash",
        summary: "Move assets to Recently deleted (restorable 30 days). Two calls: without --confirm-token it previews and exits 6. Show the preview, get the user's yes in a new message, then call again with the token.",
        usage: "homebase delete <id>\u2026 [--confirm-token t]",
        options: { "confirm-token": { type: "string", value: "t", description: "From the preview, only after the user said yes in a new message" } },
        minArgs: 1,
        output: "preview (exit 6, ok:false): confirmation_required:true, assets:[{id,title,type,buckets:[{name,clientLinkLive?,clientOpened?}]}], notFound, confirm_token, expires_in, next_step  |  confirmed: deleted:[id], notFound:[id], restorable",
        exits: "6 preview printed, nothing deleted; 6 confirm_token invalid, expired or for other ids"
      },
      {
        name: "deleted",
        module: "trash",
        summary: "Recently deleted assets (restorable 30 days by an owner or admin).",
        usage: "homebase deleted [--limit n] [--cursor c]",
        options: {
          limit: { type: "string", value: "n", description: `Per page, 1-${PAGE_LIMIT_MAX} (default ${DELETED_LIMIT_DEFAULT})` },
          cursor: { type: "string", value: "c", description: "nextCursor from the previous page" }
        },
        maxArgs: 0,
        output: "assets:[{id,title,type,deletedAt,purgeAt,buckets:[name]}], nextCursor?"
      },
      {
        name: "restore",
        module: "trash",
        summary: "Bring assets back from Recently deleted into their buckets (owner or admin).",
        usage: "homebase restore <id>\u2026",
        minArgs: 1,
        output: "restored:[id], notFound:[id]"
      },
      /* ---- account ---- */
      {
        name: "login",
        module: "auth",
        summary: "Sign in; a person approves in the browser. Prints login_started at once (relay verification_url and user_code), waits, then prints logged_in. --device --no-wait returns at once; finish with --resume.",
        usage: "homebase login [--device] [--no-wait | --resume] [--no-browser] [--workspace slug] [--scopes list]",
        options: {
          device: { type: "boolean", description: "Code approved on any device (chosen automatically over SSH, in CI, without a browser)" },
          "no-wait": { type: "boolean", description: "Device login: print login_started and exit; finish with --resume" },
          resume: { type: "boolean", description: "Finish a --no-wait device login (waits for the approval)" },
          "no-browser": { type: "boolean", description: "Don't open a browser on this computer" },
          workspace: { type: "string", value: "slug", description: "Preselect this workspace on the approval page" },
          scopes: { type: "string", value: "list", description: "Comma-separated: search,assets:read,assets:write,tags:write,buckets:write,assets:delete" }
        },
        maxArgs: 0,
        output: "1st line: event:login_started, flow:browser|device, verification_url, user_code?, expires_at, browser_opened, next_step. 2nd line: event:logged_in, profile, api, workspace:{name,slug}, user:{name,role}, scopes, storage:keychain|file",
        exits: "3 denied or expired; 2 HOMEBASE_API_URL names another server (pass --api to mean it)"
      },
      {
        name: "logout",
        module: "auth",
        summary: "End this profile's login on its server and forget it here.",
        usage: "homebase logout [--keep-token]",
        options: { "keep-token": { type: "boolean", description: "Only forget it here; don't revoke it on the server" } },
        maxArgs: 0,
        output: "profile, removed, revoked, revoke?:revoked|already_invalid|unsupported|failed, revoke_url?, next_step?"
      },
      {
        name: "whoami",
        aliases: ["status"],
        module: "auth",
        summary: "Workspace, user, permissions and this month's usage for the current login.",
        usage: "homebase whoami",
        maxArgs: 0,
        output: "profile, tokenSource:env|keychain|file, api, login:{kind,renews,access_expires_at?}, workspace:{id,name,slug,url}, user:{id,name,role}, token:{name,scopes}, subscription?, usage?, rateLimit?"
      },
      {
        name: "profiles",
        module: "auth",
        summary: "Saved logins.",
        usage: "homebase profiles",
        maxArgs: 0,
        output: "defaultProfile, profiles:[{name,default,workspace,api,scopes,storage,savedAt}]"
      },
      {
        name: "profiles use",
        module: "auth",
        summary: "Make a saved profile the default.",
        usage: "homebase profiles use <name>",
        minArgs: 1,
        maxArgs: 1,
        output: "defaultProfile"
      },
      {
        name: "connect",
        module: "setup",
        summary: "Plan an MCP connection for a client: claude-code|codex|cursor|claude-desktop|claude-ai|chatgpt. Changes nothing unless --write (only after the user agreed).",
        usage: "homebase connect [client] [--write] [--scope user|project|local] [--token [--token-env VAR]] [--config path]",
        options: {
          write: { type: "boolean", description: "Apply: run `claude mcp add` / write Codex config.toml" },
          scope: { type: "string", value: "s", description: "claude-code: user (default), project or local" },
          token: { type: "boolean", description: "codex: send a Settings key from an env var instead of OAuth" },
          "token-env": { type: "string", value: "VAR", description: "codex --token: the env var (default HOMEBASE_TOKEN)" },
          config: { type: "string", value: "path", description: "codex: config.toml to edit (default $CODEX_HOME/config.toml)" }
        },
        maxArgs: 1,
        output: "client, url, applied, command?|diff?|steps?|config?, next_step"
      },
      {
        name: "doctor",
        module: "setup",
        summary: "Check the API, login, permissions, usage and the MCP endpoint.",
        usage: "homebase doctor",
        maxArgs: 0,
        output: "api, mcp, checks:[{name,status:ok|warn|fail,detail}]",
        exits: "the failing check's code (3 auth, 4 limit, 1 other)"
      },
      {
        name: "schema",
        module: "schema",
        summary: "The JSON output contract: envelope, shared types, exit codes and every command's output.",
        usage: "homebase schema [command]",
        output: "envelope, error, types, exitCodes, commands:{name:{usage,output,exits?}}"
      }
    ];
    SECTIONS = [
      ["Find", ["search", "recent", "get", "versions", "view", "link", "download", "buckets", "bucket ls", "share-link"]],
      ["Change", ["upload", "import", "tag", "rename", "bucket create", "bucket add", "bucket remove"]],
      ["Delete", ["delete", "deleted", "restore"]],
      ["Account", ["login", "logout", "whoami", "profiles", "profiles use", "connect", "doctor", "schema"]]
    ];
    ENVELOPE = '{"ok":true,"schema":1,...output}  failure: {"ok":false,"schema":1,"error":Error,...partial output}';
  }
});

// src/args.ts
import { parseArgs } from "node:util";
function globalValueOptions() {
  const names = /* @__PURE__ */ new Set();
  for (const [name, spec] of Object.entries(GLOBAL_OPTIONS)) {
    if (spec.type === "string") {
      names.add(`--${name}`);
      if (spec.short) names.add(`-${spec.short}`);
    }
  }
  return names;
}
function commandWordIndexes(argv, groups) {
  const takesValue = globalValueOptions();
  const indexes = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") break;
    if (token.startsWith("-")) {
      if (takesValue.has(token)) i++;
      continue;
    }
    indexes.push(i);
    if (indexes.length === 1 && groups.has(token)) continue;
    break;
  }
  return indexes;
}
function parseCommandLine(argv, commands6) {
  const byName = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Set();
  for (const command2 of commands6) {
    for (const name of [command2.name, ...command2.aliases ?? []]) byName.set(name, command2);
    if (command2.name.includes(" ")) groups.add(command2.name.split(" ")[0]);
  }
  const wordIndexes = commandWordIndexes(argv, groups);
  const words = wordIndexes.map((index) => argv[index]);
  let command = null;
  let used = 0;
  let group;
  if (words.length) {
    if (groups.has(words[0])) {
      group = words[0];
      if (words[1] && byName.has(`${words[0]} ${words[1]}`)) {
        command = byName.get(`${words[0]} ${words[1]}`);
        used = 2;
      } else if (byName.has(words[0])) {
        command = byName.get(words[0]);
        used = 1;
        group = void 0;
      } else if (words[1]) {
        throw usageError(`Unknown command "${words[0]} ${words[1]}".`, `Run \`homebase ${words[0]} --help\`.`);
      } else {
        used = 1;
      }
    } else if (byName.has(words[0])) {
      command = byName.get(words[0]);
      used = 1;
    } else {
      throw usageError(`Unknown command "${words[0]}".`, "Run `homebase --help` for the list of commands.");
    }
  }
  const skip = new Set(wordIndexes.slice(0, used));
  const rest = argv.filter((_token, index) => !skip.has(index));
  const options = { ...GLOBAL_OPTIONS, ...command?.options ?? {} };
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: Object.fromEntries(
        Object.entries(options).map(([name, spec]) => [name, { type: spec.type, ...spec.short ? { short: spec.short } : {}, ...spec.multiple ? { multiple: true } : {} }])
      ),
      allowPositionals: true,
      strict: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\. To specify a positional argument.*$/s, ".") : String(error);
    throw usageError(message, `Run \`homebase ${command?.name ?? ""}${command ? " " : ""}--help\`.`.replace("  ", " "));
  }
  const values = parsed.values;
  const positionals = parsed.positionals;
  if (command && !values.help) {
    if (command.minArgs !== void 0 && positionals.length < command.minArgs) {
      throw usageError(`Missing arguments. Usage: ${command.usage}`, `Run \`homebase ${command.name} --help\`.`);
    }
    if (command.maxArgs !== void 0 && positionals.length > command.maxArgs) {
      throw usageError(`Too many arguments. Usage: ${command.usage}`, `Quote multi-word values, e.g. homebase search "summer campaign".`);
    }
  }
  return { command, group, values, positionals };
}
function listOption(value) {
  if (value === void 0 || typeof value === "boolean") return [];
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}
function intOption(value, name, min, max) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw usageError(`--${name} must be a whole number.`);
  const number = Number(value);
  if (number < min || number > max) throw usageError(`--${name} must be between ${min} and ${max}.`);
  return number;
}
function stringOption(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[value.length - 1];
  return void 0;
}
var init_args = __esm({
  "src/args.ts"() {
    "use strict";
    init_errors();
    init_specs();
  }
});

// src/output.ts
function processIo() {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  };
}
function formatJson(value, pretty = false) {
  return JSON.stringify(value, null, pretty ? 2 : void 0) + "\n";
}
function okJson(data) {
  return { ok: true, schema: SCHEMA, ...data };
}
function isoFromMs(value) {
  if (typeof value === "string" && value) return value;
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : void 0;
}
function isoDates(item) {
  const out = { ...item };
  for (const key of DATE_KEYS) if (typeof out[key] === "number") out[key] = isoFromMs(out[key]);
  return out;
}
function bucketNames(buckets2) {
  if (!Array.isArray(buckets2)) return [];
  return buckets2.map((bucket) => typeof bucket === "string" ? bucket : String(bucket?.name ?? "")).filter(Boolean);
}
function cut(text, max = TEXT_LIMIT) {
  if (text.length <= max) return { text, truncated: false };
  const slice = text.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return { text: `${(space > max * 0.8 ? slice.slice(0, space) : slice).trimEnd()}\u2026`, truncated: true };
}
function shellQuote(text) {
  return `'${text.replace(/'/g, "'\\''")}'`;
}
function compact(value) {
  for (const key of Object.keys(value)) if (value[key] === void 0 || value[key] === "") delete value[key];
  return value;
}
function listItemJson(item, view2) {
  if (view2.full) return isoDates({ ...item });
  return compact({
    id: item.id,
    title: item.title,
    type: item.type,
    buckets: bucketNames(item.buckets),
    latestAt: isoFromMs(item.latestAt ?? item.uploadedAt),
    tags: item.tags ?? [],
    thumbnailUrl: view2.thumbnails ? item.thumbnailUrl ?? item.thumb : void 0
  });
}
function interpretationJson(interpretation, full = false) {
  if (!interpretation) return void 0;
  const range = interpretation.dateRange;
  if (full) {
    const out2 = { ...interpretation };
    if (range && typeof range === "object") out2.dateRange = { ...range, from: isoFromMs(range.from) ?? range.from, to: isoFromMs(range.to) ?? range.to };
    return out2;
  }
  const out = {};
  const buckets2 = bucketNames(interpretation.buckets);
  if (buckets2.length) out.buckets = buckets2;
  if (range && typeof range === "object") out.dateRange = compact({ label: range.label, from: isoFromMs(range.from), to: isoFromMs(range.to) });
  for (const key of ["fileTypes", "tags", "terms"]) {
    const list = interpretation[key];
    if (Array.isArray(list) && list.length) out[key] = list;
  }
  if (typeof interpretation.source === "string") out.source = interpretation.source;
  if (typeof interpretation.sort === "string" && interpretation.sort !== "relevance") out.sort = interpretation.sort;
  for (const key of ["notes", "ignored"]) {
    const list = interpretation[key];
    if (Array.isArray(list) && list.length) out[key] = list;
  }
  return out;
}
function searchJson(response, view2) {
  return compact({
    interpretation: interpretationJson(response.interpretation, view2.full),
    groups: (response.groups ?? []).filter((group) => group.results?.length).map((group) => ({ label: group.label, kind: group.kind, results: (group.results ?? []).map((result) => listItemJson(result, view2)) })),
    total: response.total ?? 0,
    nextCursor: response.nextCursor ?? void 0,
    textOnly: response.textOnly ? true : void 0
  });
}
function assetJson(asset, view2) {
  if (view2.full) return isoDates({ ...asset });
  const description = cut(asset.description ?? "");
  const visibleText = cut(asset.visibleText ?? "");
  const indexing = asset.indexing?.status && asset.indexing.status !== "done" ? compact({ status: asset.indexing.status, reason: asset.indexing.reason }) : void 0;
  return compact({
    id: asset.id,
    title: asset.title,
    type: asset.type,
    mimeType: asset.mimeType,
    size: asset.size ? asset.size : void 0,
    source: asset.source,
    addedBy: asset.addedBy,
    buckets: bucketNames(asset.buckets),
    tags: asset.tags ?? [],
    aiTags: asset.aiTags?.length ? asset.aiTags : void 0,
    latestAt: isoFromMs(asset.latestAt ?? asset.uploadedAt),
    uploadedAt: isoFromMs(asset.uploadedAt),
    fileCreatedAt: isoFromMs(asset.fileCreatedAt),
    version: (asset.versionsCount ?? 0) > 1 ? asset.version : void 0,
    versionsCount: (asset.versionsCount ?? 0) > 1 ? asset.versionsCount : void 0,
    linkUrl: asset.linkUrl,
    appUrl: asset.appUrl ?? asset.url,
    thumbnailUrl: view2.thumbnails ? asset.thumbnailUrl : void 0,
    indexing,
    description: description.text,
    visibleText: visibleText.text,
    truncated: description.truncated || visibleText.truncated ? true : void 0
  });
}
function createdJson(asset) {
  return compact({
    id: asset.id,
    title: asset.title,
    type: asset.type,
    buckets: bucketNames(asset.buckets),
    tags: asset.tags ?? [],
    linkUrl: asset.linkUrl
  });
}
function bucketJson(bucket, view2) {
  if (view2.full) return isoDates({ ...bucket });
  return compact({ id: bucket.id, name: bucket.name, itemCount: bucket.itemCount ?? 0, updatedAt: isoFromMs(bucket.updatedAt ?? bucket.createdAt) });
}
var TEXT_LIMIT, DATE_KEYS;
var init_output = __esm({
  "src/output.ts"() {
    "use strict";
    init_errors();
    TEXT_LIMIT = 500;
    DATE_KEYS = ["addedAt", "latestAt", "uploadedAt", "updatedAt", "fileCreatedAt", "createdAt", "deletedAt", "purgeAt", "date", "expiresAt"];
  }
});

// src/cache.ts
import { randomBytes } from "node:crypto";
import { chmodSync, createWriteStream, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
function previewCacheDir(env, platform = process.platform, home = env.HOME || homedir()) {
  if (platform === "win32") return join(env.LOCALAPPDATA || join(env.USERPROFILE || home, "AppData", "Local"), "homebase", "previews");
  if (env.XDG_CACHE_HOME && isAbsolute(env.XDG_CACHE_HOME)) return join(env.XDG_CACHE_HOME, "homebase", "previews");
  if (platform === "darwin") return join(home, "Library", "Caches", "homebase", "previews");
  return join(home, ".cache", "homebase", "previews");
}
function safeIdPart(id) {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "asset";
}
function unsafe(message) {
  return new CliError(message, { code: "unsafe_cache_dir" });
}
function ensurePrivateDir(dir, platform = process.platform) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw unsafe(`${dir} isn't a plain folder (a symlink?). Remove it, or pass -o <file>.`);
  if (platform !== "win32" && typeof process.getuid === "function") {
    if (stat.uid !== process.getuid()) throw unsafe(`${dir} belongs to another user. Remove it, or pass -o <file>.`);
    if ((stat.mode & 63) !== 0) chmodSync(dir, 448);
  }
  return dir;
}
async function writePrivateFile(path, body) {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await pipeline(Readable.from(body), createWriteStream(temp, { flags: "wx", mode: 384 }));
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
var init_cache = __esm({
  "src/cache.ts"() {
    "use strict";
    init_errors();
  }
});

// src/files.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, extname, join as join2, resolve, sep } from "node:path";
function mimeFor(path) {
  return MIME[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream";
}
function extensionFor(mimeType) {
  if (!mimeType) return void 0;
  const clean = mimeType.split(";")[0].trim().toLowerCase();
  if (EXTENSION_FOR[clean]) return EXTENSION_FOR[clean];
  return Object.entries(MIME).find(([, mime]) => mime === clean)?.[0];
}
function safeFilename(name) {
  let cleaned = name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 180).replace(/[. ]+$/, "");
  if (WINDOWS_RESERVED.test(cleaned.split(".")[0].trimEnd())) cleaned = `_${cleaned}`;
  return cleaned || "download";
}
function downloadFilename(opts) {
  const fromHeader = filenameFromDisposition(opts.contentDisposition);
  if (fromHeader) return safeFilename(fromHeader);
  const ext = extensionFor(opts.mimeType) ?? urlExtension(opts.url);
  const title = safeFilename(opts.title);
  if (!ext) return title;
  const current = extname(title).slice(1).toLowerCase();
  if (current === ext || ext === "jpg" && current === "jpeg") return title;
  return `${title}.${ext}`;
}
function urlExtension(url) {
  if (!url) return void 0;
  try {
    const ext = extname(new URL(url).pathname).slice(1).toLowerCase();
    return ext && ext.length <= 5 && MIME[ext] ? ext : void 0;
  } catch {
    return void 0;
  }
}
function filenameFromDisposition(header) {
  if (!header) return void 0;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain?.[1]?.trim() || void 0;
}
function uniquePath(path, exists) {
  if (!exists(path)) return path;
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let n = 2; n < 1e3; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}
function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const slash = pattern[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else out += "[^/]*";
    } else if (char === "?") out += "[^/]";
    else if (char === "[") {
      const end = pattern.indexOf("]", i);
      if (end === -1) out += "\\[";
      else {
        out += `[${pattern.slice(i + 1, end).replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else out += char.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}
function walk(dir, recursive, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const full = join2(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) walk(full, recursive, out);
    } else if (entry.isFile()) out.push(full);
  }
}
function expandUploadArgs(args, opts) {
  const files = [];
  for (const arg of args) {
    const absolute = resolve(opts.cwd, arg);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      stat = void 0;
    }
    if (stat?.isFile()) {
      files.push(absolute);
      continue;
    }
    if (stat?.isDirectory()) {
      if (!opts.recursive) throw usageError(`${arg} is a folder. Pass --recursive to upload everything in it.`);
      walk(absolute, true, files);
      continue;
    }
    if (GLOB_CHARS.test(arg)) {
      const normalized = absolute.split(sep).join("/");
      const parts = normalized.split("/");
      const firstGlob = parts.findIndex((part) => GLOB_CHARS.test(part));
      const base = parts.slice(0, firstGlob).join("/") || "/";
      const regex = globToRegExp(normalized);
      const deep = normalized.includes("**") || parts.length - firstGlob > 1;
      const candidates = [];
      walk(base, deep, candidates);
      const matched = candidates.filter((candidate) => regex.test(candidate.split(sep).join("/")));
      if (!matched.length) throw usageError(`No files match ${arg}.`);
      files.push(...matched);
      continue;
    }
    throw usageError(`No such file: ${arg}`);
  }
  return [...new Set(files)];
}
var MIME, EXTENSION_FOR, WINDOWS_RESERVED, GLOB_CHARS;
var init_files = __esm({
  "src/files.ts"() {
    "use strict";
    init_errors();
    MIME = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      avif: "image/avif",
      svg: "image/svg+xml",
      heic: "image/heic",
      heif: "image/heif",
      tif: "image/tiff",
      tiff: "image/tiff",
      bmp: "image/bmp",
      ico: "image/x-icon",
      psd: "image/vnd.adobe.photoshop",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      rtf: "application/rtf",
      txt: "text/plain",
      md: "text/markdown",
      markdown: "text/markdown",
      csv: "text/csv",
      json: "application/json",
      zip: "application/zip",
      ai: "application/postscript",
      eps: "application/postscript",
      ttf: "font/ttf",
      otf: "font/otf",
      woff: "font/woff",
      woff2: "font/woff2",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      aac: "audio/aac",
      ogg: "audio/ogg",
      flac: "audio/flac",
      mp4: "video/mp4",
      m4v: "video/x-m4v",
      mov: "video/quicktime",
      webm: "video/webm",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska"
    };
    EXTENSION_FOR = {
      "image/jpeg": "jpg",
      "text/plain": "txt",
      "text/markdown": "md",
      "image/svg+xml": "svg",
      "image/tiff": "tiff",
      "application/postscript": "eps"
    };
    WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;
    GLOB_CHARS = /[*?[]/;
  }
});

// src/http.ts
import { createRequire } from "node:module";
import { Readable as Readable2 } from "node:stream";
function transport(protocol) {
  const secure = protocol === "https:";
  const mod = secure ? nodeRequire("node:https") : nodeRequire("node:http");
  let agent = agents.get(protocol);
  if (!agent) {
    agent = new mod.Agent({ keepAlive: true, maxSockets: 8 });
    agents.set(protocol, agent);
  }
  return { request: mod.request, agent };
}
function wrap(res) {
  const status = res.statusCode ?? 0;
  let consumed;
  const collect = () => {
    consumed ??= (async () => {
      const chunks = [];
      for await (const chunk of res) chunks.push(chunk);
      return Buffer.concat(chunks);
    })();
    return consumed;
  };
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        const value = res.headers[name.toLowerCase()];
        if (value === void 0) return null;
        return Array.isArray(value) ? value.join(", ") : String(value);
      }
    },
    body: res,
    text: async () => (await collect()).toString("utf8"),
    arrayBuffer: async () => {
      const bytes = await collect();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}
async function requestOnce(input, init) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError(`Unsupported protocol ${url.protocol}`);
  const { request, agent } = transport(url.protocol);
  return new Promise((resolve4, reject) => {
    const req = request(url, { method: init.method ?? "GET", headers: init.headers, agent, signal: init.signal }, (res) => resolve4(wrap(res)));
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(Object.assign(new Error(`no response for ${IDLE_TIMEOUT_MS / 1e3}s`), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    const body = init.body;
    if (body === void 0 || body === null) req.end();
    else if (typeof body === "string" || body instanceof Uint8Array) req.end(body);
    else {
      const source = body instanceof Readable2 ? body : Readable2.from(body);
      source.on("error", (error) => req.destroy(error));
      source.pipe(req);
    }
  });
}
async function discard(response) {
  try {
    await response.text();
  } catch {
  }
}
function networkReason(error) {
  if (!(error instanceof Error)) return String(error);
  const inner = error.cause instanceof Error ? error.cause : error;
  const code2 = inner.code;
  return code2 && !inner.message.includes(code2) ? `${code2}: ${inner.message}` : inner.message;
}
var nodeRequire, IDLE_TIMEOUT_MS, agents, MAX_REDIRECTS, nodeFetch;
var init_http = __esm({
  "src/http.ts"() {
    "use strict";
    nodeRequire = createRequire(import.meta.url);
    IDLE_TIMEOUT_MS = 6e4;
    agents = /* @__PURE__ */ new Map();
    MAX_REDIRECTS = 5;
    nodeFetch = async (input, init = {}) => {
      let url = input;
      let current = init;
      for (let hop = 0; ; hop++) {
        const response = await requestOnce(url, current);
        const location = response.headers.get("location");
        const method = (current.method ?? "GET").toUpperCase();
        if (current.redirect === "manual" || !location || response.status < 300 || response.status >= 400 || response.status === 304) return response;
        if (hop >= MAX_REDIRECTS || method !== "GET" && method !== "HEAD") return response;
        await discard(response);
        const next = new URL(location, url);
        const headers = { ...current.headers };
        if (next.origin !== new URL(url).origin) {
          for (const name of Object.keys(headers)) if (name.toLowerCase() === "authorization") delete headers[name];
        }
        url = next.toString();
        current = { ...current, headers };
      }
    };
  }
});

// src/pool.ts
async function eachLimit(items, limit, worker, stop = () => false) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length && !stop()) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return next;
}
var CONCURRENCY;
var init_pool = __esm({
  "src/pool.ts"() {
    "use strict";
    CONCURRENCY = 4;
  }
});

// src/commands/buckets.ts
var buckets_exports = {};
__export(buckets_exports, {
  commands: () => commands,
  listAllBuckets: () => listAllBuckets,
  looksLikeId: () => looksLikeId,
  matchBucket: () => matchBucket,
  resolveBucket: () => resolveBucket
});
function looksLikeId(value) {
  return /^[0-9a-z]{31,32}$/.test(value);
}
function cachedBuckets(api) {
  let pending2 = bucketLists.get(api);
  if (!pending2) {
    pending2 = listAllBuckets(api);
    bucketLists.set(api, pending2);
    pending2.catch(() => bucketLists.delete(api));
  }
  return pending2;
}
async function listAllBuckets(api, maxPages = 25) {
  const all = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const result = await api.get("/v1/buckets", { limit: 200, cursor });
    all.push(...result.buckets);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return all;
}
function matchBucket(buckets2, ref) {
  const byId = buckets2.find((bucket) => bucket.id === ref);
  if (byId) return byId;
  const needle = ref.trim().toLowerCase();
  const exact = buckets2.filter((bucket) => bucket.name.toLowerCase() === needle || bucket.slug?.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return { ambiguous: exact };
  const partial = buckets2.filter((bucket) => bucket.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return { ambiguous: partial };
  return void 0;
}
async function resolveBucket(api, ref, opts = {}) {
  if (looksLikeId(ref)) return { id: ref };
  const match = matchBucket(await cachedBuckets(api), ref);
  if (!match) {
    throw new CliError(`No bucket called \u201C${ref}\u201D. List them with \`homebase buckets\`; create one only if the user asked (\`homebase bucket create "${ref}"\`).`, {
      exitCode: EXIT.notFound,
      code: "bucket_not_found"
    });
  }
  if ("ambiguous" in match) {
    throw usageError(
      `\u201C${ref}\u201D matches ${match.ambiguous.length} buckets: ${match.ambiguous.slice(0, 8).map((bucket) => `${bucket.name} (${bucket.id})`).join(", ")}. Use the exact name or the id.`
    );
  }
  const needle = ref.trim().toLowerCase();
  if (opts.write && match.name.toLowerCase() !== needle && match.slug?.toLowerCase() !== needle) {
    throw usageError(`\u201C${ref}\u201D only partly matches \u201C${match.name}\u201D. Changing a bucket needs its exact name or id; did you mean \u201C${match.name}\u201D (${match.id})?`);
  }
  return { id: match.id, name: match.name };
}
function bucketMembership(action) {
  return async (ctx, parsed) => {
    const [ref, ...ids] = parsed.positionals;
    if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
    const bucket = await resolveBucket(ctx.api, ref, { write: true });
    const result = await ctx.api.post(`/v1/buckets/${encodeURIComponent(bucket.id)}/assets`, {
      [action]: ids
    });
    return {
      bucket: { id: bucket.id, name: bucket.name },
      ...action === "add" ? { added: result.added } : { removed: result.removed },
      notFound: result.notFound ?? []
    };
  };
}
var bucketLists, buckets, bucketCreate, bucketLs, SHARE_NOTE, shareLink, commands;
var init_buckets = __esm({
  "src/commands/buckets.ts"() {
    "use strict";
    init_args();
    init_constants();
    init_errors();
    init_output();
    bucketLists = /* @__PURE__ */ new WeakMap();
    buckets = async (ctx, parsed) => {
      let list;
      let nextCursor = null;
      if (parsed.values.all) {
        list = await listAllBuckets(ctx.api);
      } else {
        const page = await ctx.api.get("/v1/buckets", {
          limit: intOption(parsed.values.limit, "limit", 1, PAGE_LIMIT_MAX),
          cursor: stringOption(parsed.values.cursor)
        });
        list = page.buckets;
        nextCursor = page.nextCursor;
      }
      return { buckets: list.map((bucket) => bucketJson(bucket, ctx.view)), ...nextCursor ? { nextCursor } : {} };
    };
    bucketCreate = async (ctx, parsed) => {
      const name = parsed.positionals.join(" ").trim();
      if (!name) throw usageError("The bucket needs a name.");
      const bucket = await ctx.api.post("/v1/buckets", { name, description: stringOption(parsed.values.description) });
      return { ...bucketJson(bucket, ctx.view), ...bucket.shareUrl ? { shareUrl: bucket.shareUrl } : {} };
    };
    bucketLs = async (ctx, parsed) => {
      const bucket = await resolveBucket(ctx.api, parsed.positionals.join(" "));
      const path = `/v1/buckets/${encodeURIComponent(bucket.id)}/assets`;
      const items = [];
      let cursor = stringOption(parsed.values.cursor);
      let nextCursor = null;
      let name = bucket.name;
      try {
        for (let page = 0; page < (parsed.values.all ? 50 : 1); page++) {
          const body = await ctx.api.get(path, {
            limit: intOption(parsed.values.limit, "limit", 1, PAGE_LIMIT_MAX),
            cursor
          });
          name ??= body.bucket?.name;
          items.push(...body.assets ?? body.items ?? []);
          nextCursor = body.nextCursor ?? null;
          if (!nextCursor) break;
          cursor = nextCursor;
        }
      } catch (error) {
        if (isMissingRoute(error)) {
          throw unsupportedError("listing a bucket's contents", `Search inside it instead: homebase search "${name ?? "files"}" --bucket ${bucket.id} --ignore date`);
        }
        throw error;
      }
      const assets = items.map((item) => {
        if (ctx.view.full) return isoDates({ ...item });
        const entry = listItemJson(item, ctx.view);
        delete entry.buckets;
        return { ...entry, ...item.addedAt !== void 0 ? { addedAt: isoFromMs(item.addedAt) } : {} };
      });
      return { bucket: { id: bucket.id, name }, assets, ...nextCursor ? { nextCursor } : {} };
    };
    SHARE_NOTE = "Give this link to the user to send; never send it yourself.";
    shareLink = async (ctx, parsed) => {
      const ref = parsed.positionals.join(" ");
      const bucket = await resolveBucket(ctx.api, ref);
      let link2;
      try {
        link2 = await ctx.api.get(`/v1/buckets/${encodeURIComponent(bucket.id)}/share-link`);
      } catch (error) {
        if (!isMissingRoute(error)) throw error;
        const found = (await listAllBuckets(ctx.api)).find((entry) => entry.id === bucket.id);
        if (!found?.shareUrl) throw unsupportedError("share links", "Copy the link from the bucket's Share button in the web app.");
        link2 = { url: found.shareUrl, name: found.name };
      }
      const url = link2.url ?? link2.shareUrl;
      if (!url) throw new CliError(`\u201C${bucket.name ?? ref}\u201D has no share link. Turn sharing on from the bucket's Share button in the web app.`, { code: "no_share_link", exitCode: EXIT.notFound });
      return {
        bucket: { id: bucket.id, name: bucket.name ?? link2.name },
        url,
        ...link2.itemCount !== void 0 ? { itemCount: link2.itemCount } : {},
        ...link2.clientOpened !== void 0 ? { clientOpened: link2.clientOpened } : {},
        note: SHARE_NOTE
      };
    };
    commands = {
      buckets,
      "bucket create": bucketCreate,
      "bucket add": bucketMembership("add"),
      "bucket remove": bucketMembership("remove"),
      "bucket ls": bucketLs,
      "share-link": shareLink
    };
  }
});

// src/commands/library.ts
var library_exports = {};
__export(library_exports, {
  commands: () => commands2,
  duplicateOf: () => duplicateOf,
  shownPath: () => shownPath
});
import { createReadStream, createWriteStream as createWriteStream2, existsSync, mkdirSync as mkdirSync2, readFileSync, renameSync as renameSync2, rmSync as rmSync2, statSync as statSync2, writeFileSync } from "node:fs";
import { basename as basename3, isAbsolute as isAbsolute2, join as join3, relative, resolve as resolve2, sep as sep2 } from "node:path";
import { pipeline as pipeline2 } from "node:stream/promises";
async function searchFilters(ctx, parsed) {
  const filters = {};
  const top = {};
  const type = stringOption(parsed.values.type);
  if (type) {
    if (!FILE_TYPES.includes(type)) throw usageError(`--type must be one of ${FILE_TYPES.join(", ")}.`);
    filters.fileType = type;
    top.type = type;
  }
  const source = stringOption(parsed.values.source);
  if (source) {
    if (source !== "human" && source !== "agent") throw usageError("--source must be human or agent.");
    filters.source = source;
    top.source = source;
  }
  const tag2 = stringOption(parsed.values.tag);
  if (tag2) {
    filters.tag = tag2;
    top.tag = tag2;
  }
  const bucket = stringOption(parsed.values.bucket);
  if (bucket) {
    const id = bucket === "none" ? "none" : (await resolveBucket(ctx.api, bucket)).id;
    filters.bucket = id;
    top.bucketId = id;
  }
  const ignore = listOption(parsed.values.ignore);
  if (ignore.length) filters.ignore = ignore;
  return { ...top, ...Object.keys(filters).length ? { filters } : {} };
}
async function runSearch(ctx, parsed, query) {
  const cursor = stringOption(parsed.values.cursor);
  let response;
  try {
    response = await ctx.api.post("/v1/search", {
      ...query || !cursor ? { query } : {},
      ...cursor ? { cursor } : {},
      limit: intOption(parsed.values.limit, "limit", 1, SEARCH_LIMIT_MAX),
      ...await searchFilters(ctx, parsed)
    });
  } catch (error) {
    if (!query && !cursor && error instanceof CliError && error.code === "invalid_request" && /query/i.test(error.message)) {
      throw unsupportedError("browsing recent assets (an empty search)", 'Search with words instead, e.g. homebase search "newest images".');
    }
    throw error;
  }
  return searchJson(response, ctx.view);
}
async function fetchToFile(ctx, url, path, opts = {}) {
  const response = await ctx.fetch(url, { method: "GET" });
  if (!response.ok || !response.body) {
    await discard(response);
    throw new CliError(`Couldn't fetch the file (HTTP ${response.status}).`, { code: `http_${response.status}`, status: response.status });
  }
  if (opts.private) await writePrivateFile(path, response.body);
  else await pipeline2(response.body, createWriteStream2(path));
  return { bytes: statSync2(path).size, contentType: response.headers.get("content-type") ?? void 0 };
}
async function viewTarget(ctx, ref) {
  if (looksLikeId(ref)) return { id: ref };
  const response = await ctx.api.post("/v1/search", { query: ref, limit: 5 });
  const results = (response.groups ?? []).flatMap((group) => group.results ?? []);
  if (!results.length) throw new CliError(`Nothing in the library matches \u201C${ref}\u201D. Try other words, or homebase search to browse.`, { code: "no_match", exitCode: EXIT.notFound });
  return { id: results[0].id, search: { query: ref, alternatives: results.slice(1, 5).map((result) => ({ id: result.id, title: result.title, type: result.type })) } };
}
async function downloadOne(ctx, id, dir, force) {
  const [asset, link2] = await Promise.all([ctx.api.get(assetPath(id)), ctx.api.get(`${assetPath(id)}/download-url`)]);
  if (link2.kind === "link" && (asset.type === "link" || asset.type === "embed")) {
    return { id, reason: "This asset is a link to a web page, not a file.", url: link2.url };
  }
  const part = join3(dir, `.${id}.homebase-part`);
  const partTag = `${part}.etag`;
  let offset = 0;
  let etag;
  try {
    offset = statSync2(part).size;
    etag = readFileSync(partTag, "utf8").trim() || void 0;
  } catch {
    etag = void 0;
  }
  if (!etag) offset = 0;
  let response = await ctx.fetch(link2.url, { method: "GET", headers: offset ? { Range: `bytes=${offset}-`, "If-Range": etag } : {} });
  if (response.status === 416 || response.status === 206 && offset > 0 && response.headers.get("etag") !== null && response.headers.get("etag") !== etag) {
    await discard(response);
    rmSync2(part, { force: true });
    rmSync2(partTag, { force: true });
    offset = 0;
    response = await ctx.fetch(link2.url, { method: "GET" });
  }
  if (!response.ok || !response.body) {
    await discard(response);
    throw new CliError(`Downloading \u201C${asset.title}\u201D failed (HTTP ${response.status}). The link may have expired; retry.`, { code: `http_${response.status}`, status: response.status });
  }
  const name = downloadFilename({ title: asset.title, mimeType: asset.mimeType, contentDisposition: response.headers.get("content-disposition"), url: link2.url });
  let target = join3(dir, name);
  if (!force) target = uniquePath(target, (candidate) => existsSync(candidate));
  const resumed = response.status === 206 && offset > 0;
  if (!resumed) {
    const fresh = response.headers.get("etag");
    if (fresh) writeFileSync(partTag, fresh);
    else rmSync2(partTag, { force: true });
  }
  await pipeline2(response.body, createWriteStream2(part, { flags: resumed ? "a" : "w" }));
  const bytes = statSync2(part).size;
  renameSync2(part, target);
  rmSync2(partTag, { force: true });
  return { id, title: asset.title, path: target, bytes, resumed };
}
async function putFile(ctx, grant, path, size) {
  const response = await ctx.fetch(grant.uploadUrl, {
    method: "PUT",
    headers: { ...grant.headers, "Content-Length": String(size) },
    body: createReadStream(path),
    duplex: "half"
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new CliError(`Uploading the bytes of ${basename3(path)} failed (HTTP ${response.status}). ${text.slice(0, 200)}`.trim(), {
      code: `upload_put_${response.status}`,
      status: response.status
    });
  }
}
function duplicateOf(value) {
  const raw = value instanceof CliError ? value.server?.duplicate_of : value && typeof value === "object" ? value.duplicate_of : void 0;
  if (!raw) return void 0;
  if (typeof raw === "string") return { id: raw };
  if (typeof raw === "object" && typeof raw.id === "string") {
    const ref = raw;
    return { id: ref.id, title: ref.title, type: ref.type, buckets: bucketNames(ref.buckets) };
  }
  return void 0;
}
async function describeDuplicate(ctx, ref) {
  if (ref.title) return ref;
  try {
    const asset = await ctx.api.get(assetPath(ref.id));
    return { id: ref.id, title: asset.title, type: asset.type, buckets: bucketNames(asset.buckets) };
  } catch {
    return ref;
  }
}
function duplicateHint(ref, opts) {
  const reuse = [];
  if (opts.tags.length) reuse.push(`homebase tag ${ref.id} --add ${shellQuote(opts.tags.join(","))}`);
  for (const bucket of opts.buckets.filter((wanted) => !ref.buckets?.includes(wanted.name ?? ""))) reuse.push(`homebase bucket add ${shellQuote(bucket.name ?? bucket.id)} ${ref.id}`);
  return [reuse.length ? `Already in the library. To reuse it: ${reuse.join(" && ")}.` : "Already in the library.", `A second copy only if the user asks: ${opts.retry} --allow-duplicate.`].join(" ");
}
async function bucketTargets(ctx, value) {
  const refs = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return Promise.all(refs.map((ref) => resolveBucket(ctx.api, ref, { write: true })));
}
function shownPath(cwd, file) {
  const rel = relative(cwd, file);
  return rel && rel !== ".." && !rel.startsWith(`..${sep2}`) && !isAbsolute2(rel) ? rel : file;
}
function isMissingImportRoute(error) {
  return error instanceof CliError && error.code === "not_found" && /There is no POST \/v1\/assets\/import/.test(error.message);
}
var FILE_TYPES, assetPath, stopsBatch, search, recent, get, versions, view, link, download, upload, importUrl, tag, rename, commands2;
var init_library = __esm({
  "src/commands/library.ts"() {
    "use strict";
    init_cache();
    init_constants();
    init_args();
    init_errors();
    init_files();
    init_http();
    init_output();
    init_pool();
    init_buckets();
    FILE_TYPES = ["image", "document", "video", "link", "embed", "other"];
    assetPath = (id) => `/v1/assets/${encodeURIComponent(id)}`;
    stopsBatch = (error) => error.exitCode === EXIT.auth || error.exitCode === EXIT.limit;
    search = (ctx, parsed) => runSearch(ctx, parsed, parsed.positionals.join(" ").trim());
    recent = (ctx, parsed) => runSearch(ctx, parsed, "");
    get = async (ctx, parsed) => assetJson(await ctx.api.get(assetPath(parsed.positionals[0])), ctx.view);
    versions = async (ctx, parsed) => {
      const id = parsed.positionals[0];
      let body;
      try {
        body = await ctx.api.get(`${assetPath(id)}/versions`);
      } catch (error) {
        if (isMissingRoute(error)) throw unsupportedError("version history", `\`homebase get ${id}\` shows the current version and versionsCount.`);
        throw error;
      }
      return {
        id: body.id ?? id,
        title: body.title,
        currentVersion: body.currentVersion,
        versions: (body.versions ?? []).map((version) => isoDates(version))
      };
    };
    view = async (ctx, parsed) => {
      const target = await viewTarget(ctx, parsed.positionals.join(" ").trim());
      const id = target.id;
      const asset = await ctx.api.get(assetPath(id));
      let url = parsed.values.original ? void 0 : asset.thumbnailUrl;
      let kind = "preview";
      if (!url && asset.type === "image" && (asset.size ?? 0) <= 20 * 1024 * 1024) {
        url = (await ctx.api.get(`${assetPath(id)}/download-url`)).url;
        kind = "original";
      }
      if (!url) {
        throw new CliError(
          asset.indexing?.status === "pending" || asset.indexing?.status === "running" || asset.indexing?.status === "queued" ? "The preview is still being drawn. Retry in a few seconds." : `\u201C${asset.title}\u201D (${asset.type}) has no preview image. Read its description with \`homebase get ${id}\`, or download it with \`homebase download ${id}\`.`,
          { code: "no_preview", exitCode: EXIT.notFound }
        );
      }
      const ext = kind === "preview" ? "jpg" : downloadFilename({ title: "x", mimeType: asset.mimeType }).split(".").pop() ?? "img";
      const output = stringOption(parsed.values.output);
      let path;
      if (output) {
        path = resolve2(ctx.cwd, output);
        mkdirSync2(resolve2(path, ".."), { recursive: true });
      } else {
        path = join3(ensurePrivateDir(previewCacheDir(ctx.env)), `${safeIdPart(id)}-${kind}.${ext.replace(/[^A-Za-z0-9]/g, "") || "img"}`);
      }
      const saved = await fetchToFile(ctx, url, path, { private: !output });
      return { id, title: asset.title, path, kind, bytes: saved.bytes, contentType: saved.contentType, ...target.search ? { search: target.search } : {} };
    };
    link = async (ctx, parsed) => {
      const result = await ctx.api.get(`${assetPath(parsed.positionals[0])}/download-url`);
      return { id: result.id, url: result.url, kind: result.kind, ...result.expiresAt ? { expiresAt: result.expiresAt } : {} };
    };
    download = async (ctx, parsed) => {
      const dir = resolve2(ctx.cwd, stringOption(parsed.values.output) ?? ".");
      mkdirSync2(dir, { recursive: true });
      const ids = [...new Set(parsed.positionals)];
      const outcomes = [];
      let firstError;
      let stop = false;
      await eachLimit(
        ids,
        CONCURRENCY,
        async (id, index) => {
          try {
            outcomes[index] = await downloadOne(ctx, id, dir, Boolean(parsed.values.force));
          } catch (error) {
            if (!(error instanceof CliError)) throw error;
            firstError ??= error;
            outcomes[index] = { id, error: { code: error.code, message: error.message } };
            if (stopsBatch(error)) stop = true;
          }
        },
        () => stop
      );
      const done2 = outcomes.filter(Boolean);
      const data = {
        downloaded: done2.filter((entry) => "path" in entry),
        skipped: done2.filter((entry) => "reason" in entry),
        failed: done2.filter((entry) => "error" in entry)
      };
      if (firstError) throw withData(firstError, data);
      return data;
    };
    upload = async (ctx, parsed) => {
      const files = expandUploadArgs(parsed.positionals, { recursive: Boolean(parsed.values.recursive), cwd: ctx.cwd });
      const title = stringOption(parsed.values.title);
      if (title && files.length > 1) throw usageError("--title works with one file only.");
      if (files.length > 500) throw usageError(`That's ${files.length} files; upload at most 500 per run.`);
      for (const file of files) if (statSync2(file).size === 0) throw usageError(`${shownPath(ctx.cwd, file)} is empty; nothing was uploaded.`);
      const tags = listOption(parsed.values.tag);
      const allowDuplicate = Boolean(parsed.values["allow-duplicate"]);
      const bucketsReady = bucketTargets(ctx, parsed.values.bucket);
      bucketsReady.catch(() => {
      });
      const shown = (file) => shownPath(ctx.cwd, file);
      const outcomes = [];
      let bucketError;
      let stopError;
      let firstError;
      const noteDuplicate = async (index, file, found, buckets2) => {
        const ref = await describeDuplicate(ctx, found);
        outcomes[index] = { kind: "duplicate", file: shown(file), duplicate_of: ref, hint: duplicateHint(ref, { tags, buckets: buckets2, retry: `homebase upload ${shellQuote(shown(file))}` }) };
      };
      const started = await eachLimit(
        files,
        CONCURRENCY,
        async (file, index) => {
          const size = statSync2(file).size;
          const mimeType = mimeFor(file);
          let buckets2 = [];
          try {
            const grant = await ctx.api.post("/v1/uploads", {
              filename: basename3(file),
              contentType: mimeType,
              size,
              ...allowDuplicate ? { allowDuplicate: true } : {}
            });
            try {
              buckets2 = await bucketsReady;
            } catch (error) {
              bucketError = error;
              return;
            }
            const early = duplicateOf(grant);
            if (early && !grant.uploadUrl) return noteDuplicate(index, file, early, buckets2);
            await putFile(ctx, grant, file, size);
            const asset = await ctx.api.post("/v1/assets", {
              key: grant.key,
              mimeType: grant.headers["Content-Type"] ?? mimeType,
              size,
              ...title ? { title } : {},
              ...tags.length ? { tags } : {},
              ...buckets2.length ? { bucketIds: buckets2.map((bucket) => bucket.id) } : {},
              ...allowDuplicate ? { allowDuplicate: true } : {}
            });
            const duplicate = duplicateOf(asset);
            if (duplicate) return noteDuplicate(index, file, duplicate, buckets2);
            outcomes[index] = { kind: "uploaded", file: shown(file), ...createdJson(asset) };
          } catch (error) {
            if (!(error instanceof CliError)) throw error;
            const duplicate = duplicateOf(error);
            if (duplicate) return noteDuplicate(index, file, duplicate, buckets2);
            firstError ??= error;
            outcomes[index] = { kind: "failed", file: shown(file), error: { code: error.code, message: error.message } };
            if (stopsBatch(error)) stopError ??= error;
          }
        },
        () => Boolean(stopError || bucketError)
      );
      bucketError ??= await bucketsReady.then(
        () => void 0,
        (error) => error
      );
      if (bucketError) throw bucketError;
      const pick = (kind) => outcomes.filter((outcome) => outcome?.kind === kind).map((outcome) => {
        const rest = { ...outcome };
        delete rest.kind;
        return rest;
      });
      const data = {
        uploaded: pick("uploaded"),
        duplicates: pick("duplicate"),
        failed: pick("failed"),
        notTried: files.slice(started).map(shown)
      };
      const reported = stopError ?? firstError;
      if (reported) throw withData(reported, data);
      return data;
    };
    importUrl = async (ctx, parsed) => {
      const url = parsed.positionals[0];
      if (!/^https?:\/\//i.test(url)) throw usageError("Give a full http(s) URL.");
      const tags = listOption(parsed.values.tag);
      const buckets2 = await bucketTargets(ctx, parsed.values.bucket);
      const title = stringOption(parsed.values.title);
      const body = {
        url,
        ...title ? { title } : {},
        ...tags.length ? { tags } : {},
        ...buckets2.length ? { bucketIds: buckets2.map((bucket) => bucket.id) } : {},
        ...parsed.values["allow-duplicate"] ? { allowDuplicate: true } : {}
      };
      let asset;
      try {
        if (parsed.values.link) asset = await ctx.api.post("/v1/assets", body);
        else {
          try {
            asset = await ctx.api.post("/v1/assets/import", body);
          } catch (error) {
            if (isMissingImportRoute(error)) asset = await ctx.api.post("/v1/assets", body);
            else if (error instanceof CliError && error.code === "invalid_request" && /answered HTTP/.test(error.message)) {
              throw new CliError(error.message, { exitCode: error.exitCode, code: error.code, status: error.status, server: error.server, hint: `To save the page as a link instead: homebase import ${url} --link` });
            } else throw error;
          }
        }
      } catch (error) {
        const duplicate = duplicateOf(error);
        if (!duplicate) throw error;
        asset = { duplicate_of: duplicate };
      }
      const found = duplicateOf(asset);
      if (found) {
        const duplicate = await describeDuplicate(ctx, found);
        return { imported: false, duplicate_of: duplicate, hint: duplicateHint(duplicate, { tags, buckets: buckets2, retry: `homebase import ${shellQuote(url)}` }) };
      }
      return { imported: true, importedAs: asset.type === "link" || asset.type === "embed" ? "link" : "file", ...createdJson(asset) };
    };
    tag = async (ctx, parsed) => {
      const add = listOption(parsed.values.add);
      const remove = listOption(parsed.values.remove);
      if (!add.length && !remove.length) throw usageError("Say what to change: --add <tag> and/or --remove <tag>.");
      const ids = [...new Set(parsed.positionals)];
      if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
      const results = [];
      const failed = [];
      let firstError;
      await eachLimit(
        ids,
        CONCURRENCY,
        async (id, index) => {
          try {
            const result = await ctx.api.post(`${assetPath(id)}/tags`, { ...add.length ? { add } : {}, ...remove.length ? { remove } : {} });
            results[index] = { id: result.id, tags: result.tags, added: result.added, removed: result.removed };
          } catch (error) {
            if (!(error instanceof CliError)) throw error;
            firstError ??= error;
            failed.push({ id, error: { code: error.code, message: error.message } });
          }
        },
        () => Boolean(firstError && stopsBatch(firstError))
      );
      const data = { results: results.filter(Boolean), ...failed.length ? { failed } : {} };
      if (firstError) throw withData(firstError, data);
      return data;
    };
    rename = async (ctx, parsed) => {
      const [id, ...words] = parsed.positionals;
      const title = words.join(" ").trim();
      if (!title) throw usageError("Give the new title.");
      const result = await ctx.api.patch(assetPath(id), { title });
      return { id: result.id, title: result.title };
    };
    commands2 = { search, recent, get, versions, view, link, download, upload, import: importUrl, tag, rename };
  }
});

// src/capabilities.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
function openApi(ctx) {
  return ctx.api.request("GET", "/v1/openapi.json", { auth: false }).catch(() => void 0);
}
function operationText(spec, path, method) {
  const op = spec.paths?.[path]?.[method];
  if (!op) return void 0;
  const schemas = spec.components?.schemas ?? {};
  const seen = /* @__PURE__ */ new Set();
  const parts = [];
  const visit = (value) => {
    const text = JSON.stringify(value) ?? "";
    parts.push(text);
    for (const [, name] of text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)) {
      if (seen.has(name)) continue;
      seen.add(name);
      visit(schemas[name]);
    }
  };
  visit(op);
  return parts.join("\n");
}
function cachePath(ctx) {
  return join4(ctx.store.dir, "capabilities.json");
}
function readCache(ctx) {
  try {
    const data = JSON.parse(readFileSync2(cachePath(ctx), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
async function hasDeletePreview(ctx, now = Date.now()) {
  const origin2 = new URL(ctx.apiUrl).origin;
  const cache = readCache(ctx);
  const hit = cache[origin2];
  if (hit?.deletePreview && now - hit.checkedAt < TTL_MS) return true;
  const spec = await openApi(ctx);
  const yes = Boolean(spec && /confirm_token/.test(operationText(spec, "/v1/assets/delete", "post") ?? ""));
  if (yes) {
    try {
      mkdirSync3(ctx.store.dir, { recursive: true, mode: 448 });
      writeFileSync2(cachePath(ctx), JSON.stringify({ ...cache, [origin2]: { deletePreview: true, checkedAt: now } }), { mode: 384 });
    } catch {
    }
  }
  return yes;
}
var TTL_MS;
var init_capabilities = __esm({
  "src/capabilities.ts"() {
    "use strict";
    TTL_MS = 24 * 60 * 60 * 1e3;
  }
});

// src/commands/trash.ts
var trash_exports = {};
__export(trash_exports, {
  commands: () => commands3
});
import { randomBytes as randomBytes2 } from "node:crypto";
import { mkdirSync as mkdirSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join5 } from "node:path";
function pendingPath(ctx) {
  return join5(ctx.store.dir, "pending-delete.json");
}
function readLocal(ctx) {
  try {
    const data = JSON.parse(readFileSync3(pendingPath(ctx), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
function writeLocal(ctx, data) {
  mkdirSync4(ctx.store.dir, { recursive: true, mode: 448 });
  const now = Date.now();
  const fresh = Object.fromEntries(Object.entries(data).filter(([, entry]) => entry.expiresAt > now));
  writeFileSync3(pendingPath(ctx), JSON.stringify(fresh, null, 2), { mode: 384 });
}
function normalizePreview(body, source) {
  const assets = (body.assets ?? []).map((asset) => ({
    id: asset.id,
    title: asset.title,
    type: asset.type,
    buckets: (asset.buckets ?? []).map((bucket) => ({ ...bucket }))
  }));
  return {
    preview: true,
    assets,
    notFound: body.notFound ?? [],
    confirm_token: String(body.confirm_token ?? ""),
    expires_in: Number(body.expires_in ?? LOCAL_TTL_S),
    source
  };
}
async function localPreview(ctx, ids) {
  const assets = [];
  const notFound = [];
  for (const id of ids) {
    try {
      const asset = await ctx.api.get(`/v1/assets/${encodeURIComponent(id)}`);
      assets.push({
        id: asset.id,
        title: asset.title,
        type: asset.type,
        // This server doesn't say whether a client link is live; a share page exists for every bucket that has a shareUrl.
        buckets: (asset.buckets ?? []).map((bucket) => ({ id: bucket.id, name: bucket.name, shareUrl: bucket.shareUrl }))
      });
    } catch (error) {
      if (error instanceof CliError && error.exitCode === EXIT.notFound) notFound.push(id);
      else throw error;
    }
  }
  const token = `local_${randomBytes2(12).toString("hex")}`;
  if (assets.length) writeLocal(ctx, { ...readLocal(ctx), [token]: { ids: assets.map((asset) => asset.id), api: ctx.apiUrl, expiresAt: Date.now() + LOCAL_TTL_S * 1e3 } });
  return { preview: true, assets, notFound, confirm_token: assets.length ? token : "", expires_in: LOCAL_TTL_S, source: "local" };
}
async function confirmDelete(ctx, ids, token, source) {
  if (source === "local") {
    const pending2 = readLocal(ctx);
    const entry = pending2[token];
    if (!entry || entry.expiresAt < Date.now() || entry.api !== ctx.apiUrl) {
      throw new CliError("That confirm token is unknown or expired. Run `homebase delete <ids\u2026>` again to preview, and show the user the list.", { exitCode: EXIT.confirm, code: "confirm_token_invalid" });
    }
    if (!sameIds(entry.ids, ids)) {
      throw new CliError("The ids don't match the preview this token was issued for. Preview exactly the assets the user approved.", { exitCode: EXIT.confirm, code: "confirm_token_mismatch" });
    }
    delete pending2[token];
    writeLocal(ctx, pending2);
    const body2 = await ctx.api.post("/v1/assets/delete", { ids });
    if (body2.preview === true) return normalizePreview(body2, "server");
    return body2;
  }
  let body;
  try {
    body = await ctx.api.post("/v1/assets/delete", { ids, confirm_token: token });
  } catch (error) {
    if (error instanceof CliError && error.exitCode !== EXIT.auth && error.exitCode !== EXIT.limit && /confirm/i.test(`${error.code} ${error.message}`)) {
      const said = /nothing was deleted/i.test(error.message);
      throw new CliError(`${error.message}${said ? "" : " Nothing was deleted. Run the preview again and show the user the list before confirming."}`, {
        exitCode: EXIT.confirm,
        code: "confirm_token_invalid",
        status: error.status
      });
    }
    throw error;
  }
  if (body.preview === true) return normalizePreview(body, "server");
  return body;
}
function deletedJson(result) {
  return { deleted: result.deleted ?? [], notFound: result.notFound ?? [], restorable: RESTORABLE };
}
function previewAssets(preview) {
  return preview.assets.map((asset) => ({
    id: asset.id,
    title: asset.title,
    type: asset.type,
    buckets: asset.buckets.map((bucket) => ({
      name: bucket.name,
      ...bucket.clientLinkLive !== void 0 ? { clientLinkLive: bucket.clientLinkLive } : {},
      ...bucket.clientOpened ? { clientOpened: true } : {},
      ...bucket.clientLinkLive === void 0 && bucket.shareUrl ? { hasSharePage: true } : {}
    }))
  }));
}
function needsConfirmation(ids, preview) {
  const rerun = `homebase delete ${ids.join(" ")} --confirm-token ${preview.confirm_token}`;
  const live = preview.assets.filter((asset) => asset.buckets.some((bucket) => bucket.clientLinkLive)).length;
  const nextStep = "Show the user every title and its buckets" + (live ? `, and warn that ${live} ${live === 1 ? "is" : "are"} on a live client link the client will stop seeing` : "") + `. Ask whether to delete them and end your turn. Only after they say yes in a new message, run: ${rerun}. The token expires in ${Math.round(preview.expires_in / 60)} minutes.`;
  throw new CliError(`Confirmation required. Nothing was deleted.`, {
    exitCode: EXIT.confirm,
    code: "confirmation_required",
    data: {
      confirmation_required: true,
      assets: previewAssets(preview),
      notFound: preview.notFound,
      confirm_token: preview.confirm_token,
      expires_in: preview.expires_in,
      next_step: nextStep
    }
  });
}
var LOCAL_TTL_S, RESTORABLE, sameIds, isPreview, del, deleted, restore, commands3;
var init_trash = __esm({
  "src/commands/trash.ts"() {
    "use strict";
    init_args();
    init_constants();
    init_capabilities();
    init_errors();
    init_output();
    init_buckets();
    LOCAL_TTL_S = 600;
    RESTORABLE = "30 days, by a workspace owner or admin: homebase restore <id>\u2026";
    sameIds = (a, b) => [...a].sort().join(",") === [...b].sort().join(",");
    isPreview = (result) => result.preview === true;
    del = async (ctx, parsed) => {
      const ids = [...new Set(parsed.positionals)];
      if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
      for (const id of ids) if (!looksLikeId(id)) throw usageError(`\u201C${id}\u201D isn't an asset id. Find ids with \`homebase search\`.`);
      const token = stringOption(parsed.values["confirm-token"]);
      if (token) {
        const source = token.startsWith("local_") ? "local" : "server";
        if (source === "server" && !await hasDeletePreview(ctx)) {
          throw usageError("This server doesn't issue confirm tokens; that token isn't from `homebase delete`. Run the preview again.");
        }
        const result = await confirmDelete(ctx, ids, token, source);
        if (isPreview(result)) return needsConfirmation(ids, result);
        return deletedJson(result);
      }
      let preview;
      if (await hasDeletePreview(ctx)) {
        const body = await ctx.api.post("/v1/assets/delete", { ids });
        if (body.preview !== true) return deletedJson(body);
        preview = normalizePreview(body, "server");
      } else {
        preview = await localPreview(ctx, ids);
      }
      if (!preview.assets.length) return deletedJson({ deleted: [], notFound: preview.notFound });
      return needsConfirmation(ids, preview);
    };
    deleted = async (ctx, parsed) => {
      let page;
      try {
        page = await ctx.api.get("/v1/assets/deleted", { limit: intOption(parsed.values.limit, "limit", 1, PAGE_LIMIT_MAX), cursor: stringOption(parsed.values.cursor) });
      } catch (error) {
        if (isMissingRoute(error, /No asset with id deleted/)) throw unsupportedError("listing Recently deleted", "Owners and admins can see it in the web app: Library \u2192 Recently deleted.");
        throw error;
      }
      const assets = (page.assets ?? page.items ?? []).map((asset) => ({
        id: asset.id,
        title: asset.title,
        type: asset.type,
        deletedAt: isoFromMs(asset.deletedAt),
        purgeAt: isoFromMs(asset.purgeAt),
        buckets: bucketNames(asset.buckets)
      }));
      return { assets, ...page.nextCursor ? { nextCursor: page.nextCursor } : {} };
    };
    restore = async (ctx, parsed) => {
      const ids = [...new Set(parsed.positionals)];
      if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
      for (const id of ids) if (!looksLikeId(id)) throw usageError(`\u201C${id}\u201D isn't an asset id. List them with \`homebase deleted\`.`);
      let result;
      try {
        result = await ctx.api.post("/v1/assets/restore", { ids });
      } catch (error) {
        if (isMissingRoute(error)) throw unsupportedError("restoring assets", "Owners and admins can restore them in the web app: Library \u2192 Recently deleted.");
        throw error;
      }
      return { restored: result.restored ?? [], notFound: result.notFound ?? [] };
    };
    commands3 = { delete: del, deleted, restore };
  }
});

// src/credentials.ts
import { spawnSync } from "node:child_process";
import { randomBytes as randomBytes3 } from "node:crypto";
import { chmodSync as chmodSync2, closeSync, existsSync as existsSync2, mkdirSync as mkdirSync5, openSync, readFileSync as readFileSync4, renameSync as renameSync3, rmSync as rmSync3, statSync as statSync3, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join6 } from "node:path";
function validateProfileName(name) {
  if (!PROFILE_NAME.test(name)) {
    throw usageError(`Invalid profile name "${name}". Use 1-40 letters, digits, dots, dashes or underscores.`);
  }
  return name;
}
function configDir(env = process.env) {
  if (env.HOMEBASE_CONFIG_DIR) return env.HOMEBASE_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME) return join6(env.XDG_CONFIG_HOME, "homebase");
  return join6(homedir2(), ".config", "homebase");
}
function onPath(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return result.status === 0;
}
function keychainService(env = process.env) {
  const custom = env.HOMEBASE_KEYCHAIN_SERVICE;
  return custom && /^[\w.-]{1,64}$/.test(custom) ? custom : KEYCHAIN_SERVICE;
}
function macKeychain(service = keychainService()) {
  return {
    name: "macOS Keychain",
    available: () => process.platform === "darwin" && existsSync2("/usr/bin/security"),
    get(account) {
      const result = spawnSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" });
      if (result.status !== 0) return null;
      return result.stdout.trim() || null;
    },
    set(account, label, secret) {
      if (!/^[\w.:-]+$/.test(secret) || !/^[\w .:()-]+$/.test(label) || !/^[\w.:-]+$/.test(account)) return false;
      const command = `add-generic-password -U -s ${service} -a "${account}" -l "${label}" -w "${secret}"
`;
      const result = spawnSync("/usr/bin/security", ["-i"], { input: command, encoding: "utf8" });
      return result.status === 0 && this.get(account) === secret;
    },
    delete(account) {
      spawnSync("/usr/bin/security", ["delete-generic-password", "-s", service, "-a", account], { stdio: "ignore" });
    }
  };
}
function secretTool(service = keychainService()) {
  return {
    name: "Secret Service",
    available: () => process.platform === "linux" && Boolean(process.env.DBUS_SESSION_BUS_ADDRESS) && onPath("secret-tool"),
    get(account) {
      const result = spawnSync("secret-tool", ["lookup", "service", service, "account", account], { encoding: "utf8" });
      if (result.status !== 0) return null;
      return result.stdout.trim() || null;
    },
    set(account, label, secret) {
      const result = spawnSync("secret-tool", ["store", "--label", label, "service", service, "account", account], { input: secret, encoding: "utf8" });
      return result.status === 0 && this.get(account) === secret;
    },
    delete(account) {
      spawnSync("secret-tool", ["clear", "service", service, "account", account], { stdio: "ignore" });
    }
  };
}
function defaultKeychain(env = process.env) {
  if (env.HOMEBASE_NO_KEYCHAIN === "1" || env.HOMEBASE_NO_KEYCHAIN === "true") return null;
  const service = keychainService(env);
  for (const backend of [macKeychain(service), secretTool(service)]) {
    try {
      if (backend.available()) return backend;
    } catch {
    }
  }
  return null;
}
function writePrivate(path, value) {
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync4(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 384 });
  chmodSync2(tmp, 384);
  renameSync3(tmp, path);
}
function readJsonFile(path, fallback) {
  if (!existsSync2(path)) return fallback;
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return fallback;
  }
}
function encodeSession(session) {
  return BLOB_PREFIX + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}
function decodeSecret(value, api) {
  if (value.startsWith(BLOB_PREFIX)) {
    try {
      return asSession(JSON.parse(Buffer.from(value.slice(BLOB_PREFIX.length), "base64url").toString("utf8")));
    } catch {
      return null;
    }
  }
  return value ? { api, access_token: value } : null;
}
function asSession(value) {
  if (!value || typeof value !== "object") return null;
  const raw = value;
  if (typeof raw.api !== "string" || typeof raw.access_token !== "string" || !raw.access_token) return null;
  return raw;
}
function canRefresh(session) {
  return Boolean(session.refresh_token && session.issuer && session.client_id);
}
function lockOwner(path) {
  try {
    const text = readFileSync4(path, "utf8");
    return text.trim().split(/\s+/)[2] ?? text;
  } catch {
    return void 0;
  }
}
function removeLockIf(path, owner) {
  if (lockOwner(path) === owner) rmSync3(path, { force: true });
}
var PROFILE_NAME, BLOB_PREFIX, CredentialStore, LOCK_STALE_MS, LOCK_WAIT_MS;
var init_credentials = __esm({
  "src/credentials.ts"() {
    "use strict";
    init_constants();
    init_errors();
    PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
    BLOB_PREFIX = "hbs1.";
    CredentialStore = class {
      dir;
      keychain;
      constructor(opts = {}) {
        this.dir = opts.dir ?? configDir(opts.env);
        this.keychain = opts.keychain === void 0 ? defaultKeychain(opts.env) : opts.keychain;
      }
      get configPath() {
        return join6(this.dir, "config.json");
      }
      get credentialsPath() {
        return join6(this.dir, "credentials.json");
      }
      get pendingPath() {
        return join6(this.dir, "pending-login.json");
      }
      lockPath(profile) {
        return join6(this.dir, `refresh-${validateProfileName(profile)}.lock`);
      }
      ensureDir() {
        mkdirSync5(this.dir, { recursive: true, mode: 448 });
      }
      readConfig() {
        const config = readJsonFile(this.configPath, { profiles: {} });
        if (!config.profiles || typeof config.profiles !== "object") config.profiles = {};
        return config;
      }
      writeConfig(config) {
        this.ensureDir();
        writePrivate(this.configPath, config);
      }
      readFileEntries() {
        const file = readJsonFile(this.credentialsPath, {});
        return file.profiles && typeof file.profiles === "object" ? { ...file.profiles } : {};
      }
      writeFileEntries(entries) {
        this.ensureDir();
        if (!Object.keys(entries).length) {
          rmSync3(this.credentialsPath, { force: true });
          return;
        }
        writePrivate(this.credentialsPath, { profiles: entries });
      }
      /** Saves a login for a profile: keychain first, else the 0600 file. */
      saveSession(profile, info, session) {
        validateProfileName(profile);
        const account = `profile:${profile}`;
        let storage = "file";
        if (this.keychain) {
          try {
            if (this.keychain.set(account, `Homebase CLI (${profile})`, encodeSession(session))) storage = "keychain";
          } catch {
            storage = "file";
          }
        }
        const entries = this.readFileEntries();
        if (storage === "file") entries[profile] = { session };
        else delete entries[profile];
        this.writeFileEntries(entries);
        const config = this.readConfig();
        const saved = {
          ...info,
          api: session.api,
          auth: canRefresh(session) ? "oauth" : "legacy",
          storage,
          savedAt: config.profiles[profile]?.savedAt && config.profiles[profile]?.tokenId === info.tokenId ? config.profiles[profile].savedAt : (/* @__PURE__ */ new Date()).toISOString()
        };
        config.profiles[profile] = saved;
        if (!config.defaultProfile || !config.profiles[config.defaultProfile]) config.defaultProfile = profile;
        this.writeConfig(config);
        return saved;
      }
      /** Saves a bare token (a Settings key, or an older device login) bound to `api`. */
      save(profile, info, token) {
        const { api, ...rest } = info;
        return this.saveSession(profile, rest, { api, access_token: token, scopes: info.scopes, workspace: info.workspace });
      }
      /** Replaces the tokens of an existing login (after a refresh), keeping where it is stored. */
      updateSession(profile, session) {
        const info = this.readConfig().profiles[profile];
        if (!info) return;
        if (info.storage === "keychain" && this.keychain) {
          try {
            if (this.keychain.set(`profile:${profile}`, `Homebase CLI (${profile})`, encodeSession(session))) return;
          } catch {
          }
        }
        const entries = this.readFileEntries();
        entries[profile] = { session };
        this.writeFileEntries(entries);
        if (info.storage !== "file") {
          const config = this.readConfig();
          if (config.profiles[profile]) config.profiles[profile].storage = "file";
          this.writeConfig(config);
        }
      }
      /** A profile's login, or null. Old stores (a bare token) read as a legacy session. */
      session(profile) {
        const info = this.readConfig().profiles[profile];
        if (!info) return null;
        if (info.storage === "keychain" && this.keychain) {
          try {
            const value = this.keychain.get(`profile:${profile}`);
            const session2 = value ? decodeSecret(value, info.api) : null;
            if (session2) return { session: session2, storage: "keychain" };
          } catch {
          }
        }
        const entry = this.readFileEntries()[profile];
        const session = asSession(entry?.session) ?? (typeof entry?.token === "string" && entry.token ? { api: info.api, access_token: entry.token } : null);
        return session ? { session, storage: "file" } : null;
      }
      /** The profile's current access token (compatibility helper). */
      token(profile) {
        const stored = this.session(profile);
        return stored ? { token: stored.session.access_token, storage: stored.storage } : null;
      }
      /** Forgets a profile's login everywhere. Returns what it had. */
      remove(profile) {
        const config = this.readConfig();
        const info = config.profiles[profile];
        if (this.keychain) {
          try {
            this.keychain.delete(`profile:${profile}`);
          } catch {
          }
        }
        const entries = this.readFileEntries();
        if (profile in entries) {
          delete entries[profile];
          this.writeFileEntries(entries);
        }
        if (info) {
          delete config.profiles[profile];
          if (config.defaultProfile === profile) config.defaultProfile = Object.keys(config.profiles)[0];
          this.writeConfig(config);
        }
        return info;
      }
      setDefault(profile) {
        const config = this.readConfig();
        if (!config.profiles[profile]) throw usageError(`No profile named "${profile}". Run \`homebase profiles\` to list them.`);
        config.defaultProfile = profile;
        this.writeConfig(config);
      }
      /** A device login waiting to be finished (`homebase login --no-wait`, then `--resume`). */
      savePending(pending2) {
        this.ensureDir();
        writePrivate(this.pendingPath, pending2);
      }
      readPending() {
        return readJsonFile(this.pendingPath, null);
      }
      clearPending() {
        rmSync3(this.pendingPath, { force: true });
      }
      /**
       * Runs `fn` holding a cross-process lock on the profile's refresh (an
       * O_EXCL lock file). A lock older than LOCK_STALE_MS is taken over (its
       * holder died). Waits up to LOCK_WAIT_MS, like Claude Code's
       * ~/.claude/.oauth_refresh.lock.
       *
       * The lock file holds a random owner nonce, and is removed only while it
       * still holds ours: a holder whose lock was taken over never deletes the
       * next holder's. A stale lock is removed only if it still holds the nonce
       * that was judged stale.
       */
      async withRefreshLock(profile, fn, opts = {}) {
        this.ensureDir();
        const path = this.lockPath(profile);
        const sleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
        const deadline = Date.now() + (opts.waitMs ?? LOCK_WAIT_MS);
        const staleMs = opts.staleMs ?? LOCK_STALE_MS;
        const nonce = randomBytes3(16).toString("hex");
        let held = false;
        while (!held) {
          try {
            const fd = openSync(path, "wx", 384);
            try {
              writeFileSync4(fd, `${process.pid} ${(/* @__PURE__ */ new Date()).toISOString()} ${nonce}
`);
            } finally {
              closeSync(fd);
            }
            held = true;
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
            try {
              if (Date.now() - statSync3(path).mtimeMs > staleMs) {
                const owner = lockOwner(path);
                if (owner !== void 0) removeLockIf(path, owner);
                continue;
              }
            } catch {
              continue;
            }
            if (Date.now() > deadline) {
              throw new CliError("Another homebase process is renewing this login and didn't finish. Retry in a moment.", { exitCode: EXIT.other, code: "refresh_locked" });
            }
            await sleep(50 + Math.floor(Math.random() * 100));
          }
        }
        try {
          return await fn();
        } finally {
          removeLockIf(path, nonce);
        }
      }
    };
    LOCK_STALE_MS = 3 * 60 * 1e3;
    LOCK_WAIT_MS = 45 * 1e3;
  }
});

// src/oauth.ts
import { createHash, randomBytes as randomBytes4 } from "node:crypto";
function origin(url) {
  return new URL(url).origin;
}
function sameOrigin(a, b) {
  try {
    return origin(a) === origin(b);
  } catch {
    return false;
  }
}
function defaultEndpoints(api) {
  const base = origin(api);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`
  };
}
function endpointsForIssuer(api, issuer) {
  if (issuer && !sameOrigin(issuer, api)) {
    throw new CliError(`This login's issuer (${issuer}) isn't its API (${origin(api)}), so it won't be used. Run \`homebase login\` again.`, {
      exitCode: EXIT.auth,
      code: "issuer_mismatch"
    });
  }
  return defaultEndpoints(api);
}
async function send(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers } });
  } catch (error) {
    throw new CliError(`Couldn't reach Homebase at ${origin(url)} (${networkReason(error)}).`, { code: "network_error" });
  }
  if (response.status >= 300 && response.status < 400) {
    await discard(response);
    throw new CliError(`Homebase answered ${new URL(url).pathname} with a redirect, which the CLI never follows with credentials.`, { code: "unexpected_redirect", status: response.status });
  }
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
  }
  return { status: response.status, body, headers: response.headers };
}
async function discover(fetchImpl, api) {
  const fallback = defaultEndpoints(api);
  let result;
  try {
    result = await send(fetchImpl, `${origin(api)}/.well-known/oauth-authorization-server`, { method: "GET" });
  } catch (error) {
    if (error instanceof CliError && error.code === "network_error") throw error;
    return fallback;
  }
  if (result.status !== 200 || !result.body || typeof result.body !== "object") return fallback;
  const meta = result.body;
  const pick = (key) => {
    const value = meta[key];
    return typeof value === "string" && sameOrigin(value, api) ? value : fallback[key];
  };
  const cli = meta.homebase_cli_client_id;
  return {
    issuer: pick("issuer"),
    authorization_endpoint: pick("authorization_endpoint"),
    token_endpoint: pick("token_endpoint"),
    revocation_endpoint: pick("revocation_endpoint"),
    ...typeof cli === "string" && cli.startsWith("https://") ? { cli_client_id: cli } : {}
  };
}
function cliClientIdFor(api, endpoints, env) {
  const override = env.HOMEBASE_CLIENT_ID?.trim();
  if (override) return override;
  if (endpoints?.cli_client_id) return endpoints.cli_client_id;
  return sameOrigin(api, DEFAULT_API_URL) ? DEFAULT_CLIENT_ID : void 0;
}
function createPkce() {
  const verifier = randomBytes4(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}
function randomState() {
  return randomBytes4(24).toString("base64url");
}
function authorizeUrl(endpoints, params) {
  const url = new URL(endpoints.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge", params.pkce.challenge);
  url.searchParams.set("code_challenge_method", params.pkce.method);
  url.searchParams.set("state", params.state);
  if (params.scopes?.length) url.searchParams.set("scope", params.scopes.join(" "));
  if (params.workspace) url.searchParams.set("workspace", params.workspace);
  if (params.deviceName) url.searchParams.set("device_name", params.deviceName);
  return url.toString();
}
function oauthFailure(status, body) {
  const raw = body && typeof body === "object" ? body : {};
  return {
    error: typeof raw.error === "string" ? raw.error : `http_${status}`,
    description: typeof raw.error_description === "string" ? raw.error_description : `HTTP ${status}`
  };
}
function form(values) {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values).toString() };
}
function asTokens(body) {
  const raw = body && typeof body === "object" ? body : null;
  if (!raw || typeof raw.access_token !== "string") return null;
  return {
    access_token: raw.access_token,
    refresh_token: typeof raw.refresh_token === "string" ? raw.refresh_token : void 0,
    expires_in: typeof raw.expires_in === "number" ? raw.expires_in : void 0,
    scope: typeof raw.scope === "string" ? raw.scope : void 0,
    token_type: typeof raw.token_type === "string" ? raw.token_type : void 0
  };
}
async function exchangeCode(fetchImpl, endpoints, params) {
  const result = await send(
    fetchImpl,
    endpoints.token_endpoint,
    form({ grant_type: "authorization_code", code: params.code, code_verifier: params.verifier, redirect_uri: params.redirectUri, client_id: params.clientId })
  );
  const tokens = result.status === 200 ? asTokens(result.body) : null;
  if (!tokens) {
    const failure = oauthFailure(result.status, result.body);
    throw new CliError(`Homebase didn't accept the login (${failure.error}: ${failure.description}). Run \`homebase login\` again.`, {
      exitCode: result.status === 429 ? EXIT.limit : EXIT.auth,
      code: failure.error,
      status: result.status
    });
  }
  return tokens;
}
async function refreshTokens(fetchImpl, endpoints, params) {
  let result;
  try {
    result = await send(fetchImpl, endpoints.token_endpoint, {
      ...form({ grant_type: "refresh_token", refresh_token: params.refreshToken, client_id: params.clientId }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS)
    });
  } catch (error) {
    return { ok: false, kind: "transient", message: error instanceof Error ? error.message : String(error) };
  }
  const tokens = result.status === 200 ? asTokens(result.body) : null;
  if (tokens) return { ok: true, tokens };
  const failure = oauthFailure(result.status, result.body);
  if (result.status === 400 && (failure.error === "invalid_grant" || failure.error === "invalid_client" || failure.error === "invalid_scope")) {
    return { ok: false, kind: "invalid_grant", message: failure.description };
  }
  if (result.status === 401) return { ok: false, kind: "invalid_grant", message: failure.description };
  const retry = Number(result.headers.get("Retry-After") ?? NaN);
  return { ok: false, kind: "transient", message: `${failure.error}: ${failure.description}`, ...Number.isFinite(retry) ? { retryAfterS: retry } : {} };
}
async function revokeToken(fetchImpl, endpoints, params) {
  const result = await send(fetchImpl, endpoints.revocation_endpoint, form({ token: params.token, client_id: params.clientId }));
  return result.status === 200;
}
var init_oauth = __esm({
  "src/oauth.ts"() {
    "use strict";
    init_http();
    init_constants();
    init_errors();
  }
});

// src/session.ts
function expiresAt(session) {
  if (!session.access_expires_at) return void 0;
  const at = Date.parse(session.access_expires_at);
  return Number.isFinite(at) ? at : void 0;
}
function needsRefresh(session, now) {
  const at = expiresAt(session);
  return canRefresh(session) && at !== void 0 && at - now < REFRESH_SKEW_MS;
}
function applyTokens(session, tokens, now) {
  return {
    ...session,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? session.refresh_token,
    access_expires_at: tokens.expires_in !== void 0 ? new Date(now + tokens.expires_in * 1e3).toISOString() : session.access_expires_at,
    scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : session.scopes
  };
}
function sameLogin(a, b) {
  return a.api === b.api && (a.client_id ?? "") === (b.client_id ?? "");
}
var EnvAuth, ProfileAuth;
var init_session = __esm({
  "src/session.ts"() {
    "use strict";
    init_constants();
    init_credentials();
    init_errors();
    init_oauth();
    EnvAuth = class {
      origin;
      value;
      constructor(value, api) {
        this.value = value;
        this.origin = origin(api);
      }
      async token() {
        return this.value;
      }
      async recover() {
        return null;
      }
    };
    ProfileAuth = class {
      origin;
      session;
      legacyNoticeShown = false;
      now;
      opts;
      constructor(opts) {
        this.opts = opts;
        this.session = opts.session;
        this.origin = origin(opts.session.api);
        this.now = opts.now ?? Date.now;
      }
      current() {
        return this.session;
      }
      async token() {
        if (!canRefresh(this.session)) {
          if (!this.legacyNoticeShown) {
            this.legacyNoticeShown = true;
            this.opts.notice?.(
              "legacy_login",
              "This saved login is an older kind that doesn't renew itself. Run `homebase login` once to switch to one that stays signed in (and can be revoked as one connection)."
            );
          }
          return this.session.access_token;
        }
        if (needsRefresh(this.session, this.now())) await this.refresh(this.session.access_token, false);
        return this.session.access_token;
      }
      async recover(failed, code2) {
        if (code2 !== "token_expired" && code2 !== "unauthorized") return null;
        const stored = this.reload();
        if (stored && stored.access_token !== failed && sameLogin(stored, this.session)) {
          this.session = stored;
          return stored.access_token;
        }
        if (!canRefresh(this.session)) return null;
        await this.refresh(failed, true);
        return this.session.access_token !== failed ? this.session.access_token : null;
      }
      reload() {
        try {
          return this.opts.store.session(this.opts.profile)?.session ?? null;
        } catch {
          return null;
        }
      }
      /**
       * Renews under the profile's lock. `failed` is the access token we had;
       * `force` refreshes even if the saved one still looks valid (after a 401).
       */
      async refresh(failed, force) {
        await this.opts.store.withRefreshLock(
          this.opts.profile,
          async () => {
            const stored = this.reload();
            if (stored && sameLogin(stored, this.session)) {
              if (stored.access_token !== failed && !needsRefresh(stored, this.now())) {
                this.session = stored;
                return;
              }
              this.session = stored;
            }
            const session = this.session;
            if (!canRefresh(session)) return;
            if (!force && !needsRefresh(session, this.now())) return;
            const endpoints = endpointsForIssuer(session.api, session.issuer);
            const outcome = await refreshTokens(this.opts.fetch, endpoints, { refreshToken: session.refresh_token, clientId: session.client_id });
            if (outcome.ok) {
              this.session = applyTokens(session, outcome.tokens, this.now());
              this.opts.store.updateSession(this.opts.profile, this.session);
              return;
            }
            if (outcome.kind === "invalid_grant") {
              throw new CliError(`Your Homebase login has ended (${outcome.message}). Run \`homebase login\` to sign in again.`, {
                exitCode: EXIT.auth,
                code: "login_expired"
              });
            }
            const at = expiresAt(session);
            if (at !== void 0 && at > this.now() && !force) {
              this.opts.notice?.("refresh_deferred", `Couldn't renew the Homebase login just now (${outcome.message}); using the current token.`);
              return;
            }
            throw new CliError(`Couldn't renew the Homebase login (${outcome.message}). Check the network and retry.`, {
              exitCode: EXIT.other,
              code: "refresh_failed",
              ...outcome.retryAfterS ? { server: { code: "refresh_failed", message: outcome.message, retry_after_s: outcome.retryAfterS } } : {}
            });
          }
        );
      }
    };
  }
});

// src/api.ts
var realSleep, MAX_REDIRECTS2, Api;
var init_api = __esm({
  "src/api.ts"() {
    "use strict";
    init_constants();
    init_errors();
    init_http();
    init_session();
    realSleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
    MAX_REDIRECTS2 = 3;
    Api = class {
      baseUrl;
      origin;
      auth;
      noAuth;
      fetchImpl;
      sleep;
      onWait;
      constructor(opts) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this.origin = new URL(this.baseUrl).origin;
        this.auth = opts.auth ?? (opts.token ? new EnvAuth(opts.token, this.baseUrl) : void 0);
        if (this.auth && this.auth.origin !== this.origin) {
          throw new CliError(`Internal error: a credential for ${this.auth.origin} can't be used with ${this.origin}.`, { exitCode: EXIT.usage, code: "origin_mismatch" });
        }
        this.noAuth = opts.noAuth;
        this.fetchImpl = opts.fetch ?? nodeFetch;
        this.sleep = opts.sleep ?? realSleep;
        this.onWait = opts.onWait;
      }
      /** Whether requests will carry a credential. */
      get hasAuth() {
        return Boolean(this.auth);
      }
      url(path, query) {
        const url = new URL(this.baseUrl + path);
        if (url.origin !== this.origin) throw new CliError(`Refusing to call ${url.origin}: not the API origin.`, { code: "origin_mismatch" });
        for (const [key, value] of Object.entries(query ?? {})) {
          if (value !== void 0) url.searchParams.set(key, String(value));
        }
        return url.toString();
      }
      /**
       * One fetch with redirects handled here (redirect: "manual"): a redirect
       * is followed only within the API origin; to anywhere else it is an error,
       * so an Authorization header can never be forwarded off-origin.
       */
      async fetchSameOrigin(url, init) {
        let target = url;
        let current = init;
        for (let hop = 0; ; hop++) {
          const response = await this.fetchImpl(target, { ...current, redirect: "manual" });
          const isRedirect = response.status >= 300 && response.status < 400 && response.status !== 304;
          if (!isRedirect && response.type !== "opaqueredirect") return response;
          const location = response.headers.get("Location");
          await discard(response);
          let next = null;
          try {
            next = location ? new URL(location, target) : null;
          } catch {
            next = null;
          }
          if (!next || next.origin !== this.origin) {
            throw new CliError(
              `Homebase at ${this.origin} redirected to ${next ? next.origin : "an unknown location"}. The CLI doesn't follow redirects to other sites with your login; check --api.`,
              { exitCode: EXIT.other, code: "cross_origin_redirect", status: response.status }
            );
          }
          if (hop >= MAX_REDIRECTS2) throw new CliError(`Too many redirects from ${this.origin}.`, { code: "too_many_redirects", status: response.status });
          if (response.status === 303 || (response.status === 301 || response.status === 302) && current.method !== "GET" && current.method !== "HEAD") {
            current = { ...current, method: "GET", body: void 0 };
          }
          target = next.toString();
        }
      }
      async request(method, path, opts = {}) {
        const needsAuth = opts.auth !== false;
        if (needsAuth && !this.auth) {
          throw this.noAuth?.() ?? new CliError("Not logged in to Homebase. Run `homebase login` (or set HOMEBASE_TOKEN), then retry.", {
            exitCode: EXIT.auth,
            code: "not_logged_in"
          });
        }
        const url = this.url(path, opts.query);
        let token = needsAuth ? await this.auth.token() : void 0;
        let recovered = false;
        for (let attempt = 0; ; attempt++) {
          const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
          if (token) headers.Authorization = `Bearer ${token}`;
          if (opts.body !== void 0) headers["Content-Type"] = "application/json";
          let response;
          try {
            response = await this.fetchSameOrigin(url, {
              method,
              headers,
              body: opts.body === void 0 ? void 0 : JSON.stringify(opts.body)
            });
          } catch (error2) {
            if (error2 instanceof CliError) throw error2;
            const reason = networkReason(error2);
            throw new CliError(`Couldn't reach Homebase at ${this.baseUrl} (${reason}). Check the network or --api, then retry.`, {
              exitCode: EXIT.other,
              code: "network_error"
            });
          }
          const text = await response.text();
          let body = text;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
          }
          if (response.ok) return body;
          const error = fromServer(response.status, body);
          if (response.status === 401 && token && !recovered) {
            recovered = true;
            const next = await this.auth.recover(token, error.server?.code);
            if (next && next !== token) {
              token = next;
              continue;
            }
          }
          const wait = error.server?.retry_after_s ?? Number(response.headers.get("Retry-After") ?? NaN);
          if (response.status === 429 && error.code === "rate_limited" && attempt < MAX_RATE_WAITS && Number.isFinite(wait) && wait <= MAX_AUTO_RETRY_S) {
            this.onWait?.(wait, error.message);
            await this.sleep(Math.max(1, wait) * 1e3);
            continue;
          }
          throw error;
        }
      }
      get(path, query) {
        return this.request("GET", path, { query });
      }
      post(path, body = {}) {
        return this.request("POST", path, { body });
      }
      patch(path, body) {
        return this.request("PATCH", path, { body });
      }
    };
  }
});

// src/device.ts
async function postJson(fetchImpl, url, body) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new CliError(`Couldn't reach Homebase (${error instanceof Error ? error.message : String(error)}).`, { code: "network_error" });
  }
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
  }
  return { status: response.status, body: parsed, headers: response.headers };
}
async function startDeviceLogin(fetchImpl, api, hostname2, opts = {}) {
  const { status, body } = await postJson(fetchImpl, `${api}/v1/auth/device`, {
    client_name: CLIENT_NAME,
    hostname: hostname2.slice(0, 80),
    ...opts.clientId ? { client_id: opts.clientId } : {},
    ...opts.scopes?.length ? { scope: opts.scopes.join(" ") } : {},
    ...opts.workspace ? { workspace: opts.workspace } : {}
  });
  if (status !== 200) {
    const server = extractServerError(body);
    throw new CliError(server?.message ?? `Couldn't start the login (HTTP ${status}).`, {
      exitCode: status === 429 ? EXIT.limit : EXIT.other,
      code: server?.code ?? `http_${status}`,
      status,
      server
    });
  }
  return body;
}
async function pollDeviceLogin(opts) {
  const now = opts.now ?? Date.now;
  const deadline = opts.deadline ?? now() + opts.start.expires_in * 1e3;
  let interval = Math.max(1, opts.start.interval || 5);
  let networkFailures = 0;
  for (; ; ) {
    await opts.sleep(interval * 1e3);
    if (now() > deadline) break;
    let result;
    try {
      result = await postJson(opts.fetch, `${opts.api}/v1/auth/device/token`, { device_code: opts.start.device_code });
      networkFailures = 0;
    } catch (error) {
      networkFailures++;
      if (networkFailures >= 5) throw error;
      opts.onPoll?.("network", interval);
      continue;
    }
    if (result.status === 200) return result.body;
    const server = extractServerError(result.body);
    switch (server?.code) {
      case "authorization_pending":
        opts.onPoll?.("pending", interval);
        continue;
      case "slow_down": {
        interval = Math.max(interval + 5, server.retry_after_s ?? 0);
        opts.onPoll?.("slow_down", interval);
        continue;
      }
      case "access_denied":
        throw new CliError(server.message, { exitCode: EXIT.auth, code: "access_denied", status: result.status, server });
      case "expired_token":
        throw new CliError(server.message, { exitCode: EXIT.auth, code: "expired_token", status: result.status, server, hint: "Run `homebase login` again." });
      default: {
        if (result.status === 429) {
          interval = Math.max(interval, server?.retry_after_s ?? interval + 5);
          continue;
        }
        if (result.status >= 500) {
          networkFailures++;
          if (networkFailures >= 5) {
            throw new CliError(server?.message ?? `Homebase kept failing while waiting for approval (HTTP ${result.status}). Retry \`homebase login\` later.`, {
              code: server?.code ?? `http_${result.status}`,
              status: result.status,
              server
            });
          }
          continue;
        }
        throw new CliError(server?.message ?? `Login polling failed (HTTP ${result.status}).`, {
          exitCode: EXIT.other,
          code: server?.code ?? `http_${result.status}`,
          status: result.status,
          server
        });
      }
    }
  }
  throw new CliError("The login code expired before it was approved. Run `homebase login` again.", { exitCode: EXIT.auth, code: "expired_token" });
}
var init_device = __esm({
  "src/device.ts"() {
    "use strict";
    init_constants();
    init_errors();
  }
});

// src/loopback.ts
function callbackPage(ok, title, message) {
  const mark = ok ? "\u2713" : "!";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} \xB7 Homebase CLI</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--text:#1a1a1a;--muted:#555;--line:#e5e5e0;--ok:#15803d;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#151515;--card:#1e1e1e;--text:#eee;--muted:#aaa;--line:#333;--ok:#4ade80;--bad:#f87171}}
body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);margin:0;padding:48px 16px}
main{max-width:440px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;font-size:22px;font-weight:700;margin-bottom:16px;color:${ok ? "var(--ok)" : "var(--bad)"};border:1px solid var(--line)}
h1{font-size:22px;line-height:1.3;margin:0 0 8px}p{margin:0;color:var(--muted)}
</style></head><body><main><div class="mark" aria-hidden="true">${mark}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}
function reply(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    Connection: "close"
  });
  response.end(html);
}
async function startLoopback(opts) {
  let settle;
  const result = new Promise((resolve4, reject) => {
    settle = { resolve: resolve4, reject };
  });
  result.catch(() => void 0);
  let done2 = false;
  let port = 0;
  const { createServer } = nodeRequire("node:http");
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (done2 || request.method !== "GET" || url.pathname !== CALLBACK_PATH || request.headers.host !== `127.0.0.1:${port}`) {
      reply(response, 404, callbackPage(false, "Not found", "This address only completes a Homebase CLI login."));
      return;
    }
    const params = url.searchParams;
    if (params.get("state") !== opts.state) {
      reply(response, 400, callbackPage(false, "Not this login", "This sign-in response doesn't belong to the login waiting in your terminal, so it was ignored."));
      return;
    }
    done2 = true;
    const finish = (error2, value) => {
      response.on("finish", () => close());
      if (error2) settle.reject(error2);
      else settle.resolve(value);
    };
    const error = params.get("error");
    if (error) {
      const denied = error === "access_denied";
      const description = params.get("error_description") ?? error;
      reply(
        response,
        200,
        callbackPage(false, denied ? "Login cancelled" : "Login failed", denied ? "Nothing was connected. You can close this tab and return to your terminal." : `${description}. Return to your terminal.`)
      );
      finish(new CliError(denied ? "The login was denied in the browser. Nothing was saved." : `The login failed: ${description}`, { exitCode: EXIT.auth, code: error }));
      return;
    }
    const code2 = params.get("code");
    if (!code2) {
      reply(response, 400, callbackPage(false, "Login failed", "The sign-in response had no code. Return to your terminal and run `homebase login` again."));
      finish(new CliError("The browser returned no authorization code. Run `homebase login` again.", { exitCode: EXIT.auth, code: "invalid_request" }));
      return;
    }
    reply(response, 200, callbackPage(true, "You're signed in to the Homebase CLI", "You can close this tab and return to your terminal."));
    finish(void 0, { code: code2, iss: params.get("iss") ?? void 0 });
  });
  await new Promise((resolve4, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve4();
    });
  });
  port = server.address().port;
  const timer = setTimeout(() => {
    if (done2) return;
    done2 = true;
    settle.reject(new CliError(`No approval arrived within ${Math.round(opts.timeoutMs / 6e4)} minutes. Run \`homebase login\` again.`, { exitCode: EXIT.auth, code: "login_timeout" }));
    close();
  }, opts.timeoutMs);
  timer.unref?.();
  function close() {
    clearTimeout(timer);
    if (!done2) {
      done2 = true;
      settle.reject(new CliError("The login was cancelled.", { exitCode: EXIT.auth, code: "login_cancelled" }));
    }
    server.close();
    server.closeAllConnections?.();
  }
  return { port, redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`, result, close };
}
var CALLBACK_PATH, escapeHtml;
var init_loopback = __esm({
  "src/loopback.ts"() {
    "use strict";
    init_errors();
    init_http();
    CALLBACK_PATH = "/callback";
    escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
});

// src/commands/auth.ts
var auth_exports = {};
__export(auth_exports, {
  commands: () => commands4,
  deviceName: () => deviceName,
  headlessReason: () => headlessReason
});
import { hostname } from "node:os";
function settingsUrl(workspaceUrl) {
  if (!workspaceUrl) return void 0;
  return workspaceUrl.replace(/\/library\/?$/, "") + "/settings/agents";
}
function deviceName() {
  return hostname().replace(/\.local$/i, "").slice(0, 60);
}
function headlessReason(env, platform = process.platform) {
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return "this is an SSH session";
  if (env.CI && env.CI !== "0" && env.CI.toLowerCase() !== "false") return "this looks like CI";
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return "there's no display";
  return void 0;
}
function parseScopes(raw) {
  const list = listOption(raw).flatMap((item) => item.split(/\s+/)).filter(Boolean);
  if (!list.length) return void 0;
  const unknown = list.filter((scope) => !ALL_SCOPES.includes(scope));
  if (unknown.length) throw usageError(`Unknown permission: ${unknown.join(", ")}. Choose from ${ALL_SCOPES.join(", ")}.`);
  return [...new Set(list)];
}
function parseWorkspace(raw) {
  const slug = stringOption(raw)?.trim().toLowerCase();
  if (slug === void 0) return void 0;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw usageError("--workspace takes the workspace's slug, as in \u2026/org/<slug>/library.");
  return slug;
}
function sessionFrom(api, tokens, clientId, now = Date.now()) {
  const refreshable = Boolean(tokens.refresh_token && clientId);
  const scopes = "scopes" in tokens && Array.isArray(tokens.scopes) ? tokens.scopes : tokens.scope?.split(/\s+/).filter(Boolean);
  return {
    api,
    ...refreshable ? { issuer: origin(api), client_id: clientId, refresh_token: tokens.refresh_token } : {},
    access_token: tokens.access_token,
    ...tokens.expires_in !== void 0 ? { access_expires_at: new Date(now + tokens.expires_in * 1e3).toISOString() } : {},
    scopes
  };
}
async function revokeSession(ctx, session) {
  try {
    if (canRefresh(session)) {
      const ok = await revokeToken(ctx.fetch, endpointsForIssuer(session.api, session.issuer), { token: session.refresh_token, clientId: session.client_id });
      return ok ? { revoked: true, how: "revoked" } : { revoked: false, how: "failed", detail: "The server didn't confirm the revocation." };
    }
    await new Api({ baseUrl: session.api, token: session.access_token, fetch: ctx.fetch, sleep: ctx.sleep }).post("/v1/auth/revoke", {});
    return { revoked: true, how: "revoked" };
  } catch (error) {
    if (isMissingRoute(error)) return { revoked: false, how: "unsupported", detail: "This Homebase server has no revoke call yet." };
    if (error instanceof CliError && error.status === 401) return { revoked: true, how: "already_invalid", detail: "The login was already revoked or expired." };
    return { revoked: false, how: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
async function saveLogin(ctx, profile, session, extra) {
  let me;
  try {
    me = await new Api({ baseUrl: session.api, token: session.access_token, fetch: ctx.fetch, sleep: ctx.sleep }).get("/v1/me");
  } catch {
    me = void 0;
  }
  const workspace = me?.workspace ? { id: me.workspace.id, name: me.workspace.name, slug: me.workspace.slug, ...me.workspace.url ? { url: me.workspace.url } : {} } : extra.workspace;
  const scopes = me?.token.scopes ?? session.scopes ?? [];
  const previous = ctx.store.session(profile);
  const saved = ctx.store.saveSession(
    profile,
    { workspace, tokenName: me?.token.name ?? extra.tokenName, tokenId: me?.token.id, scopes },
    { ...session, scopes, workspace }
  );
  if (previous && previous.session.access_token !== session.access_token && sameOrigin(previous.session.api, session.api)) {
    await revokeSession(ctx, previous.session);
  }
  ctx.store.clearPending();
  if (ctx.env.HOMEBASE_TOKEN) ctx.notice("env_token_set", "HOMEBASE_TOKEN is set in this shell and takes precedence over the saved login.");
  return {
    event: "logged_in",
    profile,
    api: session.api,
    flow: extra.flow,
    workspace: workspace ? { name: workspace.name, slug: workspace.slug } : void 0,
    user: me ? { name: me.user.name, role: me.user.role } : void 0,
    scopes,
    storage: saved.storage,
    renews: canRefresh(session)
  };
}
async function finishDeviceLogin(ctx, pending2) {
  const token = await pollDeviceLogin({
    fetch: ctx.fetch,
    sleep: ctx.sleep,
    api: pending2.api,
    start: pending2,
    deadline: Date.parse(pending2.expires_at)
  });
  return saveLogin(ctx, pending2.profile, sessionFrom(pending2.api, token, pending2.client_id), { flow: "device", tokenName: token.token_name, workspace: token.workspace });
}
async function deviceLogin(ctx, parsed) {
  let clientId;
  try {
    clientId = cliClientIdFor(ctx.apiUrl, await discover(ctx.fetch, ctx.apiUrl), ctx.env);
  } catch {
    clientId = cliClientIdFor(ctx.apiUrl, void 0, ctx.env);
  }
  const started = await startDeviceLogin(ctx.fetch, ctx.apiUrl, deviceName(), { clientId, scopes: parsed.scopes, workspace: parsed.workspace });
  const pending2 = {
    ...started,
    api: ctx.apiUrl,
    profile: parsed.profile,
    expires_at: new Date(Date.now() + started.expires_in * 1e3).toISOString(),
    ...clientId ? { client_id: clientId } : {}
  };
  if (parsed.noWait) ctx.store.savePending(pending2);
  const opened = parsed.noBrowser || parsed.reason ? false : await ctx.openUrl(started.verification_uri_complete);
  const ask = "Give the user verification_url (it opens on any device) and user_code; they check the code matches, pick the workspace and approve.";
  const event = {
    event: "login_started",
    flow: "device",
    verification_url: started.verification_uri_complete,
    user_code: started.user_code,
    expires_at: pending2.expires_at,
    profile: parsed.profile,
    browser_opened: opened,
    ...parsed.reason ? { why_device: parsed.reason } : {},
    next_step: parsed.noWait ? `${ask} Then run \`homebase login --resume\`.` : `${ask} This command waits and then prints a logged_in event.`
  };
  if (parsed.noWait) return event;
  ctx.emit(event);
  return finishDeviceLogin(ctx, pending2);
}
async function browserLogin(ctx, parsed) {
  const endpoints = await discover(ctx.fetch, ctx.apiUrl);
  const clientId = cliClientIdFor(ctx.apiUrl, endpoints, ctx.env);
  if (!clientId) return { done: false, reason: "this server doesn't name a Homebase CLI client" };
  const pkce = createPkce();
  const state = randomState();
  const loopback = await startLoopback({ state, timeoutMs: parsed.timeoutMs });
  const url = authorizeUrl(endpoints, {
    clientId,
    redirectUri: loopback.redirectUri,
    pkce,
    state,
    scopes: parsed.scopes,
    workspace: parsed.workspace,
    deviceName: deviceName()
  });
  const opened = parsed.noBrowser ? false : await ctx.openUrl(url);
  if (!parsed.noBrowser && !opened) {
    loopback.close();
    return { done: false, reason: "no browser could be opened" };
  }
  ctx.emit({
    event: "login_started",
    flow: "browser",
    verification_url: url,
    expires_at: new Date(Date.now() + parsed.timeoutMs).toISOString(),
    profile: parsed.profile,
    browser_opened: opened,
    next_step: (opened ? "The approval page is open in the browser on this computer. " : "Give the user verification_url to open in a browser on this same computer. ") + "They check the workspace and permissions and click Approve; this command waits and then prints a logged_in event. On another device, use `homebase login --device --no-wait` instead."
  });
  let callback;
  try {
    callback = await loopback.result;
  } finally {
    loopback.close();
  }
  if (callback.iss && !sameOrigin(callback.iss, endpoints.issuer)) {
    throw new CliError(`The sign-in response came from ${callback.iss}, not ${endpoints.issuer}. Nothing was saved.`, { exitCode: EXIT.auth, code: "issuer_mismatch" });
  }
  const tokens = await exchangeCode(ctx.fetch, endpoints, { code: callback.code, verifier: pkce.verifier, redirectUri: loopback.redirectUri, clientId });
  return { done: true, result: await saveLogin(ctx, parsed.profile, sessionFrom(ctx.apiUrl, tokens, clientId), { flow: "browser" }) };
}
function loginProfile(ctx) {
  const existing = ctx.store.readConfig().profiles[ctx.profile];
  if (existing && !sameOrigin(existing.api, ctx.apiUrl)) {
    throw usageError(
      `Profile ${ctx.profile} is logged in to ${origin(existing.api)}, not ${origin(ctx.apiUrl)}.`,
      `Add --profile <name> to keep both, or \`homebase logout --profile ${ctx.profile}\` first.`
    );
  }
  return ctx.profile;
}
var login, logout, whoami, profiles, profilesUse, commands4;
var init_auth = __esm({
  "src/commands/auth.ts"() {
    "use strict";
    init_api();
    init_args();
    init_constants();
    init_credentials();
    init_errors();
    init_device();
    init_loopback();
    init_oauth();
    init_session();
    login = async (ctx, parsed) => {
      if (parsed.values["no-wait"] && parsed.values.resume) throw usageError("Use either --no-wait or --resume.");
      if (parsed.values.resume) {
        const pending2 = ctx.store.readPending();
        if (!pending2) throw usageError("There's no login waiting to be finished. Run `homebase login`.");
        if (Date.parse(pending2.expires_at) < Date.now()) {
          ctx.store.clearPending();
          throw new CliError("That login code expired. Run `homebase login` again.", { exitCode: EXIT.auth, code: "expired_token" });
        }
        return finishDeviceLogin(ctx, pending2);
      }
      if (ctx.apiSource === "env" && !sameOrigin(ctx.apiUrl, DEFAULT_API_URL)) {
        throw usageError(
          `Not logging in to ${origin(ctx.apiUrl)}: it comes from HOMEBASE_API_URL, which a project's environment can set without the user noticing.`,
          `If the user means that server, run \`homebase login --api ${origin(ctx.apiUrl)}\`.`
        );
      }
      const profile = loginProfile(ctx);
      const scopes = parseScopes(parsed.values.scopes);
      const workspace = parseWorkspace(parsed.values.workspace);
      const noWait = Boolean(parsed.values["no-wait"]);
      const noBrowser = Boolean(parsed.values["no-browser"]);
      const timeoutMs = Number(ctx.env.HOMEBASE_LOGIN_TIMEOUT_MS) > 0 ? Number(ctx.env.HOMEBASE_LOGIN_TIMEOUT_MS) : LOGIN_TIMEOUT_MS;
      const headless = headlessReason(ctx.env);
      if (parsed.values.device || noWait || headless) {
        return deviceLogin(ctx, { noWait, noBrowser, scopes, workspace, profile, reason: parsed.values.device || noWait ? void 0 : headless });
      }
      const browser = await browserLogin(ctx, { noBrowser, scopes, workspace, profile, timeoutMs });
      if (browser.done) return browser.result;
      return deviceLogin(ctx, { noWait: false, noBrowser, scopes, workspace, profile, reason: browser.reason });
    };
    logout = async (ctx, parsed) => {
      const stored = ctx.store.session(ctx.profile);
      const revoke = parsed.values["keep-token"] || !stored ? { revoked: false, how: "none" } : await revokeSession(ctx, stored.session);
      const removed = ctx.store.remove(ctx.profile);
      const revokeAt = settingsUrl(removed?.workspace?.url);
      const note = removed && !revoke.revoked ? `${revoke.detail ? `${revoke.detail} ` : ""}The login still works until it is revoked: revoke \u201C${removed.tokenName ?? "Homebase CLI"}\u201D in Settings \u2192 Agents${revokeAt ? ` (${revokeAt})` : ""}.` : void 0;
      if (ctx.env.HOMEBASE_TOKEN) ctx.notice("env_token_set", "HOMEBASE_TOKEN is still set in this shell; unset it to stop using that token.");
      return {
        profile: ctx.profile,
        removed: Boolean(removed),
        revoked: revoke.revoked,
        ...revoke.how !== "none" ? { revoke: revoke.how } : {},
        ...!revoke.revoked && revokeAt ? { revoke_url: revokeAt } : {},
        ...note ? { next_step: note } : {}
      };
    };
    whoami = async (ctx) => {
      const me = await ctx.api.get("/v1/me");
      const session = ctx.auth instanceof ProfileAuth ? ctx.auth.current() : void 0;
      const login2 = session ? canRefresh(session) ? { kind: "oauth", renews: true, access_expires_at: session.access_expires_at } : { kind: "legacy", renews: false } : { kind: ctx.tokenSource === "env" ? "env" : "none", renews: false };
      return {
        profile: ctx.tokenSource === "env" ? null : ctx.profile,
        tokenSource: ctx.tokenSource,
        api: ctx.apiUrl,
        login: login2,
        workspace: me.workspace,
        // Never the email, even from an older server that still sends it.
        user: { id: me.user.id, name: me.user.name, role: me.user.role },
        token: { name: me.token.name, scopes: me.token.scopes },
        ...me.subscription ? { subscription: me.subscription } : {},
        ...me.usage ? { usage: me.usage } : {},
        ...me.rateLimit ? { rateLimit: me.rateLimit } : {}
      };
    };
    profiles = async (ctx) => {
      const config = ctx.store.readConfig();
      return {
        defaultProfile: config.defaultProfile ?? null,
        profiles: Object.entries(config.profiles).map(([name, info]) => ({
          name,
          default: name === config.defaultProfile,
          workspace: info.workspace,
          api: info.api,
          scopes: info.scopes ?? [],
          storage: info.storage,
          savedAt: info.savedAt
        }))
      };
    };
    profilesUse = async (ctx, parsed) => {
      const name = parsed.positionals[0];
      ctx.store.setDefault(name);
      return { defaultProfile: name };
    };
    commands4 = { login, logout, whoami, profiles, "profiles use": profilesUse };
  }
});

// src/connect.ts
function resolveClient(name) {
  return ALIASES[name.toLowerCase()];
}
function claudeCodeArgs(url, scope = "user") {
  return ["mcp", "add", "--transport", "http", "--scope", scope, SERVER_NAME, url];
}
function shellQuote2(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
function claudeCodeCommand(url, scope = "user") {
  return ["claude", ...claudeCodeArgs(url, scope)].map(shellQuote2).join(" ");
}
function windowsClaudeSpawn(found, args, comspec = "cmd.exe") {
  const absolute = (path) => /^[A-Za-z]:\\/.test(path);
  const exe = found.find((path) => absolute(path) && /\.exe$/i.test(path));
  if (exe) return { file: exe, args, verbatim: false };
  const cmd = found.find((path) => absolute(path) && /\.cmd$/i.test(path));
  if (!cmd) return null;
  const SAFE_PATH = /^[A-Za-z]:\\[A-Za-z0-9 _.()\\~+,=@{}[\]#$'-]+$/;
  const SAFE_ARG = /^[A-Za-z0-9_.:/@=+,-]+$/;
  if (!SAFE_PATH.test(cmd) || !args.every((arg) => SAFE_ARG.test(arg))) return null;
  return { file: comspec, args: ["/d", "/s", "/c", `""${cmd}" ${args.join(" ")}"`], verbatim: true };
}
function codexBlock(url, auth) {
  const lines = [`[mcp_servers.${SERVER_NAME}]`, `url = ${tomlString(url)}`];
  if (auth.kind === "token-env") lines.push(`bearer_token_env_var = ${tomlString(auth.envVar)}`);
  return lines.join("\n");
}
function tomlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function isHomebaseHeader(line) {
  const match = SECTION_HEADER.exec(line);
  if (!match) return false;
  const name = match[1].replace(/\s+/g, "");
  return name === `mcp_servers.${SERVER_NAME}` || name === `mcp_servers."${SERVER_NAME}"`;
}
function upsertCodexConfig(existing, block) {
  const lines = existing.length ? existing.replace(/\r\n/g, "\n").split("\n") : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const start = lines.findIndex(isHomebaseHeader);
  if (start === -1) {
    const out2 = [...lines];
    if (out2.length && out2[out2.length - 1].trim() !== "") out2.push("");
    out2.push(...block.split("\n"));
    return out2.join("\n") + "\n";
  }
  let end = start + 1;
  while (end < lines.length) {
    const match = SECTION_HEADER.exec(lines[end]);
    if (match && !match[1].replace(/\s+/g, "").startsWith(`mcp_servers.${SERVER_NAME}.`)) break;
    end++;
  }
  let trailing = 0;
  while (end - trailing - 1 > start && lines[end - trailing - 1].trim() === "") trailing++;
  const out = [...lines.slice(0, start), ...block.split("\n"), ...lines.slice(end - trailing)];
  return out.join("\n") + "\n";
}
function lineDiff(before, after, label = "config.toml") {
  const a = before.length ? before.replace(/\n$/, "").split("\n") : [];
  const b = after.length ? after.replace(/\n$/, "").split("\n") : [];
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i2 = a.length - 1; i2 >= 0; i2--) {
    for (let j2 = b.length - 1; j2 >= 0; j2--) {
      lcs[i2][j2] = a[i2] === b[j2] ? lcs[i2 + 1][j2 + 1] + 1 : Math.max(lcs[i2 + 1][j2], lcs[i2][j2 + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ op: "-", line: a[i++] });
    else ops.push({ op: "+", line: b[j++] });
  }
  while (i < a.length) ops.push({ op: "-", line: a[i++] });
  while (j < b.length) ops.push({ op: "+", line: b[j++] });
  if (!ops.some((entry) => entry.op !== " ")) return "";
  const keep = /* @__PURE__ */ new Set();
  ops.forEach((entry, index) => {
    if (entry.op !== " ") for (let k = index - 2; k <= index + 2; k++) keep.add(k);
  });
  const out = [`--- ${label}`, `+++ ${label} (with Homebase)`];
  let last = -2;
  ops.forEach((entry, index) => {
    if (!keep.has(index)) return;
    if (index !== last + 1) out.push("@@");
    out.push(`${entry.op}${entry.line}`);
    last = index;
  });
  return out.join("\n");
}
function cursorConfig(url) {
  return { mcpServers: { [SERVER_NAME]: { url } } };
}
function cursorDeeplink(url) {
  const config = Buffer.from(JSON.stringify({ url })).toString("base64");
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
function clickPath(client, url) {
  switch (client) {
    case "claude-desktop":
    case "claude-ai":
      return [
        `${client === "claude-ai" ? "On claude.ai" : "In Claude Desktop"}, open Customize \u2192 Connectors, click Add, then Custom \u2192 Web.`,
        `Name: Homebase   URL: ${url}   Click Continue, keep the detected sign-in settings, then click Add.`,
        "Click Connect next to Homebase, and approve the workspace and permissions in the Homebase window.",
        "In a chat, click + (or type /), open Connectors and turn on Homebase. Then ask, e.g. \u201CShow me the latest files from the summer campaign in Homebase\u201D. The connector also works in Desktop, Cowork and mobile.",
        "Team/Enterprise: an Owner first adds it under Organization settings \u2192 Connectors \u2192 Add \u2192 Custom \u2192 Web; members then click Connect.",
        "Recommended: add the Homebase skill (agent/dist/homebase-skill.zip from `npm run build:agent`) under Customize \u2192 Skills."
      ];
    case "chatgpt":
      return [
        "Who can add it: on ChatGPT Business, workspace owners and admins; on Enterprise/Edu, owners, admins and members an admin allows. Pro can add it, but read-only (search and view, no uploads or changes). OpenAI doesn't list Free or Plus. Can't add it? Use Claude, Codex or the Homebase web app.",
        "On chatgpt.com (web only), open Plugins, click +, then \u201CAdd custom MCP server\u201D. No Developer mode needed.",
        `Name: Homebase   Connection: ${url}   Authentication: OAuth.`,
        "Tick \u201CI understand and want to continue\u201D, click \u201CCreate as a plugin\u201D, then install the plugin and approve the workspace and permissions in the Homebase window.",
        "In a new chat, type @, pick Homebase and ask, e.g. \u201CShow me the latest files from the summer campaign\u201D. Type @Homebase again when a follow-up needs new files.",
        "Business/Enterprise/Edu: an admin then publishes it for the workspace from workspace settings; each member connects with their own Homebase login.",
        "Optional: upload the Homebase skill zip under Skills \u2192 Create \u2192 Upload from your computer."
      ];
  }
}
var CLIENTS, ALIASES, SERVER_NAME, SECTION_HEADER;
var init_connect = __esm({
  "src/connect.ts"() {
    "use strict";
    CLIENTS = ["claude-code", "codex", "cursor", "claude-desktop", "claude-ai", "chatgpt"];
    ALIASES = {
      claude: "claude-code",
      "claude-code": "claude-code",
      claudecode: "claude-code",
      codex: "codex",
      cursor: "cursor",
      "claude-desktop": "claude-desktop",
      desktop: "claude-desktop",
      "claude-ai": "claude-ai",
      "claude.ai": "claude-ai",
      claudeai: "claude-ai",
      chatgpt: "chatgpt",
      openai: "chatgpt"
    };
    SERVER_NAME = "homebase";
    SECTION_HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;
  }
});

// src/commands/setup.ts
var setup_exports = {};
__export(setup_exports, {
  CODEX_HEADLESS_NOTE: () => CODEX_HEADLESS_NOTE,
  commands: () => commands5
});
import { spawnSync as spawnSync2 } from "node:child_process";
import { copyFileSync, existsSync as existsSync3, mkdirSync as mkdirSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname2, join as join7, resolve as resolve3 } from "node:path";
function system32(tool) {
  return join7(process.env.SystemRoot || "C:\\Windows", "System32", tool);
}
function findClaude() {
  const win = process.platform === "win32";
  const result = spawnSync2(win ? system32("where.exe") : "which", ["claude"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) return [];
  const paths = (result.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return win ? paths.filter((path) => dirname2(path).toLowerCase() !== resolve3(process.cwd()).toLowerCase()) : paths;
}
function connectClaudeCode(url, opts) {
  const command = claudeCodeCommand(url, opts.scope);
  const after = "Then the user runs /mcp inside Claude Code and chooses homebase \u2192 Authenticate to approve the workspace in the browser (over SSH or headless: `claude mcp login homebase --no-browser`, then paste the redirect URL back). The Homebase plugin bundles this plus the skill: claude plugin install homebase@homebase.";
  const found = findClaude();
  const hasClaude = found.length > 0;
  if (!opts.write || !hasClaude) {
    return {
      client: "claude-code",
      url,
      applied: false,
      command,
      claude_found: hasClaude,
      next_step: hasClaude ? `Show the user the command; only if they agree, rerun with --write (or they run it). ${after}` : `Install Claude Code, then run: ${command}. ${after}`
    };
  }
  const args = claudeCodeArgs(url, opts.scope);
  const spawn2 = process.platform === "win32" ? windowsClaudeSpawn(found, args, system32("cmd.exe")) : { file: "claude", args, verbatim: false };
  if (!spawn2) {
    return {
      client: "claude-code",
      url,
      applied: false,
      command,
      claude_found: true,
      next_step: `Couldn't run claude safely from here (Windows). The user runs this in a terminal: ${command}. ${after}`
    };
  }
  const result = spawnSync2(spawn2.file, spawn2.args, { encoding: "utf8", windowsVerbatimArguments: spawn2.verbatim });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const already = /already exists/i.test(output);
  if (result.status !== 0 && !already) throw new CliError(`claude mcp add failed: ${output}`, { code: "claude_failed", data: { client: "claude-code", url, command, applied: false } });
  return { client: "claude-code", url, applied: !already, alreadyConfigured: already, command, next_step: after };
}
function connectCodex(ctx, url, opts) {
  const codexHome = ctx.env.CODEX_HOME || join7(homedir3(), ".codex");
  const path = resolve3(ctx.cwd, opts.configPath ?? join7(codexHome, "config.toml"));
  const auth = opts.token ? { kind: "token-env", envVar: opts.tokenEnv } : { kind: "oauth" };
  const block = codexBlock(url, auth);
  const before = existsSync3(path) ? readFileSync5(path, "utf8") : "";
  const after = upsertCodexConfig(before, block);
  const diff = lineDiff(before, after, path);
  const next = opts.token ? `Codex sends the bearer token from $${opts.tokenEnv}. The user creates a key in Homebase Settings \u2192 Agents with only the permissions it needs and provides it from a secrets manager or CI secret, never a shell profile or dotfile. ${CODEX_HEADLESS_NOTE}` : `Then the user runs \`codex mcp login homebase\` and approves the workspace and permissions in the browser. ${CODEX_HEADLESS_NOTE}`;
  const base = { client: "codex", url, configPath: path, snippet: block };
  if (!diff) return { ...base, applied: false, alreadyConfigured: true, next_step: next };
  if (!opts.write) return { ...base, applied: false, diff, next_step: `Show the user this diff; only if they agree, rerun with --write. ${next}` };
  mkdirSync6(dirname2(path), { recursive: true });
  let backup;
  if (before) {
    backup = `${path}.bak`;
    copyFileSync(path, backup);
  }
  writeFileSync5(path, after);
  return { ...base, applied: true, diff, ...backup ? { backup } : {}, next_step: next };
}
function connectCursor(url) {
  return {
    client: "cursor",
    url,
    applied: false,
    configPath: "~/.cursor/mcp.json",
    config: cursorConfig(url),
    deeplink: cursorDeeplink(url),
    next_step: "The user opens the deeplink (or adds the config to ~/.cursor/mcp.json), then signs in from Cursor Settings \u2192 MCP (or `cursor-agent mcp login homebase`)."
  };
}
async function probe(ctx, url, init = {}) {
  try {
    const response = await ctx.fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(15e3) });
    await response.text().catch(() => "");
    return response;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
var CODEX_HEADLESS_NOTE, connect, doctor, commands5;
var init_setup = __esm({
  "src/commands/setup.ts"() {
    "use strict";
    init_args();
    init_connect();
    init_constants();
    init_errors();
    CODEX_HEADLESS_NOTE = "For `codex exec` (approval policy never), Homebase write tools are refused unless approved in config: see the skill's references/setup.md (Codex, headless).";
    connect = async (ctx, parsed) => {
      const name = parsed.positionals[0];
      const url = mcpUrl(ctx.apiUrl);
      if (!name) return { url, clients: [...CLIENTS], next_step: "homebase connect <client>" };
      const client = resolveClient(name);
      if (!client) throw usageError(`Unknown client \u201C${name}\u201D. Choose one of: ${CLIENTS.join(", ")}.`);
      const write = Boolean(parsed.values.write);
      switch (client) {
        case "claude-code": {
          const scope = stringOption(parsed.values.scope) ?? "user";
          if (!["user", "project", "local"].includes(scope)) throw usageError("--scope must be user, project or local.");
          return connectClaudeCode(url, { write, scope });
        }
        case "codex": {
          const tokenEnv = stringOption(parsed.values["token-env"]) ?? "HOMEBASE_TOKEN";
          if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw usageError("--token-env must be an environment variable name like HOMEBASE_TOKEN.");
          const token = Boolean(parsed.values.token) || Boolean(parsed.values["token-env"]);
          return connectCodex(ctx, url, { write, token, tokenEnv, configPath: stringOption(parsed.values.config) });
        }
        case "cursor":
          return connectCursor(url);
        default:
          return { client, url, applied: false, steps: clickPath(client, url), next_step: "The user follows steps in that app; nothing to run here." };
      }
    };
    doctor = async (ctx) => {
      const checks = [];
      const major2 = Number(process.versions.node.split(".")[0]);
      checks.push({ name: "node", status: major2 >= 20 ? "ok" : "fail", detail: `Node ${process.versions.node}${major2 >= 20 ? "" : " (needs 20 or newer)"}` });
      const spec = await probe(ctx, `${ctx.apiUrl}/v1/openapi.json`);
      if (spec instanceof Error) checks.push({ name: "api", status: "fail", detail: `Can't reach ${ctx.apiUrl}: ${spec.message}` });
      else checks.push({ name: "api", status: spec.ok ? "ok" : "fail", detail: `${ctx.apiUrl} answered ${spec.status}` });
      checks.push({
        name: "credentials",
        status: "ok",
        detail: ctx.store.keychain ? `tokens are stored in ${ctx.store.keychain.name}` : `no OS keychain; tokens are stored in ${ctx.store.credentialsPath} (0600)`
      });
      if (!ctx.auth) {
        checks.push({ name: "token", status: "fail", detail: "Not logged in. Run `homebase login` (or set HOMEBASE_TOKEN).", exitCode: EXIT.auth });
      } else {
        try {
          const me = await ctx.api.get("/v1/me");
          checks.push({ name: "token", status: "ok", detail: `\u201C${me.token.name}\u201D for ${me.workspace.name} (${me.user.name || "?"}, ${me.user.role ?? "?"}) from ${ctx.tokenSource === "env" ? "HOMEBASE_TOKEN" : `profile ${ctx.profile}`}` });
          const missing = ALL_SCOPES.filter((scope) => !me.token.scopes.includes(scope));
          checks.push({
            name: "permissions",
            status: missing.length ? "warn" : "ok",
            detail: `has ${me.token.scopes.join(", ") || "none"}${missing.length ? `; lacks ${missing.join(", ")} (add them in Settings \u2192 Agents if needed)` : ""}`
          });
          if (me.subscription?.status && me.subscription.status !== "active") {
            checks.push({ name: "subscription", status: "fail", detail: `subscription is ${me.subscription.status}`, exitCode: EXIT.limit });
          }
          const used = me.usage?.used ?? {};
          const near = Object.entries(me.usage?.limits ?? {}).filter(([metric, limit]) => limit > 0 && (used[metric] ?? 0) / limit >= 0.9).map(([metric, limit]) => `${metric} ${used[metric]}/${limit}`);
          checks.push({ name: "usage", status: near.length ? "warn" : "ok", detail: near.length ? `near the monthly limit: ${near.join(", ")} (resets ${me.usage?.resetsAt})` : `within limits (resets ${me.usage?.resetsAt})` });
        } catch (error) {
          if (!(error instanceof CliError)) throw error;
          checks.push({ name: "token", status: "fail", detail: error.message, exitCode: error.exitCode });
        }
      }
      const mcp = mcpUrl(ctx.apiUrl);
      const mcpResponse = await probe(ctx, mcp, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "homebase-doctor", version: "1" } } })
      });
      if (mcpResponse instanceof Error) checks.push({ name: "mcp", status: "fail", detail: `Can't reach ${mcp}: ${mcpResponse.message}` });
      else if (mcpResponse.status === 401 && mcpResponse.headers.get("www-authenticate")) {
        checks.push({ name: "mcp", status: "ok", detail: `${mcp} is up and asks for OAuth (${mcpResponse.headers.get("www-authenticate").slice(0, 120)})` });
      } else if (mcpResponse.ok) checks.push({ name: "mcp", status: "ok", detail: `${mcp} answered ${mcpResponse.status}` });
      else if (mcpResponse.status === 404) checks.push({ name: "mcp", status: "warn", detail: `${mcp} isn't deployed yet (404). The CLI works without it.` });
      else checks.push({ name: "mcp", status: "warn", detail: `${mcp} answered ${mcpResponse.status}` });
      const failed = checks.find((check) => check.status === "fail");
      const data = { api: ctx.apiUrl, mcp, checks: checks.map((check) => ({ name: check.name, status: check.status, detail: check.detail })) };
      if (failed) throw new CliError(failed.detail, { exitCode: failed.exitCode ?? EXIT.other, code: `doctor_${failed.name}`, data });
      return data;
    };
    commands5 = { connect, doctor };
  }
});

// src/context.ts
var context_exports = {};
__export(context_exports, {
  createCtx: () => createCtx,
  normalizeApiUrl: () => normalizeApiUrl,
  openInBrowser: () => openInBrowser
});
import { spawn } from "node:child_process";
function openInBrowser(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
  const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  return new Promise((resolve4) => {
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.on("error", () => resolve4(false));
      child.on("spawn", () => {
        child.unref();
        resolve4(true);
      });
    } catch {
      resolve4(false);
    }
  });
}
function normalizeApiUrl(raw, source = "--api") {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw usageError(`${source} must be a full URL like ${DEFAULT_API_URL}.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname))) {
    throw usageError(`${source} must use https (plain http only for localhost, 127.0.0.1 or [::1]).`);
  }
  if (url.username || url.password) throw usageError(`${source} can't contain a user name or password.`);
  return url.toString().replace(/\/+$/, "");
}
function originOf(url) {
  return new URL(url).origin;
}
function resolveCredential(args) {
  const { env, store, config, apiUrl } = args;
  const target = originOf(apiUrl);
  const envToken = env.HOMEBASE_TOKEN?.trim();
  if (envToken) {
    const home = args.envApi ?? config.profiles[args.profile]?.api ?? DEFAULT_API_URL;
    if (originOf(home) === target) return { auth: new EnvAuth(envToken, apiUrl), tokenSource: "env", profile: args.profile };
    return {
      tokenSource: "none",
      profile: args.profile,
      noAuth: () => usageError(
        `HOMEBASE_TOKEN is for ${originOf(home)}, so it isn't sent to ${target} (from ${args.apiSource === "flag" ? "--api" : "HOMEBASE_API_URL"}). Homebase never sends a token to a server it wasn't issued for.`,
        `To use a token with ${target}, set HOMEBASE_API_URL=${target} alongside HOMEBASE_TOKEN, or run \`homebase login --api ${target}\`.`
      )
    };
  }
  const candidates = args.profileExplicit ? [args.profile] : [args.profile, ...Object.keys(config.profiles).filter((name) => name !== args.profile)];
  for (const name of candidates) {
    const info = config.profiles[name];
    if (!info || originOf(info.api) !== target) continue;
    const stored = store.session(name);
    if (!stored || originOf(stored.session.api) !== target) continue;
    const auth = new ProfileAuth({ store, profile: name, session: stored.session, fetch: args.fetch, sleep: args.sleep, notice: args.notice });
    return { auth, tokenSource: stored.storage, profile: name };
  }
  const saved = config.profiles[args.profile];
  if (saved && originOf(saved.api) !== target) {
    const via = args.apiSource === "flag" ? "--api" : "HOMEBASE_API_URL";
    return {
      tokenSource: "none",
      profile: args.profile,
      noAuth: () => usageError(
        `Your saved login (profile ${args.profile}) is for ${originOf(saved.api)}, not ${target} (from ${via}). Homebase never sends a saved login to another server.`,
        `To use ${target}, run \`homebase login --api ${target} --profile <name>\`, or set HOMEBASE_TOKEN for it.`
      )
    };
  }
  return { tokenSource: "none", profile: args.profile };
}
function createCtx(parsed, overrides = {}) {
  const io = overrides.io ?? processIo();
  const env = overrides.env ?? process.env;
  const store = overrides.store ?? new CredentialStore({ dir: void 0, env });
  const pretty = Boolean(parsed.values.pretty);
  const view2 = { full: Boolean(parsed.values.full), thumbnails: Boolean(parsed.values["with-thumbnails"]) };
  const config = store.readConfig();
  const namedProfile = stringOption(parsed.values.profile) ?? env.HOMEBASE_PROFILE;
  const profile = validateProfileName(namedProfile ?? config.defaultProfile ?? "default");
  const profileInfo = config.profiles[profile];
  const flagApi = stringOption(parsed.values.api);
  const envApi = env.HOMEBASE_API_URL?.trim() || void 0;
  const apiSource = flagApi ? "flag" : envApi ? "env" : profileInfo ? "profile" : "default";
  const apiUrl = flagApi ? normalizeApiUrl(flagApi, "--api") : envApi ? normalizeApiUrl(envApi, "HOMEBASE_API_URL") : normalizeApiUrl(profileInfo?.api ?? DEFAULT_API_URL);
  const fetchImpl = overrides.fetch ?? nodeFetch;
  const sleep = overrides.sleep ?? realSleep;
  const notices = /* @__PURE__ */ new Set();
  const notice = (code2, message) => {
    if (notices.has(code2)) return;
    notices.add(code2);
    io.stderr(JSON.stringify({ notice: code2, message }) + "\n");
  };
  const usual = profileInfo?.api ?? DEFAULT_API_URL;
  if ((apiSource === "flag" || apiSource === "env") && originOf(apiUrl) !== originOf(usual)) {
    notice("api_override", `Using the Homebase API at ${originOf(apiUrl)} (from ${apiSource === "flag" ? "--api" : "HOMEBASE_API_URL"}), not ${originOf(usual)}.`);
  }
  const credential = resolveCredential({
    env,
    store,
    config,
    profile,
    profileExplicit: namedProfile !== void 0,
    apiUrl,
    apiSource,
    flagApi,
    envApi: envApi ? normalizeApiUrl(envApi, "HOMEBASE_API_URL") : void 0,
    fetch: fetchImpl,
    sleep,
    notice
  });
  const api = new Api({
    baseUrl: apiUrl,
    auth: credential.auth,
    noAuth: credential.noAuth,
    fetch: fetchImpl,
    sleep,
    onWait: (seconds, message) => notice("rate_limit_wait", `${message} Waiting ${seconds}s, then retrying.`)
  });
  return {
    io,
    view: view2,
    pretty,
    emit: (data) => io.stdout(formatJson(okJson(data), pretty)),
    notice,
    env,
    apiUrl,
    apiSource,
    apiExplicit: apiSource === "flag" || apiSource === "env",
    profile: credential.profile,
    profileExplicit: namedProfile !== void 0,
    profileInfo: config.profiles[credential.profile],
    store,
    auth: credential.auth,
    tokenSource: credential.tokenSource,
    fetch: fetchImpl,
    sleep,
    api,
    openUrl: overrides.openUrl ?? openInBrowser,
    cwd: overrides.cwd ?? process.cwd()
  };
}
var LOOPBACK_HOST;
var init_context = __esm({
  "src/context.ts"() {
    "use strict";
    init_api();
    init_constants();
    init_credentials();
    init_errors();
    init_http();
    init_session();
    init_output();
    init_args();
    LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  }
});

// src/main.ts
init_args();
init_constants();
init_errors();
init_output();
init_specs();
var LOADERS = {
  library: () => Promise.resolve().then(() => (init_library(), library_exports)),
  buckets: () => Promise.resolve().then(() => (init_buckets(), buckets_exports)),
  trash: () => Promise.resolve().then(() => (init_trash(), trash_exports)),
  auth: () => Promise.resolve().then(() => (init_auth(), auth_exports)),
  setup: () => Promise.resolve().then(() => (init_setup(), setup_exports))
};
async function run(argv, overrides = {}) {
  const io = overrides.io ?? processIo();
  const pretty = argv.includes("--pretty");
  try {
    const parsed = parseCommandLine(argv, SPECS);
    if (parsed.values.version) {
      io.stdout(`${CLI_VERSION}
`);
      return EXIT.ok;
    }
    if (parsed.group && !parsed.command) {
      if (parsed.values.help) {
        io.stdout(groupHelp(parsed.group) + "\n");
        return EXIT.ok;
      }
      throw usageError(`\`homebase ${parsed.group}\` needs a sub-command.`, groupHelp(parsed.group).replace(/\n/g, " | "));
    }
    if (!parsed.command) {
      io.stdout(topHelp() + "\n");
      return parsed.values.help ? EXIT.ok : EXIT.usage;
    }
    if (parsed.values.help) {
      io.stdout(helpFor(parsed.command) + "\n");
      return EXIT.ok;
    }
    const spec = parsed.command;
    let data;
    if (spec.module === "schema") {
      const name = parsed.positionals.join(" ") || void 0;
      if (name && !SPECS.some((entry) => entry.name === name || entry.aliases?.includes(name))) throw usageError(`No command "${name}".`, "Run `homebase schema` for all of them.");
      data = schemaJson(name);
    } else {
      const [{ createCtx: createCtx2 }, module] = await Promise.all([Promise.resolve().then(() => (init_context(), context_exports)), LOADERS[spec.module]()]);
      const ctx = createCtx2(parsed, { ...overrides, io });
      data = await module.commands[spec.name](ctx, parsed);
    }
    io.stdout(formatJson(okJson(data), pretty));
    return EXIT.ok;
  } catch (error) {
    const failure = error instanceof CliError ? error : new CliError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, { code: "internal" });
    io.stdout(formatJson(errorJson(failure), pretty));
    if (!(error instanceof CliError) && process.env.HOMEBASE_DEBUG && error instanceof Error) io.stderr(`${error.stack}
`);
    return failure.exitCode;
  }
}

// src/bin.ts
var major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  process.stdout.write(
    JSON.stringify({ ok: false, schema: 1, error: { code: "node_too_old", message: `homebase needs Node.js 20 or newer (this is ${process.versions.node}).`, exit_code: 1 } }) + "\n"
  );
  process.exit(1);
}
var code = await run(process.argv.slice(2));
process.exitCode = code;
var pending = 2;
var done = () => {
  if (--pending === 0) process.exit(code);
};
process.stdout.write("", done);
process.stderr.write("", done);
