# Changelog

All notable changes to the Reviewa extension will be documented in this file.

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
