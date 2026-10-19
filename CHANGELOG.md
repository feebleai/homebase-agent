# Changelog

The Homebase CLI (`homebase-cli` on npm), the Homebase plugin and the skill share one version. Each release is tagged `v<version>` in this repo and published to npm under the same version.

## 0.1.2

- **Skill and MCP**: before creative or media work (creatives, ads, posts, generated images or video) the agent checks Homebase for the brand's references first and says which it used.
- **Skill and MCP**: when uploading files of a recurring subject Homebase doesn't know by name (a mascot), the agent asks its name once and tags the files with it.
- **Tags**: AI indexing now tags assets itself; those tags show with a sparkle and removing one keeps it off.

## 0.1.1

- **CLI**: waits out the per-minute rate limit and keeps going (up to 60 seconds a wait, 30 waits a request), so large uploads finish instead of stopping partway.
- **Skill**: in Claude Code and Codex, the agent checks the CLI sign-in at the start of the first Homebase task and tells you right away if it's missing, instead of only when an upload fails.
- **Skill**: on a per-minute `rate_limited`, wait and re-run the same command once; uploads skip files already in Homebase.
- **Plugin README and docs**: privacy section lists every network destination, what is sent, and what is stored on your computer.

## 0.1.0

First public release.

- **CLI**: `search`, `recent`, `get`, `versions`, `view`, `link`, `download`, `buckets`, `bucket ls|create|add|remove`, `share-link`, `upload`, `import`, `tag`, `rename`, `delete` (preview, then confirm), `deleted`, `restore`, `login` (browser PKCE or device code, renewing logins in the OS keychain), `logout`, `whoami`, `profiles`, `connect`, `doctor`, `schema`. One JSON document per command, documented exit codes, no prompts.
- **Plugin**: the Homebase skill, the Homebase MCP server, the bundled CLI and `/homebase:find`, `/homebase:upload`, `/homebase:connect`, `/homebase:status` for Claude Code; Agent Plugins manifest for Codex and Cursor; icons, links and brand colour for directory listings.
- **Permissions**: "Manage buckets" is on by default (recommended); delete is never pre-selected.
- **Privacy**: `whoami` shows your name, workspace, role, permissions and usage, never your email address.
- **MIT licensed.**
