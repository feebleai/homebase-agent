# Changelog

The Homebase CLI (`homebase-cli` on npm), the Homebase plugin and the skill share one version. Each release is tagged `v<version>` in this repo and published to npm under the same version.

## 0.1.0

First public release.

- **CLI**: `search`, `recent`, `get`, `versions`, `view`, `link`, `download`, `buckets`, `bucket ls|create|add|remove`, `share-link`, `upload`, `import`, `tag`, `rename`, `delete` (preview, then confirm), `deleted`, `restore`, `login` (browser PKCE or device code, renewing logins in the OS keychain), `logout`, `whoami`, `profiles`, `connect`, `doctor`, `schema`. One JSON document per command, documented exit codes, no prompts.
- **Plugin**: the Homebase skill, the Homebase MCP server, the bundled CLI and `/homebase:find`, `/homebase:upload`, `/homebase:connect`, `/homebase:status` for Claude Code; Agent Plugins manifest for Codex and Cursor; icons, links and brand colour for directory listings.
- **Permissions**: "Manage buckets" is on by default (recommended); delete is never pre-selected.
- **Privacy**: `whoami` shows your name, workspace, role, permissions and usage, never your email address.
- **MIT licensed.**
