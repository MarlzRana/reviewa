## Mission
Create a VS Code extension called "Reviewa" that lets developers leave inline code review comments on their local git diffs, which are automatically injected into Claude Code's context to be resolved.

The workflow:
1. Developer opens the Source Control tab in VS Code and views their local file diffs
2. Developer leaves inline comments on any line in the diff (edited or not) — exactly like leaving review comments on a GitHub PR
3. Developer submits their next prompt in Claude Code CLI as normal
4. Claude receives the pending comments as additional context and resolves them
5. Comments are marked as resolved and collapsed in the diff viewer so the developer can see what was picked up

## Resources
- VS Code Extension API docs: /Users/marlzrana/gh/microsoft/vscode-docs
- Claude Code Hooks documentation: /Users/marlzrana/gh/ericbuess/claude-code-docs
- GitHub Pull Request extension (provided, for reference on Comment Controller patterns and git URI resolution): /Users/marlzrana/gh/Microsoft/vscode-pull-request-github

## Architecture

### Comment Storage
Comments are stored as individual JSON files:
```
~/.reviewa/
  v1/
    comments/
      <uuid>.json
      <uuid>.json
```

Schema:
```json
{
  "uuid": "a3f2bc91-...",
  "status": "pending",
  "created_at": "2026-03-27T10:00:00Z",
  "workspace": "/Users/alice/projects/my-app",
  "abs_path": "/Users/alice/projects/my-app/src/auth/login.ts",
  "line_number": 42,
  "line_content": "const token = jwt.sign(payload, secret)",
  "line_content_hash": "a3f2d9...",
  "content": "Add expiresIn: '1h' to jwt.sign options"
}
```

Status values: `pending` | `processed`

### VS Code Extension
- Uses the VS Code Comment Controller API to render a GitHub-style inline comment UI
- Comments are restricted to the Source Control diff viewer only (`scheme === "git"`) — the comment gutter never appears when viewing files normally in the editor
- Git URIs must be resolved to real `abs_path` file paths before writing the comment JSON — reference the GitHub Pull Request extension for this pattern
- On activation: ensures `~/.reviewa/v1/comments/` exists
- On activation: registers the `UserPromptSubmit` hook in `~/.claude/settings.json` if not already present
- Maintains an in-memory `Map<uuid, { comment, thread: vscode.CommentThread }>` as the source of truth for the UI
- On comment submit: writes a new comment JSON file to `~/.reviewa/v1/comments/` and adds it to the in-memory store with `status: "pending"`
- Watches `~/.reviewa/v1/comments/` for deletions — when a file is deleted, the corresponding in-memory entry is marked `status: "processed"`, and the thread is collapsed and marked as resolved so the developer can see it was picked up by Claude

### Claude Code Hooks
One hook registered in `~/.claude/settings.json` on extension activation:
- `UserPromptSubmit`: scans comments dir for comments whose `abs_path` starts with `cwd`. Stale comments (line content hash no longer matches) are deleted and skipped. Valid comments are injected as `additionalContext` then deleted.

## Verification
- Comment gutter only appears in the Source Control diff viewer, not in normal file editor tabs
- Leave a comment on any line in a diff in VS Code → JSON file appears in `~/.reviewa/v1/comments/`, thread appears in diff viewer with `status: "pending"`
- Submit a prompt in Claude Code from the same workspace → comments appear in context, JSON files are deleted, in-memory status flips to `processed`, threads collapse and display as resolved in the diff viewer
- Stale comments (line has changed) are deleted silently and do not appear in context
- Comments from other workspaces are not injected when Claude Code is run from a different directory



2.
## Mission
I want to now implement support for Gemini plans, in the same we do for Claude plans. Gemini users should be able to get their plans to auto open in VSCode, and they should be able to leave comments on it if need be, and copy them over if wanted (and the nice thing is that the BeforeAgent hook can also auto consume them, which is not something we have with Claude Code).

## High-Level Implementation
  Here is the rough schematic of how it should work (you will likely have to do extra steps, I am just capture the core idea):
  - Register a BeforeTool hook at looks for writes that are match the ~/gemini/tmp/<some-project-dir-can-be-anything>/<session-id-can-be-anything>/plans/<plan-name>.md (use a glob or equivalent) and if it get's a match writes to the ~/.reviewa/gemini-cli/plan-metadata/<plan-name>.json - this json should follow the same schema and semantics as the Claude Code plan-metadata
  - There will be a fileWatcher looking at ~/.reviewa/gemini-cli/plan-metadata/ and only if it gets relevant matches will it open (workspace cwd makes up/is logical path)
  - Any comments we leave on Gemini plans with have an `intended_consumer` of gemini-cli (we will also have to update the hook script for the gemini cli to allow message with an `intended_consumer` of gemini-cli through)

## Resources
- VS Code Extension API docs: /Users/marlzrana/gh/microsoft/vscode-docs
- Gemini CLI source code with docs: /Users/marlzrana/gh/google-gemini/gemini-cli

## Guidance
Use the AskUserQuestion tool if anything in unclear/ambigious 

3. 
## Mission
I want to support showing plans related to a given workspace in the sidebar, but at the moment the file watcher for the Claude Code is looking at the generic plan directory ~/.claude/plans, and that doesn't provide me the metadata to see what cwd a plan is associated with. I want to the claude code plan watcher, to instead watch the plan-metadata directory instead (like the Gemini CLI), and then post that change I should be able to present plans against a workspace, and also listen using the same file watcher for new relevant plans and present them in the sidebar. I know I can do it given the existing implementation, but I want to align the way the plan watchers work across the different coding agents.

## High level implementation:
- We need to change the PreToolUse hook to a PostToolUse one, see what a hook deprecation looks like by looking at the Gemini hooks where we deprecated the BeforeAgent hook for a BeforeModel one
- The claudeCodePlanWatcher should now be listening on plan-metadata instead, looking for relevant matches, and if it finds one it uses the cwd in the plan metadata to open the plan 

## Resources
- VS Code Extension API docs: /Users/marlzrana/gh/microsoft/vscode-docs
- Claude Code documentation: /Users/marlzrana/gh/ericbuess/claude-code-docs

## Guidance
Use the AskUserQuestion tool if anything in unclear/ambigious 
