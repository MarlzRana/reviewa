# Changelog

All notable changes to the Reviewa extension will be documented in this file.

## [0.0.9] - 2026-03-31

### Added

- Gemini CLI plan support — auto-opens Gemini CLI plan files and allows inline commenting on them
- Plan support enabled by default for both Claude Code and Gemini CLI

### Fixed

- Gemini CLI hook now uses logical path for correct matching on plan file comments
- Version directory missing for gemini-cli hook scripts

### Changed

- Gemini CLI hook migrated from `BeforeAgent` to `BeforeModel` callback to support plan comment injection
- `reviewa.planSupport` setting restructured as per-CLI dictionary (`claudeCode`, `geminiCli`) replacing single `enabled` flag
- Gemini CLI hook scripts moved to dedicated `~/.reviewa/v1/gemini-cli/hooks/` directory

## [0.0.8] - 2026-03-30

### Added

- Comment tree view — new activity bar panel showing all comment threads grouped by file
- Copy plan comments — button to copy all comments formatted for pasting into a plan
- Copy all comments — button to copy all comments to clipboard
- Plan watcher — auto-opens plans and inserts comments on next user prompt
- Unit test suite — comprehensive tests for all major modules using vitest

### Fixed

- Auto-collapse setting not being respected when coding agent consumes comments

### Changed

- Improved icons for copy plan and copy all comments actions

## [0.0.7] - 2026-03-29

### Added

- Markdown rendering in comment bodies — comment text is now rendered as markdown in preview mode
- Status bar item — shows pending comment thread count with custom glasses icon, click to open Comments panel
- Custom `reviewa-glasses` icon font for status bar branding
- Gutter icon color differentiation — pending comments show as unresolved (theme-colored), processed as resolved (dimmed)

### Fixed

- Gutter icon not reflecting comment state — new threads now explicitly set `Unresolved` state

## [0.0.6] - 2026-03-29

### Added

- Rounded rectangle avatar — GitHub profile pictures are now rendered with rounded corners
- `autoCollapseOnCodingAgentConsumption` setting — opt-in to auto-collapse threads when a coding agent consumes them (default: `false`)
- Comments are now sorted by creation time before being injected into coding agent context
- `created_at` timestamp updates on follow-up reply, edit, and re-pend actions

### Fixed

- Tooltip text showing wrong action when toggling between re-pending and processed states

## [0.0.5] - 2026-03-28

### Added

- Re-pending state — toggle processed comments back to re-pending so they are sent to the coding agent again
- Edit processed comments — editing a processed comment auto-sets it to re-pending
- Toggle icon `$(history)` on processed and re-pending comments

### Fixed

- Thread label not updating when deleting the last pending comment from a mixed thread
- Thread collapsing when deleting comments via UI (now only collapses when a coding agent consumes)
- Processed comment text being included in context file alongside pending follow-ups

## [0.0.4] - 2026-03-28

### Added

- Gemini CLI hook support — review comments are now injected into Google Gemini CLI via a `BeforeAgent` hook registered in `~/.gemini/settings.json`
- CLI detection — hooks are only registered for CLIs that are installed on PATH

### Fixed

- Follow-up comments on processed threads were not being saved to disk

### Changed

- Consistent naming: "Claude Code", "Codex", "Gemini CLI" throughout codebase and docs

## [0.0.3] - 2026-03-28

### Added

- Codex hook support — review comments are now injected into OpenAI Codex via a Python `UserPromptSubmit` hook
- Automatic `codex_hooks = true` feature flag in `~/.codex/config.toml`
- Warning notification if `codex_hooks` is explicitly disabled

### Changed

- Split hook manager into separate Claude and Codex modules

## [0.0.2] - 2026-03-28

### Added

- Extension icon

## [0.0.1] - 2026-03-27

### Added

- Inline comments on any file or git diff
- Diff view support (additions, removals, context lines)
- Multi-comment threads with edit and delete
- Status tracking (Pending/Processed)
- GitHub identity integration
- Claude Code hook integration via `UserPromptSubmit`
- Auto-cleanup on workspace close
