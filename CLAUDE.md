# Reviewa

VS Code extension that lets developers leave inline code review comments on any file or git diff, which are automatically injected into Claude Code's, Codex's, or Gemini CLI's context to be resolved.

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

### Hook Integration
- Hook management is split across three files in `src/hook-managers/` coordinated by `src/hookManager.ts`
- **Claude Code hook** (`src/hook-managers/claudeCodeHookManager.ts`): `~/.reviewa/v1/hook.js` (Node.js) + `hook.sh` wrapper, registered in `~/.claude/settings.json`
- **Codex hook** (`src/hook-managers/codexHookManager.ts`): `~/.reviewa/v1/hook.py` (Python stdlib only), registered in `~/.codex/hooks.json`
  - Ensures `codex_hooks = true` in `~/.codex/config.toml` `[features]` section
  - Shows a VS Code warning if `codex_hooks` is explicitly set to `false`
- **Gemini CLI hook** (`src/hook-managers/geminiCliHookManager.ts`): `~/.reviewa/v1/gemini-cli/hooks/before_model_insert_comments.js` (Node.js) + `.sh` wrapper, registered in `~/.gemini/settings.json`
  - Uses `BeforeModel` hook event — injects comments directly into the LLM request messages
  - Also registers an `AfterTool` hook (`after_tool_plan_hook.js`) to track Gemini plan file creation for the plan watcher
- Claude and Codex hooks use `UserPromptSubmit`; Gemini uses `BeforeModel` — all filter comments by `cwd`, then delete consumed JSON files
- Comments are single-use — whichever CLI processes a comment first consumes and deletes it from disk
- Hook scripts are embedded as string constants and written to disk on activation
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
- `src/hookManager.ts` — coordinates hook script installation and registration across all supported agents
- `src/hook-managers/claudeCodeHookManager.ts` — Claude Code hook script (Node.js) + `~/.claude/settings.json` registration
- `src/hook-managers/codexHookManager.ts` — Codex hook script (Python) + `~/.codex/hooks.json` registration + config.toml feature flag
- `src/hook-managers/geminiCliHookManager.ts` — Gemini CLI hook script (Node.js) + `~/.gemini/settings.json` registration
- `src/gitUtils.ts` — git URI parsing + repo root resolution via `vscode.git` extension API
- `src/fileWatcher.ts` — watches comment dir for deletions to update thread state + comment labels
- `src/statusBar.ts` — status bar item showing pending comment count with custom glasses icon
- `src/commentStore.ts` — in-memory store + JSON file persistence, cleanup on deactivation, pending/processed count + change event
- `src/planUtils.ts` — shared plan metadata reading + workspace relevance check used by watchers and plan store
- `src/planStore.ts` — in-memory store for plan entries displayed in the Plans tree view, scans metadata dirs on activation
- `src/planTreeView.ts` — Plans tree view with Claude/Gemini group headers, session-detected plans shown with sparkle icon
- `src/types.ts` — `ReviewaComment` interface, `CommentSide` type, directory constants

## Resources
- VS Code Extension API docs: !`echo $HOME`/gh/microsoft/vscode-docs
- Claude Code Hooks documentation: !`echo $HOME`/gh/ericbuess/claude-code-docs
- Codex Hooks documentation: `misc/codex/`
- Gemini CLI documentation: !`echo $HOME`/gh/google-gemini/gemini-cli
- GitHub Pull Request extension (reference for Comment Controller patterns and git URI resolution): !`echo $HOME`/gh/Microsoft/vscode-pull-request-github

## Testing

### Unit Tests
```
npm run test:unit      # run all unit tests (vitest)
npx vitest run <file>  # run a specific test file
```

- Framework: vitest with custom vscode API mock (`src/test/unit/mocks/vscode.ts`)
- Test helpers: `src/test/unit/helpers/factories.ts` — `makeReviewaComment()`, `makeMockThread()`, `makeMockComment()`, `makeMockExtensionContext()`
- Config: `vitest.config.ts` aliases `vscode` to the mock module automatically
- Mock `fs` and `child_process` with `vi.mock()` per test file as needed

#### Test files by domain
- `src/test/unit/comment_store.test.ts` — CommentStore CRUD, file I/O, suppression, events
- `src/test/unit/comment_controller.test.ts` — all 7 command handlers, diff side detection, regression tests
- `src/test/unit/file_watcher.test.ts` — hook consumption, suppression, auto-collapse
- `src/test/unit/hook_managers.test.ts` — CLI detection, script installation, hook registration for all agents
- `src/test/unit/ui_components.test.ts` — tree view data provider, status bar item
- `src/test/unit/plan_and_copy.test.ts` — plan watcher, copy commands, format helpers
- `src/test/unit/plan_tree_view.test.ts` — planUtils, PlanStore, plan tree view registration

#### Rules for coding agents
- **Every new feature must include unit tests** covering the happy path and key edge cases
- **Every bug fix must include a regression test** that fails without the fix and passes with it
- Run `npm run test:unit` before considering any change complete — all tests must pass
- When modifying existing code, update the corresponding test file to reflect the new behavior
- Follow existing test patterns: mock `fs`/`child_process` at module level, use factory helpers, reset mocks in `beforeEach`/`afterEach`

### Manual Testing
Launch Extension Development Host (F5), open any file or diff, and leave comments via the gutter icon. Comments work in normal file views, split diff view (both sides), and inline diff view (modified side only — removed lines in inline mode are a VS Code limitation).
