import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { REVIEWA_DIR, COMMENTS_DIR } from './types';

const HOOK_JS_CONTENT = `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const COMMENTS_DIR = path.join(require('os').homedir(), '.reviewa', 'v1', 'comments');

function formatLineContent(comment) {
	const prefix = comment.side === 'addition' ? '+' : comment.side === 'removal' ? '-' : '';
	return prefix + comment.line_content;
}

async function main() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	const input = JSON.parse(Buffer.concat(chunks).toString());
	const cwd = input.cwd;

	if (!cwd || !fs.existsSync(COMMENTS_DIR)) {
		process.exit(0);
	}

	const files = fs.readdirSync(COMMENTS_DIR).filter(f => f.endsWith('.json'));
	if (files.length === 0) {
		process.exit(0);
	}

	const matchedComments = [];

	for (const file of files) {
		const filePath = path.join(COMMENTS_DIR, file);
		let comment;
		try {
			comment = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		} catch {
			continue;
		}

		if (!comment.abs_path || !comment.abs_path.startsWith(cwd)) {
			continue;
		}

		matchedComments.push({ comment, filePath });
	}

	if (matchedComments.length === 0) {
		process.exit(0);
	}

	const parts = [];
	for (const { comment } of matchedComments) {
		const relPath = path.relative(cwd, comment.abs_path);
		const formatted = formatLineContent(comment);
		parts.push('In \\\`' + relPath + '\\\` at line ' + comment.line_number + ':\\n\\\`\\\`\\\`\\n' + formatted + '\\n\\\`\\\`\\\`\\n' + comment.content);
	}

	const additionalContext = parts.join('\\n\\n');

	for (const { filePath } of matchedComments) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	}

	const output = {
		hookSpecificOutput: {
			hookEventName: 'UserPromptSubmit',
			additionalContext,
		},
	};
	process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
`;

const HOOK_SH_CONTENT = `#!/bin/bash
exec node "$HOME/.reviewa/v1/hook.js"
`;

const HOOK_PY_CONTENT = `#!/usr/bin/env python3
import json
import os
import sys

COMMENTS_DIR = os.path.join(os.path.expanduser("~"), ".reviewa", "v1", "comments")


def format_line_content(comment):
    side = comment.get("side", "")
    prefix = "+" if side == "addition" else "-" if side == "removal" else ""
    return prefix + comment.get("line_content", "")


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)

    cwd = data.get("cwd", "")
    if not cwd or not os.path.isdir(COMMENTS_DIR):
        sys.exit(0)

    files = [f for f in os.listdir(COMMENTS_DIR) if f.endswith(".json")]
    if not files:
        sys.exit(0)

    matched = []
    for filename in files:
        filepath = os.path.join(COMMENTS_DIR, filename)
        try:
            with open(filepath, "r") as fh:
                comment = json.load(fh)
        except Exception:
            continue

        abs_path = comment.get("abs_path", "")
        if not abs_path or not abs_path.startswith(cwd):
            continue

        matched.append((comment, filepath))

    if not matched:
        sys.exit(0)

    parts = []
    for comment, _ in matched:
        rel_path = os.path.relpath(comment["abs_path"], cwd)
        formatted = format_line_content(comment)
        parts.append(
            "In \\\`" + rel_path + "\\\` at line " + str(comment["line_number"]) + ":\\n\\\`\\\`\\\`\\n"
            + formatted + "\\n\\\`\\\`\\\`\\n" + comment["content"]
        )

    additional_context = "\\n\\n".join(parts)

    for _, filepath in matched:
        try:
            os.unlink(filepath)
        except Exception:
            pass

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": additional_context,
        }
    }
    sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
`;

export function installHookScript(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });

	const hookJsPath = path.join(REVIEWA_DIR, 'hook.js');
	fs.writeFileSync(hookJsPath, HOOK_JS_CONTENT, { mode: 0o755 });

	const hookShPath = path.join(REVIEWA_DIR, 'hook.sh');
	fs.writeFileSync(hookShPath, HOOK_SH_CONTENT, { mode: 0o755 });

	const hookPyPath = path.join(REVIEWA_DIR, 'hook.py');
	fs.writeFileSync(hookPyPath, HOOK_PY_CONTENT, { mode: 0o755 });
}

function hasReviewaHook(entries: unknown[]): boolean {
	return entries.some((entry: unknown) => {
		if (typeof entry !== 'object' || entry === null) {
			return false;
		}
		const innerHooks = (entry as Record<string, unknown>).hooks;
		if (!Array.isArray(innerHooks)) {
			return false;
		}
		return innerHooks.some((h: unknown) => {
			if (typeof h !== 'object' || h === null) {
				return false;
			}
			const cmd = (h as Record<string, unknown>).command;
			return typeof cmd === 'string' && cmd.includes('reviewa');
		});
	});
}

function registerClaudeHook(): void {
	const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
	const settingsDir = path.dirname(settingsPath);

	fs.mkdirSync(settingsDir, { recursive: true });

	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
	} catch {
		// File doesn't exist or is invalid — start fresh
	}

	if (!settings.hooks || typeof settings.hooks !== 'object') {
		settings.hooks = {};
	}

	const hooks = settings.hooks as Record<string, unknown[]>;

	if (!Array.isArray(hooks.UserPromptSubmit)) {
		hooks.UserPromptSubmit = [];
	}

	if (hasReviewaHook(hooks.UserPromptSubmit)) {
		return;
	}

	hooks.UserPromptSubmit.push({
		hooks: [
			{
				type: 'command',
				command: `bash ${path.join(os.homedir(), '.reviewa', 'v1', 'hook.sh')}`,
				timeout: 10,
			},
		],
	});

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function ensureCodexHooksEnabled(): void {
	const configPath = path.join(os.homedir(), '.codex', 'config.toml');
	const configDir = path.dirname(configPath);

	fs.mkdirSync(configDir, { recursive: true });

	let content = '';
	try {
		content = fs.readFileSync(configPath, 'utf-8');
	} catch {
		// File doesn't exist — create with features section
		fs.writeFileSync(configPath, '[features]\ncodex_hooks = true\n');
		return;
	}

	// Find [features] section
	const featuresIdx = content.search(/^\[features\]/m);
	if (featuresIdx === -1) {
		// No [features] section — append it
		content = content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n';
		fs.writeFileSync(configPath, content);
		return;
	}

	// Extract the [features] section content (up to next section or end)
	const afterFeatures = content.slice(featuresIdx);
	const nextSectionMatch = afterFeatures.slice(1).search(/^\[/m);
	const featuresSection = nextSectionMatch === -1
		? afterFeatures
		: afterFeatures.slice(0, nextSectionMatch + 1);

	// Check for codex_hooks within the features section
	const hooksMatch = featuresSection.match(/^\s*codex_hooks\s*=\s*(true|false)/m);
	if (!hooksMatch) {
		// codex_hooks not defined — insert after [features] header
		content = content.replace(/^\[features\]/m, '[features]\ncodex_hooks = true');
		fs.writeFileSync(configPath, content);
		return;
	}

	if (hooksMatch[1] === 'false') {
		vscode.window.showWarningMessage(
			'Reviewa: codex_hooks is set to false in ~/.codex/config.toml. Codex hook integration will not work until this is set to true.'
		);
	}
}

function registerCodexHook(): void {
	ensureCodexHooksEnabled();

	const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
	const hooksDir = path.dirname(hooksPath);

	fs.mkdirSync(hooksDir, { recursive: true });

	let config: Record<string, unknown> = {};
	try {
		config = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
	} catch {
		// File doesn't exist or is invalid — start fresh
	}

	if (!config.hooks || typeof config.hooks !== 'object') {
		config.hooks = {};
	}

	const hooks = config.hooks as Record<string, unknown[]>;

	if (!Array.isArray(hooks.UserPromptSubmit)) {
		hooks.UserPromptSubmit = [];
	}

	if (hasReviewaHook(hooks.UserPromptSubmit)) {
		return;
	}

	hooks.UserPromptSubmit.push({
		hooks: [
			{
				type: 'command',
				command: `python3 ${path.join(os.homedir(), '.reviewa', 'v1', 'hook.py')}`,
				timeout: 10,
			},
		],
	});

	fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
}

export function registerHooks(): void {
	registerClaudeHook();
	registerCodexHook();
}
