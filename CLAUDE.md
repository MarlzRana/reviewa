# Reviewa

VS Code extension that lets developers leave inline code review comments on local git diffs, which are automatically injected into Claude Code's context to be resolved.

## Architecture

### VS Code Extension (`src/`)
- **Comment Controller API** — provides inline comment UI in diff views
- Comments appear on both `git` scheme (diff left side) and `file` scheme (diff right side + untracked files), gated by checking git change status
- In-memory `Map<uuid, TrackedComment>` is the UI source of truth
- `fs.watch` on `~/.reviewa/v1/comments/` detects when the hook consumes comments, then marks threads as resolved/collapsed

### Comment Storage
- Individual JSON files in `~/.reviewa/v1/comments/<uuid>.json`
- Schema: uuid, status, created_at, workspace, abs_path, line_number, line_content, line_content_hash, content
- Line content hash: first 6 chars of SHA-256 hex

### Claude Code Hook
- `~/.reviewa/v1/hook.js` — Node.js script registered as a `UserPromptSubmit` hook in `~/.claude/settings.json`
- Filters comments by `cwd`, validates line content hash (deletes stale), injects valid ones as `additionalContext`, then deletes consumed JSON files
- Hook script is embedded as a string constant in `src/hookManager.ts` and written to disk on activation

## Build

```
npm run compile    # type check + lint + esbuild
npm run watch      # dev mode with file watching
```

- Entry point: `src/extension.ts` → bundled to `dist/extension.js`
- Single esbuild bundle, CommonJS format, `vscode` is external
- No production dependencies

## Key Files
- `src/commentController.ts` — Comment Controller setup + submit handler (core UI)
- `src/hookManager.ts` — hook script installation + `~/.claude/settings.json` registration
- `src/gitUtils.ts` — git URI parsing + repo root resolution via `vscode.git` extension API
- `src/fileWatcher.ts` — watches comment dir for deletions to update thread state

## Testing
Launch Extension Development Host (F5), open Source Control, click a changed file to view its diff, and leave comments via the gutter icon.
