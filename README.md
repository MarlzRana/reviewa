# Reviewa

Leave inline code review comments on any file or git diff in VS Code, automatically injected into Claude Code, Codex, or Gemini CLI's context to be resolved.

## Features

- **Inline comments** — click the comment gutter icon on any line to leave a review comment, just like on a GitHub PR
- **Diff view support** — comment on additions, removals, or unchanged context lines in both split and inline diff views
- **Normal file view support** — leave comments on any file, not just diffs
- **Multi-comment threads** — reply to existing threads with additional comments
- **Edit and delete** — edit pending comments in-place, delete individual comments or entire threads
- **Status tracking** — each comment shows a Pending/Processed label; threads show "Pending comments" or "All comments processed"
- **GitHub identity** — if signed into GitHub in VS Code, your username and rounded avatar appear on comments
- **Claude Code integration** — pending comments are automatically injected into Claude Code's context via a `UserPromptSubmit` hook when you submit your next prompt
- **Codex integration** — pending comments are also injected into OpenAI Codex's context via a Python `UserPromptSubmit` hook
- **Gemini CLI integration** — pending comments are injected into Google Gemini CLI's context via a `BeforeAgent` hook
- **First-come consumption** — whichever CLI processes a comment first consumes it; comments are single-use and deleted from disk once consumed
- **Auto-collapse** — optionally auto-collapse threads when a coding agent consumes them (`reviewa.autoCollapseOnCodingAgentConsumption`)
- **Auto-cleanup** — all pending comments are cleaned up when the workspace closes

## How it works

1. Open any file or diff in VS Code
2. Click the comment icon in the gutter to leave a comment
3. Submit your next prompt in Claude Code, Codex, or Gemini CLI from the same workspace
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
- Claude Code, Codex, and/or Gemini CLI installed with hooks support

## Known Issues

- In inline diff mode, comments cannot be placed on removed lines (VS Code limitation — the removed lines are visual overlays, not addressable document ranges). Use split diff view to comment on removals.
- Claude Code comments cannot be automatically injected on plan reject/approval — only on the next user prompt. Use the provided copy buttons to manually paste comments into the plan response if needed.
- Codex plan review is not supported — Codex does not use a file for plans, so there is no plan to watch or comment on.
- Copilot CLI is not yet supported — it does not support global hooks.
- Windows is not supported — hook scripts use shell wrappers and Unix-style paths.
