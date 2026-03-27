import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REVIEWA_DIR, COMMENTS_DIR } from './types';

const HOOK_JS_CONTENT = `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COMMENTS_DIR = path.join(require('os').homedir(), '.reviewa', 'v1', 'comments');

function hashLineContent(content) {
	return crypto.createHash('sha256').update(content).digest('hex').substring(0, 6);
}

async function main() {
	// Read stdin
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

	const validComments = [];

	for (const file of files) {
		const filePath = path.join(COMMENTS_DIR, file);
		let comment;
		try {
			comment = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		} catch {
			continue;
		}

		// Only process comments for this workspace
		if (!comment.abs_path || !comment.abs_path.startsWith(cwd)) {
			continue;
		}

		// Stale check: verify line content still matches
		try {
			const fileContent = fs.readFileSync(comment.abs_path, 'utf-8');
			const lines = fileContent.split('\\n');
			const currentLine = lines[comment.line_number - 1] || '';
			const currentHash = hashLineContent(currentLine);

			if (currentHash !== comment.line_content_hash) {
				// Stale comment — line has changed, delete silently
				fs.unlinkSync(filePath);
				continue;
			}
		} catch {
			// File no longer exists or unreadable — delete stale comment
			fs.unlinkSync(filePath);
			continue;
		}

		validComments.push({ comment, filePath });
	}

	if (validComments.length === 0) {
		process.exit(0);
	}

	// Build additionalContext
	const lines = ['=== Reviewa: Inline Code Review Comments ===', ''];
	for (const { comment } of validComments) {
		const relPath = comment.abs_path.startsWith(cwd)
			? comment.abs_path.slice(cwd.length + 1)
			: comment.abs_path;
		lines.push('File: ' + relPath);
		lines.push('Line ' + comment.line_number + ': ' + comment.line_content);
		lines.push('Comment: ' + comment.content);
		lines.push('---');
		lines.push('');
	}

	const additionalContext = lines.join('\\n');

	// Delete consumed comment files
	for (const { filePath } of validComments) {
		try {
			fs.unlinkSync(filePath);
		} catch {
			// Ignore — may have already been cleaned up
		}
	}

	// Output structured JSON for Claude Code
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

export function installHookScript(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });

	const hookJsPath = path.join(REVIEWA_DIR, 'hook.js');
	fs.writeFileSync(hookJsPath, HOOK_JS_CONTENT, { mode: 0o755 });

	const hookShPath = path.join(REVIEWA_DIR, 'hook.sh');
	fs.writeFileSync(hookShPath, HOOK_SH_CONTENT, { mode: 0o755 });
}

export function registerHook(): void {
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

	// Check if reviewa hook is already registered
	const alreadyRegistered = hooks.UserPromptSubmit.some((entry: unknown) => {
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

	if (alreadyRegistered) {
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
