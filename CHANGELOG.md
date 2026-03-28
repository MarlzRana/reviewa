# Changelog

All notable changes to the Reviewa extension will be documented in this file.

## [0.0.3] - 2026-03-28

### Added

- Codex CLI hook support — review comments are now injected into OpenAI Codex via a Python `UserPromptSubmit` hook
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
