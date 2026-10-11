#!/usr/bin/env node

// src/args.ts
import { parseArgs } from "node:util";

// src/errors.ts
var EXIT = {
  ok: 0,
  other: 1,
  usage: 2,
  auth: 3,
  limit: 4,
  notFound: 5,
  /** A destructive action needs the user's explicit yes (delete preview printed). */
  confirm: 6
};
var CliError = class extends Error {
  exitCode;
  code;
  status;
  server;
  hint;
  constructor(message, opts = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = opts.exitCode ?? EXIT.other;
    this.code = opts.code ?? "error";
    this.status = opts.status;
    this.server = opts.server;
    this.hint = opts.hint;
  }
};
function usageError(message, hint) {
  return new CliError(message, { exitCode: EXIT.usage, code: "usage", hint });
}
function exitCodeFor(status, code) {
  if (status === 401) return EXIT.auth;
  if (status === 403) return EXIT.auth;
  if (status === 402 || status === 429) return EXIT.limit;
  if (status === 404) return EXIT.notFound;
  if (code === "access_denied" || code === "expired_token") return EXIT.auth;
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
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") return void 0;
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
function errorJson(error) {
  const stop = doNotRetryLine(error);
  return {
    error: {
      ...stop ? { do_not_retry: stop } : {},
      ...error.server ?? {},
      code: error.code,
      message: error.message,
      ...error.status !== void 0 ? { status: error.status } : {},
      ...error.hint ? { hint: error.hint } : {},
      exit_code: error.exitCode
    }
  };
}

// src/args.ts
var GLOBAL_OPTIONS = {
  json: { type: "boolean", description: "Print one compact JSON document (stable shape) instead of human output" },
  api: { type: "string", value: "url", description: "API base URL (env HOMEBASE_API_URL)" },
  profile: { type: "string", short: "p", value: "name", description: "Saved login to use (env HOMEBASE_PROFILE)" },
  help: { type: "boolean", short: "h", description: "Show help" },
  version: { type: "boolean", description: "Print the CLI version" }
};
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
    const token2 = argv[i];
    if (token2 === "--") break;
    if (token2.startsWith("-")) {
      if (takesValue.has(token2)) i++;
      continue;
    }
    indexes.push(i);
    if (indexes.length === 1 && groups.has(token2)) continue;
    break;
  }
  return indexes;
}
function parseCommandLine(argv, commands) {
  const byName = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Set();
  for (const command2 of commands) {
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
function helpFor(command) {
  const lines = [command.summary, "", `Usage: ${command.usage}`];
  const options = Object.entries(command.options ?? {});
  if (options.length) {
    lines.push("", "Options:");
    for (const [name, spec] of options) lines.push(optionLine(name, spec));
  }
  lines.push("", "Global options:");
  for (const [name, spec] of Object.entries(GLOBAL_OPTIONS)) lines.push(optionLine(name, spec));
  if (command.examples?.length) lines.push("", "Examples:", ...command.examples.map((example) => `  ${example}`));
  return lines.join("\n");
}
function optionLine(name, spec) {
  const flag = `${spec.short ? `-${spec.short}, ` : "    "}--${name}${spec.type === "string" ? ` <${spec.value ?? "value"}>` : ""}${spec.multiple ? "\u2026" : ""}`;
  return `  ${flag.padEnd(28)} ${spec.description ?? ""}`;
}

// src/constants.ts
var DEFAULT_API_URL = "https://next-caribou-11.convex.site";
var DEFAULT_CLIENT_ID = "https://homebase-delta-seven.vercel.app/oauth/homebase-cli.json";
var REFRESH_SKEW_MS = 5 * 60 * 1e3;
var LOGIN_TIMEOUT_MS = 10 * 60 * 1e3;
var CLI_VERSION = "0.1.0";
var CLIENT_NAME = "Homebase CLI";
var USER_AGENT = `homebase-cli/${CLI_VERSION} (node ${process.version}; ${process.platform})`;
var KEYCHAIN_SERVICE = "homebase-cli";
var ALL_SCOPES = ["search", "assets:read", "assets:write", "tags:write", "buckets:write", "assets:delete"];
var SCOPE_LABELS = {
  search: "Search and read details",
  "assets:read": "Download files",
  "assets:write": "Upload and rename",
  "tags:write": "Tag assets",
  "buckets:write": "Manage buckets",
  "assets:delete": "Delete assets (soft)",
  "handoffs:write": "Draft handoffs"
};
var MAX_AUTO_RETRY_S = 10;
function mcpUrl(api) {
  return `${api.replace(/\/+$/, "")}/mcp`;
}

// src/context.ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// src/credentials.ts
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
function validateProfileName(name) {
  if (!PROFILE_NAME.test(name)) {
    throw usageError(`Invalid profile name "${name}". Use 1-40 letters, digits, dots, dashes or underscores.`);
  }
  return name;
}
function configDir(env = process.env) {
  if (env.HOMEBASE_CONFIG_DIR) return env.HOMEBASE_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "homebase");
  return join(homedir(), ".config", "homebase");
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
    available: () => process.platform === "darwin" && existsSync("/usr/bin/security"),
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
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 384 });
  chmodSync(tmp, 384);
  renameSync(tmp, path);
}
function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
var BLOB_PREFIX = "hbs1.";
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
var CredentialStore = class {
  dir;
  keychain;
  constructor(opts = {}) {
    this.dir = opts.dir ?? configDir(opts.env);
    this.keychain = opts.keychain === void 0 ? defaultKeychain(opts.env) : opts.keychain;
  }
  get configPath() {
    return join(this.dir, "config.json");
  }
  get credentialsPath() {
    return join(this.dir, "credentials.json");
  }
  get pendingPath() {
    return join(this.dir, "pending-login.json");
  }
  lockPath(profile) {
    return join(this.dir, `refresh-${validateProfileName(profile)}.lock`);
  }
  ensureDir() {
    mkdirSync(this.dir, { recursive: true, mode: 448 });
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
      rmSync(this.credentialsPath, { force: true });
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
  save(profile, info, token2) {
    const { api, ...rest } = info;
    return this.saveSession(profile, rest, { api, access_token: token2, scopes: info.scopes, workspace: info.workspace });
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
  savePending(pending) {
    this.ensureDir();
    writePrivate(this.pendingPath, pending);
  }
  readPending() {
    return readJsonFile(this.pendingPath, null);
  }
  clearPending() {
    rmSync(this.pendingPath, { force: true });
  }
  /**
   * Runs `fn` holding a cross-process lock on the profile's refresh (an
   * O_EXCL lock file). A lock older than LOCK_STALE_MS is taken over (its
   * holder died). Waits up to LOCK_WAIT_MS, like Claude Code's
   * ~/.claude/.oauth_refresh.lock.
   */
  async withRefreshLock(profile, fn, opts = {}) {
    this.ensureDir();
    const path = this.lockPath(profile);
    const sleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
    const deadline = Date.now() + (opts.waitMs ?? LOCK_WAIT_MS);
    let fd;
    while (fd === void 0) {
      try {
        fd = openSync(path, "wx", 384);
        writeFileSync(fd, `${process.pid} ${(/* @__PURE__ */ new Date()).toISOString()}
`);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
            rmSync(path, { force: true });
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
      closeSync(fd);
      rmSync(path, { force: true });
    }
  }
};
var LOCK_STALE_MS = 30 * 1e3;
var LOCK_WAIT_MS = 20 * 1e3;

// src/oauth.ts
import { createHash, randomBytes } from "node:crypto";
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
    const reason = error instanceof Error ? error.cause instanceof Error ? error.cause.message : error.message : String(error);
    throw new CliError(`Couldn't reach Homebase at ${origin(url)} (${reason}).`, { code: "network_error" });
  }
  if (response.status >= 300 && response.status < 400) {
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
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}
function randomState() {
  return randomBytes(24).toString("base64url");
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
    result = await send(fetchImpl, endpoints.token_endpoint, form({ grant_type: "refresh_token", refresh_token: params.refreshToken, client_id: params.clientId }));
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

// src/session.ts
var EnvAuth = class {
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
var ProfileAuth = class {
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
          "Note: this saved login is an older kind that doesn't renew itself. Run `homebase login` once to switch to one that stays signed in (and can be revoked as one connection)."
        );
      }
      return this.session.access_token;
    }
    if (needsRefresh(this.session, this.now())) await this.refresh(this.session.access_token, false);
    return this.session.access_token;
  }
  async recover(failed, code) {
    if (code !== "token_expired" && code !== "unauthorized") return null;
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
          this.opts.notice?.(`Note: couldn't renew the Homebase login just now (${outcome.message}); using the current token.`);
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
function sameLogin(a, b) {
  return a.api === b.api && (a.client_id ?? "") === (b.client_id ?? "");
}

// src/api.ts
var realSleep = (ms) => new Promise((resolve4) => setTimeout(resolve4, ms));
var MAX_REDIRECTS = 3;
var Api = class {
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
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
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
      if (hop >= MAX_REDIRECTS) throw new CliError(`Too many redirects from ${this.origin}.`, { code: "too_many_redirects", status: response.status });
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
    let token2 = needsAuth ? await this.auth.token() : void 0;
    let recovered = false;
    for (let attempt = 0; ; attempt++) {
      const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
      if (token2) headers.Authorization = `Bearer ${token2}`;
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
        const reason = error2 instanceof Error ? error2.cause instanceof Error ? error2.cause.message : error2.message : String(error2);
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
      if (response.status === 401 && token2 && !recovered) {
        recovered = true;
        const next = await this.auth.recover(token2, error.server?.code);
        if (next && next !== token2) {
          token2 = next;
          continue;
        }
      }
      const wait = error.server?.retry_after_s ?? Number(response.headers.get("Retry-After") ?? NaN);
      if (response.status === 429 && error.code === "rate_limited" && attempt < 2 && Number.isFinite(wait) && wait <= MAX_AUTO_RETRY_S) {
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

// src/output.ts
function interactive(io) {
  return io.isTTY && (io.stdinTTY ?? io.isTTY);
}
function processIo() {
  const isTTY = Boolean(process.stderr.isTTY);
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    isTTY,
    color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb",
    stdinTTY: Boolean(process.stdin.isTTY),
    stdoutTTY: Boolean(process.stdout.isTTY)
  };
}
function printJson(io, value) {
  io.stdout(JSON.stringify(value) + "\n");
}
function style(io) {
  const wrap = (open2, close) => (text) => io.color ? `\x1B[${open2}m${text}\x1B[${close}m` : text;
  return { bold: wrap("1", "22"), dim: wrap("2", "22"), cyan: wrap("36", "39"), yellow: wrap("33", "39"), red: wrap("31", "39"), green: wrap("32", "39") };
}
function isoFromMs(ms) {
  if (typeof ms === "string" && ms) return ms;
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : void 0;
}
function shortDate(value) {
  if (value === void 0 || value === null || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
function formatBytes(bytes) {
  if (bytes === void 0 || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
var CONTROL = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b\[[0-?]*[ -/]*[@-~]|[\u0000-\u001f\u007f-\u009f]/g;
function stripControl(text) {
  return text.replace(CONTROL, "");
}
function shellQuote(text) {
  return `'${stripControl(text).replace(/'/g, "'\\''")}'`;
}
function truncate(text, max) {
  const clean = stripControl(text).replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 1))}\u2026`;
}
var OWN_SGR = /^\u001b\[(?:1|2|22|31|32|33|36|39)m$/;
function safeCell(text) {
  return text.replace(CONTROL, (match) => OWN_SGR.test(match) ? match : "");
}
function table(rows, gap = "  ") {
  if (!rows.length) return "";
  const safe = rows.map((row) => row.map(safeCell));
  const widths = [];
  for (const row of safe) row.forEach((cell, index) => widths[index] = Math.max(widths[index] ?? 0, visibleLength(cell)));
  return safe.map((row) => row.map((cell, index) => index === row.length - 1 ? cell : cell + " ".repeat(widths[index] - visibleLength(cell))).join(gap).trimEnd()).join("\n");
}
function visibleLength(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "").length;
}
function searchResultJson(result) {
  return {
    id: result.id,
    title: result.title,
    type: result.type,
    source: result.source,
    buckets: (result.buckets ?? []).map((bucket) => ({ id: bucket.id, name: bucket.name })),
    latestAt: isoFromMs(result.latestAt),
    uploadedAt: isoFromMs(result.uploadedAt),
    fileCreatedAt: isoFromMs(result.fileCreatedAt),
    tags: result.tags ?? [],
    aiTags: result.aiTags ?? [],
    snippet: result.snippet
  };
}
function interpretationJson(interpretation) {
  if (!interpretation) return void 0;
  const out = { ...interpretation };
  const range = interpretation.dateRange;
  if (range && typeof range === "object") {
    out.dateRange = { ...range, from: isoFromMs(range.from) ?? range.from, to: isoFromMs(range.to) ?? range.to };
  }
  return out;
}
function searchJson(response) {
  return {
    interpretation: interpretationJson(response.interpretation),
    groups: (response.groups ?? []).map((group) => ({
      label: group.label,
      kind: group.kind,
      results: (group.results ?? []).map(searchResultJson)
    })),
    total: response.total ?? 0,
    nextCursor: response.nextCursor ?? null,
    textOnly: response.textOnly ?? false
  };
}
function assetSummaryJson(asset) {
  return {
    id: asset.id,
    title: asset.title,
    type: asset.type,
    mimeType: asset.mimeType,
    size: asset.size,
    source: asset.source,
    tags: asset.tags ?? [],
    buckets: (asset.buckets ?? []).map((bucket) => ({ id: bucket.id, name: bucket.name })),
    linkUrl: asset.linkUrl,
    appUrl: asset.appUrl ?? asset.url,
    indexing: asset.indexing?.status
  };
}
function bucketJson(bucket) {
  return {
    id: bucket.id,
    name: bucket.name,
    slug: bucket.slug,
    description: bucket.description,
    itemCount: bucket.itemCount ?? 0,
    shareUrl: bucket.shareUrl,
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt
  };
}
function describeInterpretation(interpretation) {
  if (!interpretation) return [];
  const parts = [];
  const buckets2 = interpretation.buckets;
  if (buckets2?.length) parts.push(`bucket ${buckets2.map((bucket) => `\u201C${bucket.name}\u201D`).join(", ")}`);
  const range = interpretation.dateRange;
  if (range) parts.push(range.label ?? `${shortDate(range.from)}\u2013${shortDate(range.to)}`);
  const types = interpretation.fileTypes;
  if (types?.length) parts.push(`type ${types.join("/")}`);
  const tags = interpretation.tags;
  if (tags?.length) parts.push(`tags ${tags.map((tag2) => `#${tag2}`).join(" ")}`);
  if (typeof interpretation.source === "string") parts.push(`added by ${interpretation.source}`);
  const terms = interpretation.terms;
  if (terms?.length) parts.push(`words \u201C${terms.join(" ")}\u201D`);
  if (typeof interpretation.sort === "string" && interpretation.sort !== "relevance") parts.push(`${interpretation.sort} first`);
  const lines = [parts.length ? parts.join(" \xB7 ") : "plain text search"];
  for (const note of interpretation.notes ?? []) lines.push(note);
  return lines;
}
function renderSearch(io, response, query) {
  const s = style(io);
  const out = [];
  const [summary, ...notes] = describeInterpretation(response.interpretation);
  if (query) out.push(`${s.bold("Search")} ${query}`);
  if (summary) out.push(`${s.dim("Read as:")} ${summary}`);
  for (const note of notes) out.push(s.dim(`  ${note}`));
  const groups = response.groups ?? [];
  if (!groups.some((group) => group.results?.length)) {
    out.push("", "No matches. Rephrase the question, or drop a bucket, date or type from it.");
    return out.join("\n");
  }
  for (const group of groups) {
    if (!group.results?.length) continue;
    out.push("", s.bold(group.label));
    out.push(
      table(
        group.results.map((result) => [
          s.cyan(result.id),
          result.type,
          shortDate(result.latestAt ?? result.uploadedAt),
          truncate(result.title, 48) + (result.tags?.length ? s.dim(`  ${result.tags.map((tag2) => `#${tag2}`).join(" ")}`) : "")
        ])
      ).split("\n").map((line) => `  ${line}`).join("\n")
    );
  }
  const shown = groups.reduce((sum, group) => sum + (group.results?.length ?? 0), 0);
  out.push("", s.dim(`${shown} shown of ${response.total ?? shown}.`));
  if (response.nextCursor) out.push(s.dim(`More: homebase search --cursor ${response.nextCursor}`));
  return out.join("\n");
}
function renderAsset(io, asset) {
  const s = style(io);
  const rows = [
    ["Id", asset.id],
    ["Type", [asset.type, asset.mimeType, asset.size ? formatBytes(asset.size) : ""].filter(Boolean).join(" \xB7 ")],
    ["Added", [shortDate(asset.uploadedAt), asset.source === "agent" ? "by an agent" : "", asset.addedBy ? `(${asset.addedBy})` : ""].filter(Boolean).join(" ")]
  ];
  if (asset.latestAt && asset.latestAt !== asset.uploadedAt) rows.push(["Latest", shortDate(asset.latestAt)]);
  if (asset.fileCreatedAt) rows.push(["Created", shortDate(asset.fileCreatedAt)]);
  if (asset.versionsCount && asset.versionsCount > 1) rows.push(["Version", `${asset.version ?? asset.versionsCount} of ${asset.versionsCount}`]);
  rows.push(["Buckets", asset.buckets?.length ? asset.buckets.map((bucket) => bucket.name).join(", ") : "none (library only)"]);
  rows.push(["Tags", asset.tags?.length ? asset.tags.map((tag2) => `#${tag2}`).join(" ") : "none"]);
  if (asset.aiTags?.length) rows.push(["AI tags", asset.aiTags.join(", ")]);
  if (asset.linkUrl) rows.push(["Link", asset.linkUrl]);
  if (asset.thumbnailUrl) rows.push(["Preview", asset.thumbnailUrl]);
  if (asset.appUrl ?? asset.url) rows.push(["Open", asset.appUrl ?? asset.url]);
  if (asset.indexing?.status && asset.indexing.status !== "done") rows.push(["Indexing", [asset.indexing.status, asset.indexing.reason].filter(Boolean).join(": ")]);
  const out = [s.bold(asset.title), table(rows.map(([key, value]) => [s.dim(key), value]))];
  if (asset.description) out.push("", asset.description);
  if (asset.visibleText) out.push("", s.dim("Visible text:"), truncate(asset.visibleText, 600));
  return out.join("\n");
}
function renderBuckets(io, buckets2, nextCursor) {
  const s = style(io);
  if (!buckets2.length) return "No buckets yet. Create one with `homebase bucket create <name>`.";
  const out = [
    table([
      [s.dim("ID"), s.dim("ITEMS"), s.dim("UPDATED"), s.dim("NAME")],
      ...buckets2.map((bucket) => [s.cyan(bucket.id), String(bucket.itemCount ?? 0), shortDate(bucket.updatedAt ?? bucket.createdAt), bucket.name])
    ])
  ];
  if (nextCursor) out.push("", s.dim(`More: homebase buckets --cursor ${nextCursor}`));
  return out.join("\n");
}

// src/context.ts
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
function promptConfirm(io) {
  return async (question) => {
    if (!process.stdin.isTTY || !io.isTTY) return false;
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = await new Promise((resolve4) => rl.question(`${question} [y/N] `, resolve4));
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  };
}
var LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
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
  const json = Boolean(parsed.values.json);
  const config = store.readConfig();
  const namedProfile = stringOption(parsed.values.profile) ?? env.HOMEBASE_PROFILE;
  const profile = validateProfileName(namedProfile ?? config.defaultProfile ?? "default");
  const profileInfo = config.profiles[profile];
  const flagApi = stringOption(parsed.values.api);
  const envApi = env.HOMEBASE_API_URL?.trim() || void 0;
  const apiSource = flagApi ? "flag" : envApi ? "env" : profileInfo ? "profile" : "default";
  const apiUrl = flagApi ? normalizeApiUrl(flagApi, "--api") : envApi ? normalizeApiUrl(envApi, "HOMEBASE_API_URL") : normalizeApiUrl(profileInfo?.api ?? DEFAULT_API_URL);
  const fetchImpl = overrides.fetch ?? ((input, init) => fetch(input, init));
  const sleep = overrides.sleep ?? realSleep;
  const notices = /* @__PURE__ */ new Set();
  const notice = (message) => {
    if (notices.has(message)) return;
    notices.add(message);
    io.stderr(`${message}
`);
  };
  const usual = profileInfo?.api ?? DEFAULT_API_URL;
  if ((apiSource === "flag" || apiSource === "env") && originOf(apiUrl) !== originOf(usual)) {
    notice(`Note: using the Homebase API at ${originOf(apiUrl)} (from ${apiSource === "flag" ? "--api" : "HOMEBASE_API_URL"}), not ${originOf(usual)}.`);
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
    onWait: (seconds, message) => {
      if (!json) io.stderr(`${message} Waiting ${seconds}s\u2026
`);
    }
  });
  return {
    io,
    json,
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
    confirm: overrides.confirm ?? promptConfirm(io),
    cwd: overrides.cwd ?? process.cwd()
  };
}

// src/commands/auth.ts
import { hostname } from "node:os";

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

// src/loopback.ts
import { createServer } from "node:http";
var CALLBACK_PATH = "/callback";
var escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
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
  let done = false;
  let port = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (done || request.method !== "GET" || url.pathname !== CALLBACK_PATH || request.headers.host !== `127.0.0.1:${port}`) {
      reply(response, 404, callbackPage(false, "Not found", "This address only completes a Homebase CLI login."));
      return;
    }
    done = true;
    const finish = (error2, value) => {
      response.on("finish", () => close());
      if (error2) settle.reject(error2);
      else settle.resolve(value);
    };
    const params = url.searchParams;
    if (params.get("state") !== opts.state) {
      reply(response, 400, callbackPage(false, "Login not completed", "This sign-in response didn't match the login started in your terminal, so it was ignored. Run `homebase login` again."));
      finish(new CliError("The browser returned a response for a different login (state mismatch). Nothing was saved. Run `homebase login` again.", { exitCode: EXIT.auth, code: "state_mismatch" }));
      return;
    }
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
    const code = params.get("code");
    if (!code) {
      reply(response, 400, callbackPage(false, "Login failed", "The sign-in response had no code. Return to your terminal and run `homebase login` again."));
      finish(new CliError("The browser returned no authorization code. Run `homebase login` again.", { exitCode: EXIT.auth, code: "invalid_request" }));
      return;
    }
    reply(response, 200, callbackPage(true, "You're signed in to the Homebase CLI", "You can close this tab and return to your terminal."));
    finish(void 0, { code, iss: params.get("iss") ?? void 0 });
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
    if (done) return;
    done = true;
    settle.reject(new CliError(`No approval arrived within ${Math.round(opts.timeoutMs / 6e4)} minutes. Run \`homebase login\` again.`, { exitCode: EXIT.auth, code: "login_timeout" }));
    close();
  }, opts.timeoutMs);
  timer.unref?.();
  function close() {
    clearTimeout(timer);
    if (!done) {
      done = true;
      settle.reject(new CliError("The login was cancelled.", { exitCode: EXIT.auth, code: "login_cancelled" }));
    }
    server.close();
    server.closeAllConnections?.();
  }
  return { port, redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`, result, close };
}

// src/commands/auth.ts
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
  const refreshing = canRefresh(session);
  const result = {
    event: "logged_in",
    profile,
    api: session.api,
    flow: extra.flow,
    workspace,
    user: me ? { name: me.user.name, email: me.user.email, role: me.user.role } : void 0,
    scopes,
    token_name: me?.token.name ?? extra.tokenName,
    storage: saved.storage,
    renews: refreshing
  };
  if (ctx.json) {
    printJson(ctx.io, result);
    return;
  }
  const s = style(ctx.io);
  const where = saved.storage === "keychain" ? ctx.store.keychain?.name ?? "the keychain" : ctx.store.credentialsPath;
  ctx.io.stdout(
    [
      `${s.green("\u2713")} Logged in to ${s.bold(workspace?.name ?? "Homebase")}${me?.user.name ? ` as ${me.user.name}` : ""}.`,
      `  Profile ${profile} \xB7 \u201C${result.token_name ?? "Homebase CLI"}\u201D \xB7 stored in ${where}`,
      `  Permissions: ${scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(", ")}`,
      refreshing ? "  Stays signed in (renews itself); revoke it any time in Settings \u2192 Agents." : ""
    ].filter(Boolean).join("\n") + "\n"
  );
  if (ctx.env.HOMEBASE_TOKEN) ctx.io.stderr("Note: HOMEBASE_TOKEN is set in this shell and takes precedence over the saved login.\n");
}
async function finishDeviceLogin(ctx, pending) {
  const token2 = await pollDeviceLogin({
    fetch: ctx.fetch,
    sleep: ctx.sleep,
    api: pending.api,
    start: pending,
    deadline: Date.parse(pending.expires_at),
    onPoll: (state, interval) => {
      if (!ctx.json && state === "slow_down") ctx.io.stderr(`Polling slower (every ${interval}s)\u2026
`);
    }
  });
  await saveLogin(ctx, pending.profile, sessionFrom(pending.api, token2, pending.client_id), { flow: "device", tokenName: token2.token_name, workspace: token2.workspace });
}
async function deviceLogin(ctx, parsed) {
  let clientId;
  try {
    clientId = cliClientIdFor(ctx.apiUrl, await discover(ctx.fetch, ctx.apiUrl), ctx.env);
  } catch {
    clientId = cliClientIdFor(ctx.apiUrl, void 0, ctx.env);
  }
  const started = await startDeviceLogin(ctx.fetch, ctx.apiUrl, deviceName(), { clientId, scopes: parsed.scopes, workspace: parsed.workspace });
  const pending = {
    ...started,
    api: ctx.apiUrl,
    profile: parsed.profile,
    expires_at: new Date(Date.now() + started.expires_in * 1e3).toISOString(),
    ...clientId ? { client_id: clientId } : {}
  };
  if (parsed.noWait) ctx.store.savePending(pending);
  const opened = parsed.noBrowser || parsed.reason ? false : await ctx.openUrl(started.verification_uri_complete);
  const nextStep = parsed.noWait ? "Ask the user to open verification_uri_complete (on any device), check the code matches, pick the workspace and approve. Then run `homebase login --resume`." : "Ask the user to open verification_uri_complete (on any device), check the code matches, pick the workspace and approve. This command keeps waiting and prints a logged_in event when done.";
  if (ctx.json) {
    printJson(ctx.io, {
      event: "login_started",
      flow: "device",
      verification_uri_complete: started.verification_uri_complete,
      verification_uri: started.verification_uri,
      user_code: started.user_code,
      expires_at: pending.expires_at,
      profile: parsed.profile,
      browser_opened: opened,
      ...parsed.reason ? { why_device: parsed.reason } : {},
      next_step: nextStep
    });
  } else {
    const s = style(ctx.io);
    ctx.io.stderr(
      [
        parsed.reason ? `Using a device login because ${parsed.reason}.` : "",
        opened ? "Opened your browser to approve this login." : "Open this link on any device to approve this login:",
        `  ${s.cyan(started.verification_uri_complete)}`,
        `  Code: ${s.bold(started.user_code)} (check it matches the page)`,
        parsed.noWait ? "Then run `homebase login --resume`." : "Waiting for approval\u2026 (Ctrl-C to cancel)",
        ""
      ].filter((line, index) => line !== "" || index > 0).join("\n")
    );
  }
  if (parsed.noWait) return;
  await finishDeviceLogin(ctx, pending);
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
  if (ctx.json) {
    printJson(ctx.io, {
      event: "login_started",
      flow: "browser",
      authorize_url: url,
      redirect_uri: loopback.redirectUri,
      expires_at: new Date(Date.now() + parsed.timeoutMs).toISOString(),
      profile: parsed.profile,
      browser_opened: opened,
      next_step: "Ask the user to open authorize_url in a browser on this same computer, check the workspace and permissions, and click Approve. This command waits and prints a logged_in event. On another device, use `homebase login --device` instead."
    });
  } else {
    const s = style(ctx.io);
    ctx.io.stderr(
      [
        opened ? "Opened your browser to sign in to Homebase. Approve there, then come back here." : "Open this link in a browser on this computer to sign in:",
        `  ${s.cyan(url)}`,
        "Waiting for approval\u2026 (Ctrl-C to cancel; on another device, use `homebase login --device`)",
        ""
      ].join("\n")
    );
  }
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
  await saveLogin(ctx, parsed.profile, sessionFrom(ctx.apiUrl, tokens, clientId), { flow: "browser" });
  return { done: true };
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
var login = {
  spec: {
    name: "login",
    summary: "Sign this computer in to a Homebase workspace in your browser (one click if you're signed in there).",
    usage: "homebase login [--workspace <slug>] [--scopes <list>] [--device] [--no-browser] [--no-wait | --resume] [--profile <name>] [--json]",
    options: {
      workspace: { type: "string", value: "slug", description: "Preselect this workspace on the approval page" },
      scopes: { type: "string", value: "list", description: `Permissions to ask for, comma-separated (default: the everyday set). Any of ${ALL_SCOPES.join(", ")}` },
      device: { type: "boolean", description: "Approve with a code from any device (SSH, headless). Chosen automatically when needed" },
      "no-browser": { type: "boolean", description: "Don't open a browser; print the link to open yourself" },
      "no-wait": { type: "boolean", description: "Device login: print the link and exit; finish later with --resume" },
      resume: { type: "boolean", description: "Finish a device login started with --no-wait" },
      yes: { type: "boolean", short: "y", description: "Confirm logging in to a non-default API from HOMEBASE_API_URL" }
    },
    maxArgs: 0,
    examples: [
      "homebase login",
      "homebase login --workspace acme",
      "homebase login --device                     # over SSH or without a browser",
      "homebase login --json --no-browser          # agents: relay authorize_url to the user",
      "homebase login --profile client-acme"
    ]
  },
  async run(ctx, parsed) {
    if (parsed.values["no-wait"] && parsed.values.resume) throw usageError("Use either --no-wait or --resume.");
    if (parsed.values.resume) {
      const pending = ctx.store.readPending();
      if (!pending) throw usageError("There's no login waiting to be finished. Run `homebase login`.");
      if (Date.parse(pending.expires_at) < Date.now()) {
        ctx.store.clearPending();
        throw new CliError("That login code expired. Run `homebase login` again.", { exitCode: EXIT.auth, code: "expired_token" });
      }
      if (!ctx.json) ctx.io.stderr(`Waiting for approval of ${pending.user_code}\u2026
`);
      await finishDeviceLogin(ctx, pending);
      return;
    }
    if (ctx.apiSource === "env" && !sameOrigin(ctx.apiUrl, DEFAULT_API_URL) && !parsed.values.yes) {
      const question = `HOMEBASE_API_URL points this login at ${origin(ctx.apiUrl)}, not ${origin(DEFAULT_API_URL)}. Sign in there and save a login for it?`;
      const ok = !ctx.json && ctx.io.isTTY ? await ctx.confirm(question) : false;
      if (!ok) {
        throw usageError(
          `Not logging in to ${origin(ctx.apiUrl)}: it comes from HOMEBASE_API_URL, which a project's environment can set without you noticing.`,
          `If you meant it, run \`homebase login --api ${origin(ctx.apiUrl)}\` (or add --yes).`
        );
      }
    }
    const profile = loginProfile(ctx);
    const scopes = parseScopes(parsed.values.scopes);
    const workspace = parseWorkspace(parsed.values.workspace);
    const noWait = Boolean(parsed.values["no-wait"]);
    const noBrowser = Boolean(parsed.values["no-browser"]);
    const timeoutMs = Number(ctx.env.HOMEBASE_LOGIN_TIMEOUT_MS) > 0 ? Number(ctx.env.HOMEBASE_LOGIN_TIMEOUT_MS) : LOGIN_TIMEOUT_MS;
    const headless = headlessReason(ctx.env);
    if (parsed.values.device || noWait || headless) {
      await deviceLogin(ctx, { noWait, noBrowser, scopes, workspace, profile, reason: parsed.values.device || noWait ? void 0 : headless });
      return;
    }
    const browser = await browserLogin(ctx, { noBrowser, scopes, workspace, profile, timeoutMs });
    if (!browser.done) await deviceLogin(ctx, { noWait: false, noBrowser, scopes, workspace, profile, reason: browser.reason });
  }
};
var logout = {
  spec: {
    name: "logout",
    summary: "Sign this profile out: end its login on the server and forget it on this computer.",
    usage: "homebase logout [--profile <name>] [--keep-token] [--json]",
    options: { "keep-token": { type: "boolean", description: "Only forget it here; don't revoke it on the server" } },
    maxArgs: 0
  },
  async run(ctx, parsed) {
    const stored = ctx.store.session(ctx.profile);
    const revoke = parsed.values["keep-token"] || !stored ? { revoked: false, how: "none" } : await revokeSession(ctx, stored.session);
    const removed = ctx.store.remove(ctx.profile);
    const revokeAt = settingsUrl(removed?.workspace?.url);
    const note = removed && !revoke.revoked ? `${revoke.detail ? `${revoke.detail} ` : ""}The login still works until it is revoked: revoke \u201C${removed.tokenName ?? "Homebase CLI"}\u201D in Settings \u2192 Agents${revokeAt ? ` (${revokeAt})` : ""}.` : void 0;
    if (ctx.json) {
      printJson(ctx.io, {
        profile: ctx.profile,
        removed: Boolean(removed),
        revoked: revoke.revoked,
        ...revoke.how !== "none" ? { revoke: revoke.how } : {},
        revoke_url: revoke.revoked ? void 0 : revokeAt,
        env_token_set: Boolean(ctx.env.HOMEBASE_TOKEN),
        next_step: note
      });
      return;
    }
    if (!removed) ctx.io.stdout(`No saved login for profile ${ctx.profile}.
`);
    else ctx.io.stdout(`Logged out of ${removed.workspace?.name ?? "Homebase"} (profile ${ctx.profile})${revoke.revoked ? "; the login is revoked" : ""}.
${note ? `${note}
` : ""}`);
    if (ctx.env.HOMEBASE_TOKEN) ctx.io.stderr("HOMEBASE_TOKEN is still set in this shell; unset it to stop using that token.\n");
  }
};
function usageRows(me) {
  const used = me.usage?.used ?? {};
  const limits = me.usage?.limits ?? {};
  return [.../* @__PURE__ */ new Set([...Object.keys(limits), ...Object.keys(used)])].map((metric) => ({ metric, used: used[metric] ?? 0, limit: limits[metric] }));
}
var whoami = {
  spec: {
    name: "whoami",
    aliases: ["status"],
    summary: "Show the workspace, person, permissions and this month's usage for the current token.",
    usage: "homebase whoami [--json]",
    maxArgs: 0
  },
  async run(ctx) {
    const me = await ctx.api.get("/v1/me");
    const session = ctx.auth instanceof ProfileAuth ? ctx.auth.current() : void 0;
    const login2 = session ? canRefresh(session) ? { kind: "oauth", renews: true, access_expires_at: session.access_expires_at } : { kind: "legacy", renews: false } : { kind: ctx.tokenSource === "env" ? "env" : "none", renews: false };
    if (ctx.json) {
      printJson(ctx.io, { profile: ctx.tokenSource === "env" ? null : ctx.profile, tokenSource: ctx.tokenSource, api: ctx.apiUrl, login: login2, ...me });
      return;
    }
    const s = style(ctx.io);
    const rows = [
      [s.dim("Workspace"), `${s.bold(me.workspace.name)} (${me.workspace.slug})`],
      [s.dim("You"), [me.user.name, me.user.email && `<${me.user.email}>`, me.user.role && `\xB7 ${me.user.role}`].filter(Boolean).join(" ")],
      [s.dim("Token"), `${me.token.name} \xB7 from ${ctx.tokenSource === "env" ? "HOMEBASE_TOKEN" : `profile ${ctx.profile} (${ctx.tokenSource})`}`],
      [s.dim("Permissions"), me.token.scopes.join(", ") || "none"],
      [
        s.dim("Login"),
        login2.kind === "oauth" ? `renews itself (current access until ${shortDate(session?.access_expires_at)}${expiresAt(session) ? ` ${new Date(expiresAt(session)).toLocaleTimeString()}` : ""})` : login2.kind === "legacy" ? "older kind without renewal: run `homebase login` to upgrade" : "HOMEBASE_TOKEN"
      ],
      [s.dim("Plan"), `${me.subscription?.plan ?? "?"} (${me.subscription?.status ?? "?"})`]
    ];
    if (me.workspace.url) rows.push([s.dim("Library"), me.workspace.url]);
    const usage = usageRows(me).map(({ metric, used, limit }) => {
      const fmt = metric === "uploadBytes" ? formatBytes : (n) => n.toLocaleString("en-US");
      return [`  ${metric}`, `${fmt(used)} / ${limit === void 0 ? "\u221E" : fmt(limit)}`];
    });
    ctx.io.stdout(
      [
        table(rows),
        "",
        s.dim(`Usage ${me.usage?.period ?? ""} (resets ${shortDate(me.usage?.resetsAt)})`),
        table(usage),
        me.rateLimit?.perMinute ? s.dim(`Rate limit: ${me.rateLimit.remaining ?? "?"}/${me.rateLimit.perMinute} requests left this minute`) : ""
      ].filter((line) => line !== void 0).join("\n").trimEnd() + "\n"
    );
  }
};
var profiles = {
  spec: {
    name: "profiles",
    summary: "List saved logins (one per workspace or account).",
    usage: "homebase profiles [--json]",
    maxArgs: 0
  },
  async run(ctx) {
    const config = ctx.store.readConfig();
    const list = Object.entries(config.profiles).map(([name, info]) => ({
      name,
      default: name === config.defaultProfile,
      workspace: info.workspace,
      api: info.api,
      scopes: info.scopes ?? [],
      storage: info.storage,
      savedAt: info.savedAt
    }));
    if (ctx.json) {
      printJson(ctx.io, { defaultProfile: config.defaultProfile ?? null, profiles: list });
      return;
    }
    if (!list.length) {
      ctx.io.stdout("No saved logins. Run `homebase login`.\n");
      return;
    }
    const s = style(ctx.io);
    ctx.io.stdout(
      table([
        [s.dim(""), s.dim("PROFILE"), s.dim("WORKSPACE"), s.dim("STORED IN"), s.dim("SINCE")],
        ...list.map((profile) => [profile.default ? "*" : "", profile.name, profile.workspace?.name ?? "?", profile.storage, shortDate(profile.savedAt)])
      ]) + "\n"
    );
  }
};
var profilesUse = {
  spec: {
    name: "profiles use",
    summary: "Make a saved profile the default.",
    usage: "homebase profiles use <name>",
    minArgs: 1,
    maxArgs: 1
  },
  async run(ctx, parsed) {
    const name = parsed.positionals[0];
    ctx.store.setDefault(name);
    if (ctx.json) printJson(ctx.io, { defaultProfile: name });
    else ctx.io.stdout(`Default profile is now ${name}.
`);
  }
};
var authCommands = [login, logout, whoami, profiles, profilesUse];

// src/commands/buckets.ts
function looksLikeId(value) {
  return /^[0-9a-z]{31,32}$/.test(value);
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
  const match = matchBucket(await listAllBuckets(api), ref);
  if (!match) {
    throw new CliError(`No bucket called \u201C${ref}\u201D. List them with \`homebase buckets\`, or create it with \`homebase bucket create "${ref}"\`.`, {
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
var buckets = {
  spec: {
    name: "buckets",
    summary: "List the workspace's buckets (client handoffs / campaigns), newest first.",
    usage: "homebase buckets [--limit <n>] [--cursor <c>] [--all] [--json]",
    options: {
      limit: { type: "string", value: "n", description: "Buckets per page, 1-200 (default 100)" },
      cursor: { type: "string", value: "cursor", description: "nextCursor from the previous page" },
      all: { type: "boolean", description: "Fetch every page" }
    },
    maxArgs: 0
  },
  async run(ctx, parsed) {
    let list;
    let nextCursor = null;
    if (parsed.values.all) {
      list = await listAllBuckets(ctx.api);
    } else {
      const page = await ctx.api.get("/v1/buckets", {
        limit: intOption(parsed.values.limit, "limit", 1, 200),
        cursor: stringOption(parsed.values.cursor)
      });
      list = page.buckets;
      nextCursor = page.nextCursor;
    }
    if (ctx.json) printJson(ctx.io, { buckets: list.map(bucketJson), nextCursor });
    else ctx.io.stdout(renderBuckets(ctx.io, list, nextCursor) + "\n");
  }
};
var bucketCreate = {
  spec: {
    name: "bucket create",
    summary: "Create a bucket (needs the Manage buckets permission).",
    usage: 'homebase bucket create <name> [--description "\u2026"] [--json]',
    options: { description: { type: "string", value: "text", description: "What the bucket is for" } },
    minArgs: 1,
    examples: ['homebase bucket create "Acme spring launch" --description "Final assets for the Acme handoff"']
  },
  async run(ctx, parsed) {
    const name = parsed.positionals.join(" ").trim();
    if (!name) throw usageError("The bucket needs a name.");
    const bucket = await ctx.api.post("/v1/buckets", { name, description: stringOption(parsed.values.description) });
    if (ctx.json) printJson(ctx.io, bucketJson(bucket));
    else ctx.io.stdout(`Created bucket ${style(ctx.io).bold(bucket.name)} (${bucket.id})${bucket.shareUrl ? `
  Share page: ${bucket.shareUrl}` : ""}
`);
  }
};
function bucketMembership(action) {
  return {
    spec: {
      name: `bucket ${action}`,
      summary: action === "add" ? "Add library assets to a bucket (the asset isn't copied; it's the same asset in more places)." : "Take assets out of a bucket. They stay in the library.",
      usage: `homebase bucket ${action} <bucket id|name> <asset id\u2026> [--json]`,
      minArgs: 2
    },
    async run(ctx, parsed) {
      const [ref, ...ids] = parsed.positionals;
      if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
      const bucket = await resolveBucket(ctx.api, ref, { write: true });
      const result = await ctx.api.post(`/v1/buckets/${encodeURIComponent(bucket.id)}/assets`, {
        [action]: ids
      });
      if (ctx.json) {
        printJson(ctx.io, { bucket: { id: bucket.id, name: bucket.name }, added: result.added, removed: result.removed, notFound: result.notFound ?? [] });
        return;
      }
      const count = action === "add" ? result.added : result.removed;
      ctx.io.stdout(`${action === "add" ? "Added" : "Removed"} ${count} asset${count === 1 ? "" : "s"} ${action === "add" ? "to" : "from"} ${bucket.name ?? bucket.id}.
`);
      if (result.notFound?.length) ctx.io.stderr(`Not found: ${result.notFound.join(", ")}
`);
    }
  };
}
var DATE_KEYS = ["addedAt", "latestAt", "uploadedAt", "updatedAt", "fileCreatedAt"];
function isoDates(item) {
  const out = { ...item };
  for (const key of DATE_KEYS) if (typeof out[key] === "number") out[key] = isoFromMs(out[key]);
  return out;
}
var bucketLs = {
  spec: {
    name: "bucket ls",
    aliases: ["bucket list", "bucket show"],
    summary: "List what's in a bucket (its assets, in the bucket's order).",
    usage: "homebase bucket ls <bucket id|name> [--limit <n>] [--cursor <c>] [--all] [--json]",
    options: {
      limit: { type: "string", value: "n", description: "Per page, 1-200 (default 100)" },
      cursor: { type: "string", value: "cursor", description: "nextCursor from the previous page" },
      all: { type: "boolean", description: "Fetch every page" }
    },
    minArgs: 1,
    examples: ['homebase bucket ls "Summer campaign 2026" --json']
  },
  async run(ctx, parsed) {
    const bucket = await resolveBucket(ctx.api, parsed.positionals.join(" "));
    const path = `/v1/buckets/${encodeURIComponent(bucket.id)}/assets`;
    const items = [];
    let cursor = stringOption(parsed.values.cursor);
    let nextCursor = null;
    let name = bucket.name;
    try {
      for (let page = 0; page < (parsed.values.all ? 50 : 1); page++) {
        const body = await ctx.api.get(path, {
          limit: intOption(parsed.values.limit, "limit", 1, 200),
          cursor
        });
        name ??= body.bucket?.name;
        items.push(...(body.assets ?? body.items ?? []).map(isoDates));
        nextCursor = body.nextCursor ?? null;
        if (!nextCursor) break;
        cursor = nextCursor;
      }
    } catch (error) {
      if (isMissingRoute(error)) {
        throw unsupportedError(
          "listing a bucket's contents",
          `Search inside it instead: homebase search "${name ?? "files"}" --bucket ${bucket.id} --ignore date --json`
        );
      }
      throw error;
    }
    if (ctx.json) {
      printJson(ctx.io, { bucket: { id: bucket.id, name }, assets: items, nextCursor });
      return;
    }
    const s = style(ctx.io);
    if (!items.length) {
      ctx.io.stdout(`${name ?? bucket.id} is empty.
`);
      return;
    }
    ctx.io.stdout(
      [
        s.bold(name ?? bucket.id),
        table(
          items.map((item) => [
            s.cyan(item.id),
            item.type,
            shortDate(item.latestAt ?? item.uploadedAt),
            truncate(item.title, 56) + (item.tags?.length ? s.dim(`  ${item.tags.map((tag2) => `#${tag2}`).join(" ")}`) : "")
          ])
        ).split("\n").map((line) => `  ${line}`).join("\n"),
        nextCursor ? s.dim(`More: homebase bucket ls ${bucket.id} --cursor ${nextCursor}`) : ""
      ].filter(Boolean).join("\n") + "\n"
    );
  }
};
var SHARE_NOTE = "Homebase agents never send anything to clients. Give this link to the user; sending it is their call.";
var shareLink = {
  spec: {
    name: "share-link",
    summary: "Print a bucket's client share link. Sending it is up to you; Homebase never sends it.",
    usage: "homebase share-link <bucket id|name> [--json]",
    minArgs: 1,
    examples: ['homebase share-link "Summer campaign 2026"']
  },
  async run(ctx, parsed) {
    const ref = parsed.positionals.join(" ");
    const bucket = await resolveBucket(ctx.api, ref);
    let link;
    let source = "share-link";
    try {
      link = await ctx.api.get(`/v1/buckets/${encodeURIComponent(bucket.id)}/share-link`);
    } catch (error) {
      if (!isMissingRoute(error)) throw error;
      const found = (await listAllBuckets(ctx.api)).find((entry) => entry.id === bucket.id);
      if (!found?.shareUrl) throw unsupportedError("share links", "Copy the link from the bucket's Share button in the web app.");
      link = { url: found.shareUrl, name: found.name };
      source = "bucket";
    }
    const url = link.url ?? link.shareUrl;
    if (!url) throw new CliError(`\u201C${bucket.name ?? ref}\u201D has no share link. Turn sharing on from the bucket's Share button in the web app.`, { code: "no_share_link", exitCode: EXIT.notFound });
    const live = link.live ?? link.enabled;
    if (ctx.json) {
      printJson(ctx.io, { bucket: { id: bucket.id, name: bucket.name ?? link.name }, url, ...live !== void 0 ? { live } : {}, source, note: SHARE_NOTE });
      return;
    }
    ctx.io.stdout(`${url}
`);
    ctx.io.stderr(`${live === false ? "This link is turned off; the client can't open it until you turn sharing on.\n" : ""}${SHARE_NOTE}
`);
  }
};
var bucketCommands = [buckets, bucketCreate, bucketMembership("add"), bucketMembership("remove"), bucketLs, shareLink];

// src/commands/library.ts
import { createReadStream, createWriteStream, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, rmSync as rmSync2, statSync as statSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { basename as basename2, join as join3, relative, resolve as resolve2 } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// src/files.ts
import { readdirSync, statSync as statSync2 } from "node:fs";
import { basename, extname, join as join2, resolve, sep } from "node:path";
var MIME = {
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
var EXTENSION_FOR = {
  "image/jpeg": "jpg",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "application/postscript": "eps"
};
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
  const cleaned = name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 180);
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
var GLOB_CHARS = /[*?[]/;
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
      stat = statSync2(absolute);
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

// src/progress.ts
import { Transform } from "node:stream";
function progressMeter(io, enabled, label, total) {
  if (!enabled || !io.isTTY) return { update: () => {
  }, finish: () => {
  } };
  let last = 0;
  const name = truncate(label, 40);
  const draw = (done) => {
    const pct = total ? `${Math.min(100, Math.floor(done / total * 100)).toString().padStart(3)}%` : "";
    io.stderr(`\r\x1B[2K${name}  ${pct} ${formatBytes(done)}${total ? ` / ${formatBytes(total)}` : ""}`);
  };
  return {
    update(done) {
      const now = Date.now();
      if (now - last < 100 && done !== total) return;
      last = now;
      draw(done);
    },
    finish() {
      io.stderr("\r\x1B[2K");
    }
  };
}
function countingStream(onBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      onBytes(total);
      callback(null, chunk);
    }
  });
}

// src/commands/library.ts
var FILE_TYPES = ["image", "document", "video", "link", "embed", "other"];
var assetPath = (id) => `/v1/assets/${encodeURIComponent(id)}`;
var FILTER_OPTIONS = {
  type: { type: "string", value: "type", description: "Only image, document, video, link, embed or other" },
  bucket: { type: "string", value: "id|name", description: "Only this bucket, or none for assets in no bucket" },
  tag: { type: "string", value: "tag", description: "Only assets with this tag" },
  source: { type: "string", value: "who", description: "Only assets added by human or agent" }
};
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
      limit: intOption(parsed.values.limit, "limit", 1, 50),
      ...await searchFilters(ctx, parsed)
    });
  } catch (error) {
    if (!query && !cursor && error instanceof CliError && error.code === "invalid_request" && /query/i.test(error.message)) {
      throw unsupportedError("browsing recent assets (an empty search)", 'Search with words instead, e.g. homebase search "newest images" --json.');
    }
    throw error;
  }
  if (ctx.json) printJson(ctx.io, searchJson(response));
  else ctx.io.stdout(renderSearch(ctx.io, response, query || void 0) + "\n");
}
var search = {
  spec: {
    name: "search",
    aliases: ["find"],
    summary: "Ask the library a question in plain words. Shows how it was read, then grouped results. No words: newest first.",
    usage: 'homebase search ["<question>"] [--limit <n>] [--cursor <c>] [--type <t>] [--bucket <id|name|none>] [--tag <t>] [--source human|agent] [--json]',
    options: {
      limit: { type: "string", value: "n", description: "Results per page, 1-50 (default 24)" },
      cursor: { type: "string", value: "cursor", description: "nextCursor from the previous page (valid 10 minutes)" },
      ...FILTER_OPTIONS,
      ignore: { type: "string", multiple: true, value: "part", description: "Drop part of the interpretation: buckets, date, fileTypes, tags, source, sort, text" }
    },
    examples: [
      'homebase search "latest files from the summer campaign"',
      'homebase search "acme logo" --type image --json',
      'homebase search "hero shots from last spring" --ignore date',
      "homebase search --type image --tag hero      # no words: newest first"
    ]
  },
  async run(ctx, parsed) {
    await runSearch(ctx, parsed, parsed.positionals.join(" ").trim());
  }
};
var recent = {
  spec: {
    name: "recent",
    aliases: ["latest"],
    summary: "Browse the newest assets (by latest version), optionally filtered. Same output as search.",
    usage: "homebase recent [--type <t>] [--bucket <id|name|none>] [--tag <t>] [--source human|agent] [--limit <n>] [--cursor <c>] [--json]",
    options: {
      limit: { type: "string", value: "n", description: "Results per page, 1-50 (default 24)" },
      cursor: { type: "string", value: "cursor", description: "nextCursor from the previous page (valid 10 minutes)" },
      ...FILTER_OPTIONS
    },
    maxArgs: 0,
    examples: ["homebase recent --json", "homebase recent --type image --source agent", 'homebase recent --bucket "Summer campaign 2026"']
  },
  async run(ctx, parsed) {
    await runSearch(ctx, parsed, "");
  }
};
var get = {
  spec: {
    name: "get",
    aliases: ["show"],
    summary: "Everything about one asset: buckets, dates, tags, AI description and visible text.",
    usage: "homebase get <asset id> [--json]",
    minArgs: 1,
    maxArgs: 1
  },
  async run(ctx, parsed) {
    const asset = await ctx.api.get(assetPath(parsed.positionals[0]));
    if (ctx.json) printJson(ctx.io, asset);
    else ctx.io.stdout(renderAsset(ctx.io, asset) + "\n");
  }
};
var versions = {
  spec: {
    name: "versions",
    summary: `An asset's version history, newest first (the newest version date is what "latest" means).`,
    usage: "homebase versions <asset id> [--json]",
    minArgs: 1,
    maxArgs: 1
  },
  async run(ctx, parsed) {
    const id = parsed.positionals[0];
    let body;
    try {
      body = await ctx.api.get(`${assetPath(id)}/versions`);
    } catch (error) {
      if (isMissingRoute(error)) throw unsupportedError("version history", `\`homebase get ${id} --json\` shows the current version and versionsCount.`);
      throw error;
    }
    const list = (body.versions ?? []).map((version) => ({
      ...version,
      ...typeof version.date === "number" ? { date: isoFromMs(version.date) } : {},
      ...typeof version.uploadedAt === "number" ? { uploadedAt: isoFromMs(version.uploadedAt) } : {},
      ...typeof version.createdAt === "number" ? { createdAt: isoFromMs(version.createdAt) } : {}
    }));
    if (ctx.json) {
      printJson(ctx.io, { id: body.id ?? id, title: body.title, versions: list });
      return;
    }
    const s = style(ctx.io);
    ctx.io.stdout(
      [
        body.title ? s.bold(body.title) : id,
        table([
          [s.dim("VERSION"), s.dim("DATE"), s.dim("SIZE"), s.dim("NOTE")],
          ...list.map((version) => [
            `${version.version ?? "?"}${version.current ? " (current)" : ""}`,
            shortDate(version.date ?? version.uploadedAt ?? version.createdAt),
            formatBytes(version.size) || "-",
            [version.note, version.addedBy].filter(Boolean).join(" \xB7 ")
          ])
        ])
      ].join("\n") + "\n"
    );
  }
};
async function fetchToFile(ctx, url, path) {
  const response = await ctx.fetch(url, { method: "GET" });
  if (!response.ok || !response.body) throw new CliError(`Couldn't fetch the file (HTTP ${response.status}).`, { code: `http_${response.status}`, status: response.status });
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync2(path, buffer);
  return { bytes: buffer.length, contentType: response.headers.get("content-type") ?? void 0 };
}
var view = {
  spec: {
    name: "view",
    summary: "Save an asset's preview image to a local file and print its path, so you (or an agent) can look at it.",
    usage: "homebase view <asset id> [-o <file>] [--original] [--json]",
    options: {
      output: { type: "string", short: "o", value: "file", description: "Where to save it (default: a temp file)" },
      original: { type: "boolean", description: "Use the original image instead of the 1280x720 preview (images up to 20 MB)" }
    },
    minArgs: 1,
    maxArgs: 1
  },
  async run(ctx, parsed) {
    const id = parsed.positionals[0];
    const asset = await ctx.api.get(assetPath(id));
    let url = parsed.values.original ? void 0 : asset.thumbnailUrl;
    let kind = "preview";
    if (!url && asset.type === "image" && (asset.size ?? 0) <= 20 * 1024 * 1024) {
      url = (await ctx.api.get(`${assetPath(id)}/download-url`)).url;
      kind = "original";
    }
    if (!url) {
      throw new CliError(
        asset.indexing?.status === "pending" || asset.indexing?.status === "running" ? "The preview is still being drawn. Retry in a few seconds." : `\u201C${asset.title}\u201D (${asset.type}) has no preview image. Read its description with \`homebase get ${id}\`, or download it with \`homebase download ${id}\`.`,
        { code: "no_preview", exitCode: EXIT.notFound }
      );
    }
    const ext = kind === "preview" ? "jpg" : downloadFilename({ title: "x", mimeType: asset.mimeType }).split(".").pop() ?? "img";
    const target = resolve2(ctx.cwd, stringOption(parsed.values.output) ?? join3(tmpdir(), "homebase-view", `${id}-${kind}.${ext}`));
    mkdirSync2(resolve2(target, ".."), { recursive: true });
    const saved = await fetchToFile(ctx, url, target);
    const result = { id, title: asset.title, path: target, kind, bytes: saved.bytes, contentType: saved.contentType };
    if (ctx.json) printJson(ctx.io, result);
    else ctx.io.stdout(`${target}
`);
  }
};
var open = {
  spec: {
    name: "open",
    summary: "Open an asset's file (a signed link, valid one hour) or link in the browser.",
    usage: "homebase open <asset id> [--print] [--json]",
    options: { print: { type: "boolean", description: "Print the URL instead of opening it" } },
    minArgs: 1,
    maxArgs: 1
  },
  async run(ctx, parsed) {
    const link = await ctx.api.get(`${assetPath(parsed.positionals[0])}/download-url`);
    const opened = parsed.values.print || ctx.json ? false : await ctx.openUrl(link.url);
    if (ctx.json) printJson(ctx.io, { ...link, opened });
    else ctx.io.stdout(opened ? `Opened ${link.kind === "signed" ? "a signed link (valid 1 hour)" : link.url}
` : `${link.url}
`);
  }
};
async function downloadOne(ctx, id, dir, force, showProgress) {
  const asset = await ctx.api.get(assetPath(id));
  const link = await ctx.api.get(`${assetPath(id)}/download-url`);
  if (link.kind === "link" && (asset.type === "link" || asset.type === "embed")) {
    return { id, title: asset.title, skipped: "This asset is a link to a web page, not a file.", url: link.url };
  }
  const part = join3(dir, `.${id}.homebase-part`);
  const partTag = `${part}.etag`;
  let offset = 0;
  let etag;
  try {
    offset = statSync3(part).size;
    etag = readFileSync2(partTag, "utf8").trim() || void 0;
  } catch {
    etag = void 0;
  }
  if (!etag) offset = 0;
  let response = await ctx.fetch(link.url, { method: "GET", headers: offset ? { Range: `bytes=${offset}-`, "If-Range": etag } : {} });
  if (response.status === 416 || response.status === 206 && offset > 0 && response.headers.get("etag") !== null && response.headers.get("etag") !== etag) {
    rmSync2(part, { force: true });
    rmSync2(partTag, { force: true });
    offset = 0;
    response = await ctx.fetch(link.url, { method: "GET" });
  }
  const name = downloadFilename({ title: asset.title, mimeType: asset.mimeType, contentDisposition: response.headers.get("content-disposition"), url: link.url });
  let target = join3(dir, name);
  if (!force) target = uniquePath(target, (candidate) => existsSync2(candidate));
  if (!response.ok || !response.body) {
    throw new CliError(`Downloading \u201C${asset.title}\u201D failed (HTTP ${response.status}). The link may have expired; retry.`, { code: `http_${response.status}`, status: response.status });
  }
  const resumed = response.status === 206 && offset > 0;
  if (!resumed) {
    offset = 0;
    const fresh = response.headers.get("etag");
    if (fresh) writeFileSync2(partTag, fresh);
    else rmSync2(partTag, { force: true });
  }
  const length = Number(response.headers.get("content-length")) || void 0;
  const total = asset.size || (length !== void 0 ? offset + length : void 0);
  const meter = progressMeter(ctx.io, showProgress, name, total);
  await pipeline(
    Readable.fromWeb(response.body),
    countingStream((bytes2) => meter.update(offset + bytes2)),
    createWriteStream(part, { flags: resumed ? "a" : "w" })
  );
  meter.finish();
  const bytes = statSync3(part).size;
  renameSync2(part, target);
  rmSync2(partTag, { force: true });
  return { id, title: asset.title, path: target, bytes, resumed };
}
var download = {
  spec: {
    name: "download",
    summary: "Download files to disk with their real names and extensions (resumes partial downloads).",
    usage: "homebase download <asset id\u2026> [-o <dir>] [--force] [--json]",
    options: {
      output: { type: "string", short: "o", value: "dir", description: "Folder to save into (default: current folder)" },
      force: { type: "boolean", description: "Overwrite files with the same name instead of adding (2), (3)\u2026" }
    },
    minArgs: 1
  },
  async run(ctx, parsed) {
    const dir = resolve2(ctx.cwd, stringOption(parsed.values.output) ?? ".");
    mkdirSync2(dir, { recursive: true });
    const downloaded = [];
    const skipped = [];
    const failed = [];
    let firstError;
    for (const id of parsed.positionals) {
      try {
        const result = await downloadOne(ctx, id, dir, Boolean(parsed.values.force), !ctx.json);
        if ("skipped" in result) {
          skipped.push({ id, reason: result.skipped, url: result.url });
          if (!ctx.json) ctx.io.stderr(`Skipped ${result.title ?? id}: ${result.skipped} ${result.url ?? ""}
`);
        } else {
          downloaded.push(result);
          if (!ctx.json) ctx.io.stdout(`${result.path}  (${formatBytes(result.bytes)}${result.resumed ? ", resumed" : ""})
`);
        }
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        firstError ??= error;
        failed.push({ id, error: { code: error.code, message: error.message } });
        if (!ctx.json) ctx.io.stderr(`${id}: ${error.message}
`);
        if (error.exitCode === EXIT.auth || error.exitCode === EXIT.limit) break;
      }
    }
    if (ctx.json) printJson(ctx.io, { downloaded, skipped, failed });
    if (firstError) throw Object.assign(firstError, { alreadyReported: true });
  }
};
async function putFile(ctx, grant, path, size, showProgress) {
  const meter = progressMeter(ctx.io, showProgress, basename2(path), size);
  const body = Readable.toWeb(createReadStream(path).pipe(countingStream((bytes) => meter.update(bytes))));
  let response;
  try {
    response = await ctx.fetch(grant.uploadUrl, {
      method: "PUT",
      headers: { ...grant.headers, "Content-Length": String(size) },
      body,
      duplex: "half"
    });
  } finally {
    meter.finish();
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CliError(`Uploading the bytes of ${basename2(path)} failed (HTTP ${response.status}). ${text.slice(0, 200)}`.trim(), {
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
    return { id: ref.id, title: ref.title, type: ref.type, buckets: ref.buckets?.map((bucket) => ({ id: bucket.id, name: bucket.name })), appUrl: ref.appUrl, latestAt: ref.latestAt };
  }
  return void 0;
}
async function describeDuplicate(ctx, ref) {
  if (ref.title) return ref;
  try {
    const asset = await ctx.api.get(assetPath(ref.id));
    return { id: ref.id, title: asset.title, type: asset.type, buckets: (asset.buckets ?? []).map((bucket) => ({ id: bucket.id, name: bucket.name })), appUrl: asset.appUrl ?? asset.url, latestAt: asset.latestAt };
  } catch {
    return ref;
  }
}
function duplicateText(ref) {
  return `${ref.id}${ref.title ? `  \u201C${ref.title}\u201D` : ""}${ref.buckets?.length ? ` (in ${ref.buckets.map((bucket) => bucket.name).join(", ")})` : ""}`;
}
function duplicateHint(ref, opts) {
  const reuse = [];
  if (opts.tags.length) reuse.push(`homebase tag ${ref.id} --add ${opts.tags.join(",")}`);
  for (const bucket of opts.buckets.filter((wanted) => !ref.buckets?.some((has) => has.id === wanted.id))) reuse.push(`homebase bucket add ${shellQuote(bucket.name ?? bucket.id)} ${ref.id}`);
  return [
    reuse.length ? `To reuse it: ${reuse.join(" && ")}.` : "",
    `To add a second copy anyway: ${opts.retry} --allow-duplicate.`
  ].filter(Boolean).join(" ");
}
async function bucketIdsFrom(ctx, value) {
  const refs = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const out = [];
  for (const ref of refs) out.push(await resolveBucket(ctx.api, ref, { write: true }));
  return out;
}
var upload = {
  spec: {
    name: "upload",
    summary: "Upload files into the library (optionally tagged and into buckets). Marked as added by an agent/CLI.",
    usage: "homebase upload <file|dir|glob\u2026> [--bucket <id|name>]\u2026 [--tag <t>]\u2026 [--title <t>] [--recursive] [--allow-duplicate] [--json]",
    options: {
      "allow-duplicate": { type: "boolean", description: "Upload even if the same file is already in the library" },
      bucket: { type: "string", multiple: true, value: "id|name", description: "Also put it in this bucket (needs Manage buckets)" },
      tag: { type: "string", multiple: true, value: "tag", description: "Tag it (repeat, or comma-separate)" },
      title: { type: "string", value: "title", description: "Title (one file only; default: from the filename)" },
      recursive: { type: "boolean", short: "r", description: "Upload folders' contents, including subfolders" }
    },
    minArgs: 1,
    examples: ['homebase upload hero.png --tag summer,hero --bucket "Summer campaign 2026"', 'homebase upload ./exports --recursive --tag "q3 social"', 'homebase upload "renders/*.png"']
  },
  async run(ctx, parsed) {
    const files = expandUploadArgs(parsed.positionals, { recursive: Boolean(parsed.values.recursive), cwd: ctx.cwd });
    const title = stringOption(parsed.values.title);
    if (title && files.length > 1) throw usageError("--title works with one file only.");
    if (files.length > 500) throw usageError(`That's ${files.length} files; upload at most 500 per run.`);
    const tags = listOption(parsed.values.tag);
    const buckets2 = await bucketIdsFrom(ctx, parsed.values.bucket);
    const allowDuplicate = Boolean(parsed.values["allow-duplicate"]);
    const uploaded = [];
    const duplicates = [];
    const failed = [];
    let stopError;
    let firstError;
    let tried = 0;
    const s = style(ctx.io);
    for (const file of files) {
      tried++;
      const size = statSync3(file).size;
      const mimeType = mimeFor(file);
      const shown = relative(ctx.cwd, file) || basename2(file);
      const noteDuplicate = async (found) => {
        const ref = await describeDuplicate(ctx, found);
        const hint = duplicateHint(ref, { tags, buckets: buckets2, retry: `homebase upload ${shellQuote(shown)}` });
        duplicates.push({ file: shown, duplicate_of: ref, hint });
        if (!ctx.json) ctx.io.stdout(`${s.yellow("=")} ${shown} is already in the library as ${duplicateText(ref)}; not uploaded again.
  ${hint}
`);
      };
      try {
        if (size === 0) throw new CliError(`${basename2(file)} is empty.`, { code: "empty_file" });
        const grant = await ctx.api.post("/v1/uploads", {
          filename: basename2(file),
          contentType: mimeType,
          size,
          ...allowDuplicate ? { allowDuplicate: true } : {}
        });
        const early = duplicateOf(grant);
        if (early && !grant.uploadUrl) {
          await noteDuplicate(early);
          continue;
        }
        await putFile(ctx, grant, file, size, !ctx.json);
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
        if (duplicate) {
          await noteDuplicate(duplicate);
          continue;
        }
        uploaded.push(assetSummaryJson(asset));
        if (!ctx.json) ctx.io.stdout(`${s.green("\u2713")} ${basename2(file)} \u2192 ${asset.id}  ${asset.title}${asset.tags?.length ? `  ${asset.tags.map((tag2) => `#${tag2}`).join(" ")}` : ""}
`);
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        const duplicate = duplicateOf(error);
        if (duplicate) {
          await noteDuplicate(duplicate);
          continue;
        }
        firstError ??= error;
        failed.push({ file, error: { code: error.code, message: error.message } });
        if (!ctx.json) ctx.io.stderr(`${s.red("\u2717")} ${basename2(file)}: ${error.message}
`);
        if (error.exitCode === EXIT.auth || error.exitCode === EXIT.limit) {
          stopError = error;
          break;
        }
      }
    }
    const notTried = stopError ? files.slice(tried) : [];
    if (ctx.json) printJson(ctx.io, { uploaded, duplicates, failed, notTried });
    else if (notTried.length) ctx.io.stderr(`Stopped; ${notTried.length} file(s) not tried.
`);
    if (!ctx.json && buckets2.length && uploaded.length) ctx.io.stdout(`In bucket${buckets2.length > 1 ? "s" : ""}: ${buckets2.map((bucket) => bucket.name ?? bucket.id).join(", ")}
`);
    const reported = stopError ?? firstError;
    if (reported) throw Object.assign(reported, { alreadyReported: true });
  }
};
function isMissingImportRoute(error) {
  return error instanceof CliError && error.code === "not_found" && /There is no POST \/v1\/assets\/import/.test(error.message);
}
var importUrl = {
  spec: {
    name: "import",
    summary: "Add something from the web: image/PDF/document URLs are fetched and stored like uploads; web pages (Figma, Drive, sites) become links.",
    usage: "homebase import <url> [--title <t>] [--tag <t>]\u2026 [--bucket <id|name>]\u2026 [--link] [--allow-duplicate] [--json]",
    options: {
      "allow-duplicate": { type: "boolean", description: "Add it even if the same file or link is already in the library" },
      title: { type: "string", value: "title", description: "Title (default: the file name or page title)" },
      tag: { type: "string", multiple: true, value: "tag", description: "Tag it" },
      bucket: { type: "string", multiple: true, value: "id|name", description: "Also put it in this bucket" },
      link: { type: "boolean", description: "Save it as a link even if it's a file" }
    },
    minArgs: 1,
    maxArgs: 1,
    examples: ["homebase import https://example.com/press/logo.png --tag logo", 'homebase import https://www.figma.com/design/abc --title "Acme brand board"']
  },
  async run(ctx, parsed) {
    const url = parsed.positionals[0];
    if (!/^https?:\/\//i.test(url)) throw usageError("Give a full http(s) URL.");
    const tags = listOption(parsed.values.tag);
    const buckets2 = await bucketIdsFrom(ctx, parsed.values.bucket);
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
            throw new CliError(error.message, { ...error, exitCode: error.exitCode, hint: `To save the page as a link instead: homebase import ${url} --link` });
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
      const hint = duplicateHint(duplicate, { tags, buckets: buckets2, retry: `homebase import ${url}` });
      if (ctx.json) printJson(ctx.io, { duplicate_of: duplicate, imported: false, hint });
      else ctx.io.stdout(`Already in the library as ${duplicateText(duplicate)}; not added again.
  ${hint}
`);
      return;
    }
    const importedAs = asset.type === "link" || asset.type === "embed" ? "link" : "file";
    if (ctx.json) printJson(ctx.io, { ...assetSummaryJson(asset), importedAs });
    else ctx.io.stdout(`Added ${importedAs === "file" ? `${asset.type} file` : "link"} ${asset.id}  ${asset.title}${asset.size ? ` (${formatBytes(asset.size)})` : ""}
${asset.linkUrl ? `  ${asset.linkUrl}
` : ""}`);
  }
};
var tag = {
  spec: {
    name: "tag",
    summary: "Add or remove tags on assets. Tags are free-form; case and spacing don't matter.",
    usage: "homebase tag <asset id\u2026> [--add <t>]\u2026 [--remove <t>]\u2026 [--json]",
    options: {
      add: { type: "string", multiple: true, value: "tag", description: "Tag to add (repeat, or comma-separate)" },
      remove: { type: "string", multiple: true, value: "tag", description: "Tag to remove" }
    },
    minArgs: 1,
    examples: ["homebase tag jx7abc\u2026 --add hero,final --remove draft"]
  },
  async run(ctx, parsed) {
    const add = listOption(parsed.values.add);
    const remove = listOption(parsed.values.remove);
    if (!add.length && !remove.length) throw usageError("Say what to change: --add <tag> and/or --remove <tag>.");
    const results = [];
    for (const id of parsed.positionals) {
      const result = await ctx.api.post(`${assetPath(id)}/tags`, {
        ...add.length ? { add } : {},
        ...remove.length ? { remove } : {}
      });
      results.push(result);
      if (!ctx.json) ctx.io.stdout(`${id}  ${result.tags.length ? result.tags.map((t) => `#${t}`).join(" ") : "(no tags)"}
`);
    }
    if (ctx.json) printJson(ctx.io, { results });
  }
};
var rename = {
  spec: {
    name: "rename",
    summary: "Rename an asset.",
    usage: "homebase rename <asset id> <new title\u2026> [--json]",
    minArgs: 2
  },
  async run(ctx, parsed) {
    const [id, ...words] = parsed.positionals;
    const title = words.join(" ").trim();
    if (!title) throw usageError("Give the new title.");
    const result = await ctx.api.patch(assetPath(id), { title });
    if (ctx.json) printJson(ctx.io, result);
    else ctx.io.stdout(`Renamed ${result.id} to \u201C${result.title}\u201D.
`);
  }
};
var libraryCommands = [search, recent, get, versions, view, open, download, upload, importUrl, tag, rename];

// src/commands/setup.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { copyFileSync, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join4, resolve as resolve3 } from "node:path";

// src/connect.ts
var CLIENTS = ["claude-code", "codex", "cursor", "claude-desktop", "claude-ai", "chatgpt"];
var ALIASES = {
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
function resolveClient(name) {
  return ALIASES[name.toLowerCase()];
}
var SERVER_NAME = "homebase";
function claudeCodeArgs(url, scope = "user") {
  return ["mcp", "add", "--transport", "http", "--scope", scope, SERVER_NAME, url];
}
function shellQuote2(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
function claudeCodeCommand(url, scope = "user") {
  return ["claude", ...claudeCodeArgs(url, scope)].map(shellQuote2).join(" ");
}
function codexBlock(url, auth) {
  const lines = [`[mcp_servers.${SERVER_NAME}]`, `url = ${tomlString(url)}`];
  if (auth.kind === "token-env") lines.push(`bearer_token_env_var = ${tomlString(auth.envVar)}`);
  return lines.join("\n");
}
function tomlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
var SECTION_HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;
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
        `${client === "claude-ai" ? "On claude.ai" : "In Claude Desktop"}, open Customize \u2192 Connectors, click +, then \u201CAdd custom connector\u201D.`,
        `Name: Homebase   URL: ${url}   Authentication: sign in (OAuth, \u201CUse Claude's published identity\u201D).`,
        "Click Add, then Connect, and approve the workspace and permissions in the Homebase window.",
        "In a chat, turn Homebase on from the tools menu. The connector also works in Desktop, Cowork and mobile.",
        "Team/Enterprise: an Owner first adds it under Organization settings \u2192 Connectors \u2192 Add \u2192 Custom \u2192 Web; members then click Connect.",
        "Recommended: add the Homebase skill (agent/dist/homebase-skill.zip from `npm run build:agent`) under Customize \u2192 Skills."
      ];
    case "chatgpt":
      return [
        "Open chatgpt.com/plugins, click +, then \u201CCreate custom MCP server\u201D. If that option is missing, turn on Developer mode first: Settings \u2192 Apps \u2192 Advanced settings (on Business/Enterprise/Edu an admin must allow it in workspace settings).",
        `Name: Homebase   Description: Team asset library   URL: ${url}   Authentication: OAuth.`,
        "Accept the risk notice, create it, then approve the workspace and permissions in the Homebase window.",
        "In a chat, enable Homebase from the + menu. Plans: Plus, Pro, Business, Enterprise, Edu.",
        "Optional: upload the Homebase skill zip under Skills \u2192 Create \u2192 Upload from your computer."
      ];
  }
}

// src/commands/setup.ts
function onPath2(command) {
  return spawnSync2(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" }).status === 0;
}
async function mayApply(ctx, yes, question) {
  if (yes) return "yes";
  if (ctx.json || !ctx.io.isTTY) return "needs-yes";
  return await ctx.confirm(question) ? "yes" : "no";
}
async function connectClaudeCode(ctx, url, opts) {
  const command = claudeCodeCommand(url, opts.scope);
  const pluginHint = "Or install the Homebase plugin (skill + MCP + /homebase commands): claude plugin marketplace add <path-to>/agent && claude plugin install homebase@homebase";
  const after = "Then run /mcp inside Claude Code and choose homebase \u2192 Authenticate to approve the workspace in your browser. Over SSH or headless: `claude mcp login homebase --no-browser`, open the printed link anywhere, and paste the redirect URL back.";
  const hasClaude = onPath2("claude");
  if (opts.print || !hasClaude) {
    if (ctx.json) printJson(ctx.io, { client: "claude-code", url, command, ran: false, claude_found: hasClaude, next_step: `${hasClaude ? "" : "Install Claude Code, then run: "}${command}. ${after}` });
    else ctx.io.stdout([hasClaude ? "Run:" : "Claude Code isn't on PATH. Once it is, run:", `  ${command}`, after, pluginHint].join("\n") + "\n");
    return;
  }
  const decision = await mayApply(ctx, opts.yes, `Run \`${command}\`?`);
  if (decision !== "yes") {
    if (ctx.json) printJson(ctx.io, { client: "claude-code", url, command, ran: false, next_step: decision === "needs-yes" ? "Confirm with the user, then rerun with --yes (or let them run the command)." : "Cancelled." });
    else ctx.io.stdout(decision === "no" ? "Cancelled.\n" : `Run:
  ${command}
`);
    return;
  }
  const result = spawnSync2("claude", claudeCodeArgs(url, opts.scope), { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const already = /already exists/i.test(output);
  if (ctx.json) {
    printJson(ctx.io, { client: "claude-code", url, command, ran: true, ok: result.status === 0 || already, alreadyConfigured: already, output, next_step: after });
  } else {
    ctx.io.stdout(`${output || "Added."}
${already ? "(Homebase was already configured.)\n" : ""}${after}
`);
  }
  if (result.status !== 0 && !already) throw Object.assign(new CliError(`claude mcp add failed: ${output}`, { code: "claude_failed" }), { alreadyReported: ctx.json });
}
var CODEX_HEADLESS_NOTE = "For `codex exec` (approval policy never), Homebase write tools are refused unless approved in config: see the skill's references/setup.md (Codex, headless).";
async function connectCodex(ctx, url, opts) {
  const codexHome = ctx.env.CODEX_HOME || join4(homedir2(), ".codex");
  const path = resolve3(ctx.cwd, opts.configPath ?? join4(codexHome, "config.toml"));
  const auth = opts.token ? { kind: "token-env", envVar: opts.tokenEnv } : { kind: "oauth" };
  const block = codexBlock(url, auth);
  const before = existsSync3(path) ? readFileSync3(path, "utf8") : "";
  const after = upsertCodexConfig(before, block);
  const diff = lineDiff(before, after, path);
  const next = opts.token ? `Codex sends the bearer token from $${opts.tokenEnv}. Create a key in Homebase Settings \u2192 Agents with only the permissions it needs, and give it to Codex the way you handle other secrets (a secrets manager or CI secret). Don't put tokens in shell profiles or dotfiles. ${CODEX_HEADLESS_NOTE}` : `Now run \`codex mcp login homebase\` and approve the workspace and permissions in your browser. ${CODEX_HEADLESS_NOTE}`;
  const base = { client: "codex", url, configPath: path, snippet: block, diff };
  if (!diff) {
    if (ctx.json) printJson(ctx.io, { ...base, applied: false, alreadyConfigured: true, next_step: next });
    else ctx.io.stdout(`${path} already has this Homebase entry.
${next}
`);
    return;
  }
  if (opts.print) {
    if (ctx.json) printJson(ctx.io, { ...base, applied: false, next_step: `Add the snippet to ${path}. ${next}` });
    else ctx.io.stdout(`Add to ${path}:

${block}

${next}
`);
    return;
  }
  if (!ctx.json) ctx.io.stderr(`${diff}

`);
  const decision = await mayApply(ctx, opts.yes, `Write this to ${path}?`);
  if (decision !== "yes") {
    if (ctx.json) printJson(ctx.io, { ...base, applied: false, next_step: decision === "needs-yes" ? "Show the diff to the user; only if they approve, rerun with --yes." : "Cancelled." });
    else ctx.io.stdout(decision === "no" ? "Cancelled; nothing written.\n" : "Not written. Rerun with --yes to apply.\n");
    return;
  }
  mkdirSync3(dirname(path), { recursive: true });
  let backup;
  if (before) {
    backup = `${path}.bak`;
    copyFileSync(path, backup);
  }
  writeFileSync3(path, after);
  if (ctx.json) printJson(ctx.io, { ...base, applied: true, backup, next_step: next });
  else ctx.io.stdout(`Updated ${path}${backup ? ` (backup: ${backup})` : ""}.
${next}
`);
}
function connectCursor(ctx, url) {
  const config = cursorConfig(url);
  const deeplink = cursorDeeplink(url);
  const next = "Open the deeplink (or add the JSON to ~/.cursor/mcp.json), then sign in from Cursor Settings \u2192 MCP (or `cursor-agent mcp login homebase`).";
  if (ctx.json) {
    printJson(ctx.io, { client: "cursor", url, configPath: "~/.cursor/mcp.json", config, deeplink, next_step: next });
    return;
  }
  ctx.io.stdout([`One-click install:`, `  ${deeplink}`, "", `Or add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project):`, JSON.stringify(config, null, 2), "", next].join("\n") + "\n");
}
function connectClickPath(ctx, client, url) {
  const steps = clickPath(client, url);
  if (ctx.json) {
    printJson(ctx.io, { client, url, steps });
    return;
  }
  ctx.io.stdout([`MCP server URL: ${url}`, "", ...steps.map((step, index) => `${index + 1}. ${step}`)].join("\n") + "\n");
}
var connect = {
  spec: {
    name: "connect",
    summary: "Connect an AI client to Homebase's MCP server: claude-code, codex, cursor, claude-desktop, claude-ai, chatgpt.",
    usage: "homebase connect <client> [--yes] [--print] [--scope user|project|local] [--token [--token-env VAR]] [--json]",
    options: {
      yes: { type: "boolean", short: "y", description: "Apply without asking (only after the user agreed)" },
      print: { type: "boolean", description: "Only print the setup; change nothing" },
      scope: { type: "string", value: "scope", description: "claude-code: user (default), project or local" },
      token: { type: "boolean", description: "codex: send a Settings key from an env var instead of signing in with OAuth" },
      oauth: { type: "boolean", description: "codex: sign in through the browser (the default)" },
      "token-env": { type: "string", value: "VAR", description: "codex --token: env var holding the key (default HOMEBASE_TOKEN)" },
      config: { type: "string", value: "path", description: "codex: config.toml to edit (default $CODEX_HOME/config.toml)" }
    },
    maxArgs: 1,
    examples: ["homebase connect claude-code", "homebase connect codex --print", "homebase connect chatgpt"]
  },
  async run(ctx, parsed) {
    const name = parsed.positionals[0];
    const url = mcpUrl(ctx.apiUrl);
    if (!name) {
      if (ctx.json) printJson(ctx.io, { url, clients: CLIENTS });
      else ctx.io.stdout(`MCP server: ${url}
Clients: ${CLIENTS.join(", ")}
Run: homebase connect <client>
`);
      return;
    }
    const client = resolveClient(name);
    if (!client) throw usageError(`Unknown client \u201C${name}\u201D. Choose one of: ${CLIENTS.join(", ")}.`);
    const yes = Boolean(parsed.values.yes);
    const print = Boolean(parsed.values.print);
    switch (client) {
      case "claude-code": {
        const scope = stringOption(parsed.values.scope) ?? "user";
        if (!["user", "project", "local"].includes(scope)) throw usageError("--scope must be user, project or local.");
        return connectClaudeCode(ctx, url, { yes, print, scope });
      }
      case "codex": {
        const tokenEnv = stringOption(parsed.values["token-env"]) ?? "HOMEBASE_TOKEN";
        if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw usageError("--token-env must be an environment variable name like HOMEBASE_TOKEN.");
        if (parsed.values.token && parsed.values.oauth) throw usageError("Use either --token or --oauth (the default).");
        const token2 = Boolean(parsed.values.token) || Boolean(parsed.values["token-env"]);
        return connectCodex(ctx, url, { yes, print, token: token2, tokenEnv, configPath: stringOption(parsed.values.config) });
      }
      case "cursor":
        return connectCursor(ctx, url);
      default:
        return connectClickPath(ctx, client, url);
    }
  }
};
async function probe(ctx, url, init = {}) {
  try {
    return await ctx.fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...init.headers ?? {} }, signal: AbortSignal.timeout(15e3) });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
var doctor = {
  spec: {
    name: "doctor",
    summary: "Check the API, your token and permissions, usage, and the MCP endpoint.",
    usage: "homebase doctor [--json]",
    maxArgs: 0
  },
  async run(ctx) {
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
        checks.push({ name: "token", status: "ok", detail: `\u201C${me.token.name}\u201D for ${me.workspace.name} (${me.user.email ?? me.user.name ?? "?"}, ${me.user.role ?? "?"}) from ${ctx.tokenSource === "env" ? "HOMEBASE_TOKEN" : `profile ${ctx.profile}`}` });
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
    if (ctx.json) printJson(ctx.io, { ok: !failed, api: ctx.apiUrl, mcp, checks: checks.map((check) => ({ name: check.name, status: check.status, detail: check.detail })) });
    else {
      const s = style(ctx.io);
      const mark = { ok: s.green("\u2713"), warn: s.yellow("!"), fail: s.red("\u2717") };
      ctx.io.stdout(checks.map((check) => `${mark[check.status]} ${check.name.padEnd(12)} ${check.detail}`).join("\n") + "\n");
    }
    if (failed) throw Object.assign(new CliError(failed.detail, { exitCode: failed.exitCode ?? EXIT.other, code: `doctor_${failed.name}` }), { alreadyReported: true });
  }
};
var AGENT_ENV_MARKERS = [
  "CI",
  "GITHUB_ACTIONS",
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CODEX_SANDBOX",
  "CODEX_THREAD_ID",
  "CODEX_CI",
  "CURSOR_AGENT",
  "GEMINI_CLI",
  "AI_AGENT"
];
function agentMarker(env) {
  return AGENT_ENV_MARKERS.find((name) => {
    const value = env[name];
    return value !== void 0 && value !== "" && value !== "0" && value.toLowerCase() !== "false";
  });
}
var token = {
  spec: {
    name: "token",
    summary: "Print the current access token, only to a person at a terminal. A secret: never paste it into a chat, file or shell profile.",
    usage: "homebase token [--profile <name>]",
    options: { force: { type: "boolean", description: "Allow stdout to be a pipe, when a person at an interactive terminal runs it" } },
    maxArgs: 0
  },
  async run(ctx, parsed) {
    if (!ctx.auth) throw new CliError("Not logged in. Run `homebase login` first.", { exitCode: EXIT.auth, code: "not_logged_in" });
    const refuse = (why) => new CliError(
      `Refusing to print the token: ${why} Agents never need the raw token: the CLI uses the saved login. For CI or another program, create a key with only the permissions it needs in Settings \u2192 Agents and store it as a secret.`,
      { exitCode: EXIT.usage, code: "token_refused" }
    );
    const marker = agentMarker(ctx.env);
    if (marker) throw refuse(`this looks like an AI agent or CI session (${marker} is set).`);
    if (!ctx.io.stdinTTY) throw refuse("there's no person at an interactive terminal.");
    const toTerminal = ctx.io.stdoutTTY ?? ctx.io.isTTY;
    if (!toTerminal && !parsed.values.force) throw refuse("stdout isn't a terminal, so it would land in a log, a pipe or an AI agent's context.");
    const value = await ctx.auth.token();
    ctx.io.stderr(
      ctx.auth instanceof ProfileAuth && canRefresh(ctx.auth.current()) ? "This is a secret that works for about an hour: don't share it or paste it into chats.\n" : "This is a secret: don't share it or paste it into chats.\n"
    );
    ctx.io.stdout(value + "\n");
  }
};
var setupCommands = [connect, doctor, token];

// src/commands/trash.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { mkdirSync as mkdirSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join5 } from "node:path";

// src/capabilities.ts
var cache = /* @__PURE__ */ new WeakMap();
function openApi(ctx) {
  let pending = cache.get(ctx);
  if (!pending) {
    pending = ctx.api.request("GET", "/v1/openapi.json", { auth: false }).catch(() => void 0);
    cache.set(ctx, pending);
  }
  return pending;
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
async function hasDeletePreview(ctx) {
  const spec = await openApi(ctx);
  if (!spec) return false;
  return /confirm_token/.test(operationText(spec, "/v1/assets/delete", "post") ?? "");
}

// src/commands/trash.ts
var LOCAL_TTL_S = 600;
var RESTORABLE = "30 days, by a workspace owner or admin (homebase restore <id\u2026>, or Library \u2192 Recently deleted)";
function pendingPath(ctx) {
  return join5(ctx.store.dir, "pending-delete.json");
}
function readLocal(ctx) {
  try {
    const data = JSON.parse(readFileSync4(pendingPath(ctx), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
function writeLocal(ctx, data) {
  mkdirSync4(ctx.store.dir, { recursive: true, mode: 448 });
  const now = Date.now();
  const fresh = Object.fromEntries(Object.entries(data).filter(([, entry]) => entry.expiresAt > now));
  writeFileSync4(pendingPath(ctx), JSON.stringify(fresh, null, 2), { mode: 384 });
}
var sameIds = (a, b) => [...a].sort().join(",") === [...b].sort().join(",");
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
  const token2 = `local_${randomBytes2(12).toString("hex")}`;
  if (assets.length) writeLocal(ctx, { ...readLocal(ctx), [token2]: { ids: assets.map((asset) => asset.id), api: ctx.apiUrl, expiresAt: Date.now() + LOCAL_TTL_S * 1e3 } });
  return { preview: true, assets, notFound, confirm_token: assets.length ? token2 : "", expires_in: LOCAL_TTL_S, source: "local" };
}
function bucketNote(bucket) {
  const name = stripControl(bucket.name);
  if (bucket.clientLinkLive) return `\u201C${name}\u201D: client link is LIVE${bucket.clientOpened ? ", and the client has opened it" : ""}`;
  if (bucket.clientLinkLive === false) return `\u201C${name}\u201D (client link off)`;
  return `\u201C${name}\u201D${bucket.shareUrl ? " (has a client share page)" : ""}`;
}
function renderPreview(ctx, preview) {
  const s = style(ctx.io);
  const n = preview.assets.length;
  const lines = [`This would move ${n} asset${n === 1 ? "" : "s"} to Recently deleted, removing ${n === 1 ? "it" : "them"} from every bucket and client share page:`];
  preview.assets.forEach((asset, index) => {
    lines.push(`  ${index + 1}. ${s.bold(stripControl(asset.title))}  (${stripControl(asset.id)}, ${stripControl(asset.type)})`);
    lines.push(asset.buckets.length ? `     in ${asset.buckets.map(bucketNote).join("; ")}` : "     in no bucket (library only)");
  });
  if (preview.notFound.length) lines.push(`Not found (already gone or wrong id): ${preview.notFound.map(stripControl).join(", ")}`);
  const live = preview.assets.filter((asset) => asset.buckets.some((bucket) => bucket.clientLinkLive));
  if (live.length) lines.push(s.yellow(`Warning: ${live.length} of these ${live.length === 1 ? "is" : "are"} on a live client link. The client will stop seeing ${live.length === 1 ? "it" : "them"}.`));
  lines.push(`An owner or admin can restore them for 30 days.`);
  return lines.join("\n");
}
async function confirmDelete(ctx, ids, token2, source) {
  if (source === "local") {
    const pending = readLocal(ctx);
    const entry = pending[token2];
    if (!entry || entry.expiresAt < Date.now() || entry.api !== ctx.apiUrl) {
      throw new CliError("That confirm token is unknown or expired. Run `homebase delete <ids\u2026>` again to preview, and show the user the list.", { exitCode: EXIT.confirm, code: "confirm_token_invalid" });
    }
    if (!sameIds(entry.ids, ids)) {
      throw new CliError("The ids don't match the preview this token was issued for. Preview exactly the assets the user approved.", { exitCode: EXIT.confirm, code: "confirm_token_mismatch" });
    }
    delete pending[token2];
    writeLocal(ctx, pending);
    const body2 = await ctx.api.post("/v1/assets/delete", { ids });
    if (body2.preview === true) return normalizePreview(body2, "server");
    return body2;
  }
  let body;
  try {
    body = await ctx.api.post("/v1/assets/delete", { ids, confirm_token: token2 });
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
var isPreview = (result) => result.preview === true;
function printDeleted(ctx, result) {
  if (ctx.json) {
    printJson(ctx.io, { deleted: result.deleted ?? [], notFound: result.notFound ?? [], restorable: RESTORABLE });
    return;
  }
  ctx.io.stdout(`Moved ${result.deleted?.length ?? 0} to Recently deleted (restorable for 30 days by an owner or admin: homebase restore <id\u2026>).
`);
  if (result.notFound?.length) ctx.io.stderr(`Not found: ${result.notFound.join(", ")}
`);
}
function needsConfirmation(ctx, ids, preview) {
  const rerun = `homebase delete ${ids.join(" ")} --confirm-token ${preview.confirm_token}`;
  const nextStep = `Show the user exactly this list (titles, buckets, client-link warnings) and ask whether to delete these. Only after they say yes in a new message, run: ${rerun} --json. Never run it in the same turn as this preview. The token expires in ${Math.round(preview.expires_in / 60)} minutes.`;
  if (ctx.json) {
    printJson(ctx.io, { confirmation_required: true, ...preview, next_step: nextStep, exit_code: EXIT.confirm });
  } else {
    ctx.io.stderr(`${renderPreview(ctx, preview)}
`);
  }
  throw Object.assign(
    new CliError(`Confirmation required: show the user this list and, only after they say yes, rerun with --confirm-token ${preview.confirm_token}. Nothing was deleted.`, {
      exitCode: EXIT.confirm,
      code: "confirmation_required"
    }),
    { alreadyReported: ctx.json }
  );
}
var del = {
  spec: {
    name: "delete",
    summary: "Move assets to Recently deleted (restorable 30 days). Always previews first; deleting needs the user's yes.",
    usage: "homebase delete <asset id\u2026> [--yes] [--confirm-token <t>] [--json]",
    options: {
      yes: { type: "boolean", short: "y", description: "At a terminal: skip the y/N prompt (the preview is still printed)" },
      "confirm-token": { type: "string", value: "token", description: "From a previous preview the user approved; deletes those ids" }
    },
    minArgs: 1,
    examples: [
      "homebase delete jx7abc\u2026            # preview, then y/N",
      "homebase delete jx7abc\u2026 --json     # agents: preview + confirm_token, exit 6",
      "homebase delete jx7abc\u2026 --confirm-token <t> --json   # only after the user said yes"
    ]
  },
  async run(ctx, parsed) {
    const ids = parsed.positionals;
    if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
    for (const id of ids) if (!looksLikeId(id)) throw usageError(`\u201C${id}\u201D isn't an asset id. Find ids with \`homebase search\`.`);
    const twoStep = await hasDeletePreview(ctx);
    const token2 = stringOption(parsed.values["confirm-token"]);
    if (token2) {
      const source = token2.startsWith("local_") ? "local" : "server";
      if (source === "server" && !twoStep) throw usageError("This server doesn't issue confirm tokens; that token isn't from `homebase delete`. Run the preview again.");
      const result2 = await confirmDelete(ctx, ids, token2, source);
      if (isPreview(result2)) return needsConfirmation(ctx, ids, result2);
      return printDeleted(ctx, result2);
    }
    let preview;
    if (twoStep) {
      const body = await ctx.api.post("/v1/assets/delete", { ids });
      if (body.preview !== true) {
        return printDeleted(ctx, body);
      }
      preview = normalizePreview(body, "server");
    } else {
      preview = await localPreview(ctx, ids);
    }
    if (!preview.assets.length) {
      if (ctx.json) printJson(ctx.io, { deleted: [], notFound: preview.notFound, restorable: RESTORABLE });
      else ctx.io.stderr(`Nothing to delete. Not found: ${preview.notFound.join(", ")}
`);
      return;
    }
    if (!interactive(ctx.io)) return needsConfirmation(ctx, ids, preview);
    ctx.io.stderr(`${renderPreview(ctx, preview)}
`);
    const yes = Boolean(parsed.values.yes) || await ctx.confirm(`Delete ${preview.assets.length === 1 ? "it" : `these ${preview.assets.length}`}?`);
    if (!yes) {
      if (ctx.json) printJson(ctx.io, { deleted: [], notFound: preview.notFound, cancelled: true });
      else ctx.io.stderr("Nothing deleted.\n");
      return;
    }
    const finalIds = preview.assets.map((asset) => asset.id);
    const result = await confirmDelete(ctx, finalIds, preview.confirm_token, preview.source);
    if (isPreview(result)) return needsConfirmation(ctx, finalIds, result);
    printDeleted(ctx, result);
  }
};
var iso = (value) => typeof value === "number" ? isoFromMs(value) : value;
var deleted = {
  spec: {
    name: "deleted",
    summary: "List Recently deleted assets (restorable for 30 days by an owner or admin).",
    usage: "homebase deleted [--limit <n>] [--cursor <c>] [--json]",
    options: {
      limit: { type: "string", value: "n", description: "Per page, 1-100 (default 50)" },
      cursor: { type: "string", value: "cursor", description: "nextCursor from the previous page" }
    },
    maxArgs: 0
  },
  async run(ctx, parsed) {
    let page;
    try {
      page = await ctx.api.get("/v1/assets/deleted", { limit: intOption(parsed.values.limit, "limit", 1, 100), cursor: stringOption(parsed.values.cursor) });
    } catch (error) {
      if (isMissingRoute(error, /No asset with id deleted/)) throw unsupportedError("listing Recently deleted", "Owners and admins can see it in the web app: Library \u2192 Recently deleted.");
      throw error;
    }
    const assets = (page.assets ?? page.items ?? []).map((asset) => ({ ...asset, deletedAt: iso(asset.deletedAt), purgeAt: iso(asset.purgeAt) }));
    if (ctx.json) {
      printJson(ctx.io, { assets, nextCursor: page.nextCursor ?? null });
      return;
    }
    if (!assets.length) {
      ctx.io.stdout("Recently deleted is empty.\n");
      return;
    }
    const s = style(ctx.io);
    ctx.io.stdout(
      table([
        [s.dim("ID"), s.dim("TYPE"), s.dim("DELETED"), s.dim("PURGED"), s.dim("TITLE")],
        ...assets.map((asset) => [s.cyan(asset.id), asset.type, shortDate(asset.deletedAt), shortDate(asset.purgeAt), asset.title])
      ]) + `
${page.nextCursor ? s.dim(`More: homebase deleted --cursor ${page.nextCursor}
`) : ""}`
    );
  }
};
var restore = {
  spec: {
    name: "restore",
    summary: "Bring assets back from Recently deleted, into the buckets they were in (owner or admin).",
    usage: "homebase restore <asset id\u2026> [--json]",
    minArgs: 1
  },
  async run(ctx, parsed) {
    const ids = parsed.positionals;
    if (ids.length > 50) throw usageError("At most 50 assets per call. Split the list.");
    for (const id of ids) if (!looksLikeId(id)) throw usageError(`\u201C${id}\u201D isn't an asset id. List them with \`homebase deleted\`.`);
    let result;
    try {
      result = await ctx.api.post("/v1/assets/restore", { ids });
    } catch (error) {
      if (isMissingRoute(error)) throw unsupportedError("restoring assets", "Owners and admins can restore them in the web app: Library \u2192 Recently deleted.");
      throw error;
    }
    if (ctx.json) {
      printJson(ctx.io, { restored: result.restored ?? [], notFound: result.notFound ?? [] });
      return;
    }
    ctx.io.stdout(`Restored ${result.restored?.length ?? 0} asset${result.restored?.length === 1 ? "" : "s"}.
`);
    if (result.notFound?.length) ctx.io.stderr(`Not in Recently deleted: ${result.notFound.join(", ")}
`);
  }
};
var trashCommands = [del, deleted, restore];

// src/main.ts
var COMMANDS = [...authCommands, ...libraryCommands, ...bucketCommands, ...trashCommands, ...setupCommands];
var SECTIONS = [
  ["Find", ["search", "recent", "get", "versions", "view", "open", "download", "buckets", "bucket ls", "share-link"]],
  ["Add & organise", ["upload", "import", "tag", "rename", "bucket create", "bucket add", "bucket remove"]],
  ["Delete & restore", ["delete", "deleted", "restore"]],
  ["Account & setup", ["login", "logout", "whoami", "profiles", "profiles use", "connect", "doctor", "token"]]
];
function topHelp() {
  const byName = new Map(COMMANDS.map((command) => [command.spec.name, command.spec]));
  const lines = [
    `homebase ${CLI_VERSION} \u2014 your team's asset library, from the terminal and for AI agents.`,
    "",
    "Usage: homebase <command> [options]      (add --json to any command for machine output)"
  ];
  for (const [title, names] of SECTIONS) {
    lines.push("", `${title}:`);
    for (const name of names) {
      const spec = byName.get(name);
      if (spec) lines.push(`  ${name.padEnd(15)} ${spec.summary}`);
    }
  }
  lines.push(
    "",
    "Global options: --json, --api <url>, --profile <name>, -h/--help, --version",
    "Environment:    HOMEBASE_TOKEN, HOMEBASE_API_URL, HOMEBASE_PROFILE, HOMEBASE_CONFIG_DIR, HOMEBASE_NO_KEYCHAIN=1",
    "Login:          homebase login signs in through your browser (one click if you're signed in there); over SSH or",
    "                headless it uses --device. Logins renew themselves and are only sent to the API they came from.",
    "Exit codes:     0 ok \xB7 1 error \xB7 2 usage \xB7 3 auth/permission \xB7 4 limit reached (don't retry) \xB7 5 not found \xB7 6 needs the user's confirmation",
    "",
    'Start with: homebase login, then homebase search "latest logo files".'
  );
  return lines.join("\n");
}
function groupHelp(group) {
  const subs = COMMANDS.filter((command) => command.spec.name.startsWith(`${group} `)).map((command) => command.spec);
  return [`homebase ${group} <command>`, "", ...subs.map((spec) => `  ${spec.name.padEnd(15)} ${spec.summary}`)].join("\n");
}
function reportError(io, json, error) {
  const stop = doNotRetryLine(error);
  if (stop) io.stderr(`${stop}
`);
  if (json) {
    printJson(io, errorJson(error));
    return;
  }
  const s = style({ ...io, color: io.color && io.isTTY });
  const lines = [`${s.red("Error:")} ${error.message}`];
  const server = error.server;
  if (server?.upgrade_url && !stop) lines.push(`Upgrade: ${server.upgrade_url}`);
  if (server?.missing_scopes?.length) lines.push(`Missing permissions: ${server.missing_scopes.join(", ")}`);
  if (error.hint) lines.push(error.hint);
  io.stderr(lines.join("\n") + "\n");
}
async function run(argv, overrides = {}) {
  const io = overrides.io ?? processIo();
  const wantsJson = argv.includes("--json");
  try {
    const parsed = parseCommandLine(argv, COMMANDS.map((command2) => command2.spec));
    if (parsed.values.version) {
      io.stdout(wantsJson ? JSON.stringify({ version: CLI_VERSION }) + "\n" : `${CLI_VERSION}
`);
      return EXIT.ok;
    }
    if (parsed.group && !parsed.command) {
      if (parsed.values.help) {
        io.stdout(groupHelp(parsed.group) + "\n");
        return EXIT.ok;
      }
      throw usageError(`\`homebase ${parsed.group}\` needs a sub-command.`, groupHelp(parsed.group));
    }
    if (!parsed.command) {
      io.stdout(topHelp() + "\n");
      return parsed.values.help ? EXIT.ok : EXIT.usage;
    }
    if (parsed.values.help) {
      io.stdout(helpFor(parsed.command) + "\n");
      return EXIT.ok;
    }
    const command = COMMANDS.find((entry) => entry.spec === parsed.command);
    const ctx = createCtx(parsed, { ...overrides, io });
    await command.run(ctx, parsed);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof CliError) {
      if (!error.alreadyReported) reportError(io, wantsJson, error);
      else {
        const stop = doNotRetryLine(error);
        if (stop) io.stderr(`${stop}
`);
      }
      return error.exitCode;
    }
    const wrapped = new CliError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, { code: "internal" });
    reportError(io, wantsJson, wrapped);
    if (process.env.HOMEBASE_DEBUG && error instanceof Error) io.stderr(`${error.stack}
`);
    return EXIT.other;
  }
}

// src/bin.ts
var major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  process.stderr.write(`homebase needs Node.js 20 or newer (this is ${process.versions.node}).
`);
  process.exit(1);
}
if (process.env.NO_COLOR && process.env.FORCE_COLOR) delete process.env.FORCE_COLOR;
process.exitCode = await run(process.argv.slice(2));
