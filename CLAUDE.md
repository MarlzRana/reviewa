# Reviewa

VS Code extension that lets developers leave inline code review comments on any file or git diff, which are automatically injected into Claude Code's context to be resolved.

## Architecture

### VS Code Extension (`src/`)
- **Comment Controller API** — provides inline comment UI in both normal file views and diff views
- Comments appear on `git` scheme (diff left side) and `file` scheme (normal files + diff right side)
- Diff side detection: uses `TabInputTextDiff` to determine if a `file` scheme document is in a diff view, then compares line content between old/new documents to distinguish additions from unchanged context lines
- Threads support multiple replies — all comments on a thread concatenate into a single JSON file on disk
- Each comment displays a `Pending` / `Processed` label next to the author name
- Thread label shows `Pending comments` or `All comments processed`
- Author info pulled from GitHub authentication if available, falls back to "You"
- `fs.watch` on `~/.reviewa/v1/comments/` detects when the hook consumes comments, then marks threads as resolved/collapsed
- In-memory `Map<uuid, TrackedComment>` is the UI source of truth; thread `contextValue` stores the uuid for reverse lookup
- On deactivation (workspace close): all pending comment files are deleted from disk

### Comment Storage
- Individual JSON files in `~/.reviewa/v1/comments/<uuid>.json`
- Schema: uuid, status, created_at, workspace, abs_path, line_number, line_content, side, content
- `side` field: `'file'` | `'addition'` | `'removal'` — determines line prefix in context output

### Claude Code Hook
- `~/.reviewa/v1/hook.js` — Node.js script registered as a `UserPromptSubmit` hook in `~/.claude/settings.json`
- Filters comments by `cwd`, injects as `additionalContext`, then deletes consumed JSON files
- Hook script is embedded as a string constant in `src/hookManager.ts` and written to disk on activation
- Context format per comment:
  ```
  In `src/foo.ts` at line 42:
  ```
  +const x = 1
  ```
  Your comment here
  ```
  Lines prefixed with `+` for additions, `-` for removals, no prefix for normal file/context lines

## Build

```
npm run compile    # type check + lint + esbuild
npm run watch      # dev mode with file watching
```

- Entry point: `src/extension.ts` → bundled to `dist/extension.js`
- Single esbuild bundle, CommonJS format, `vscode` is external
- No production dependencies

## Key Files
- `src/commentController.ts` — Comment Controller setup, submit handler, diff side detection, GitHub author resolution
- `src/hookManager.ts` — hook script installation + `~/.claude/settings.json` registration
- `src/gitUtils.ts` — git URI parsing + repo root resolution via `vscode.git` extension API
- `src/fileWatcher.ts` — watches comment dir for deletions to update thread state + comment labels
- `src/commentStore.ts` — in-memory store + JSON file persistence, cleanup on deactivation
- `src/types.ts` — `ReviewaComment` interface, `CommentSide` type, directory constants

## Testing
Launch Extension Development Host (F5), open any file or diff, and leave comments via the gutter icon. Comments work in normal file views, split diff view (both sides), and inline diff view (modified side only — removed lines in inline mode are a VS Code limitation).
