# Reviewa

Leave inline code review comments on any file or git diff in VS Code, automatically injected into Claude Code or Codex CLI's context to be resolved.

## Features

- **Inline comments** — click the comment gutter icon on any line to leave a review comment, just like on a GitHub PR
- **Diff view support** — comment on additions, removals, or unchanged context lines in both split and inline diff views
- **Normal file view support** — leave comments on any file, not just diffs
- **Multi-comment threads** — reply to existing threads with additional comments
- **Edit and delete** — edit pending comments in-place, delete individual comments or entire threads
- **Status tracking** — each comment shows a Pending/Processed label; threads show "Pending comments" or "All comments processed"
- **GitHub identity** — if signed into GitHub in VS Code, your username and avatar appear on comments
- **Claude Code integration** — pending comments are automatically injected into Claude Code's context via a `UserPromptSubmit` hook when you submit your next prompt
- **Codex CLI integration** — pending comments are also injected into OpenAI Codex CLI's context via a Python `UserPromptSubmit` hook
- **First-come consumption** — whichever CLI processes a comment first consumes it; comments are single-use and deleted from disk once consumed
- **Auto-cleanup** — all pending comments are cleaned up when the workspace closes

## How it works

1. Open any file or diff in VS Code
2. Click the comment icon in the gutter to leave a comment
3. Submit your next prompt in Claude Code or Codex CLI from the same workspace
4. Your coding agent receives your comments as additional context and resolves them
5. Comments are marked as processed and threads collapse in VS Code

## Comment context format

Comments are injected into your coding agent's context in this format:

In `src/foo.ts` at line 42:
```
+const x = 1
```
Your comment here

Lines are prefixed with `+` for additions, `-` for removals, or no prefix for normal file/context lines.

## Requirements

- VS Code 1.110.0 or later
- Claude Code CLI and/or Codex CLI installed with hooks support

## Known Issues

- In inline diff mode, comments cannot be placed on removed lines (VS Code limitation — the removed lines are visual overlays, not addressable document ranges). Use split diff view to comment on removals.
