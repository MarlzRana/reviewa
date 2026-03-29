import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { REVIEWA_DIR } from './types';

export function hasGeminiCli(): boolean {
	try {
		execSync('which gemini', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

const HOOK_GEMINI_JS_CONTENT = `#!/usr/bin/env node
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

	matchedComments.sort((a, b) => (a.comment.created_at || '').localeCompare(b.comment.created_at || ''));

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
			hookEventName: 'BeforeAgent',
			additionalContext,
		},
	};
	process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
`;

const HOOK_GEMINI_SH_CONTENT = `#!/bin/bash
exec node "$HOME/.reviewa/v1/hook_gemini.js"
`;

export function installGeminiCliHookScript(): void {
	const hookJsPath = path.join(REVIEWA_DIR, 'hook_gemini.js');
	fs.writeFileSync(hookJsPath, HOOK_GEMINI_JS_CONTENT, { mode: 0o755 });

	const hookShPath = path.join(REVIEWA_DIR, 'hook_gemini.sh');
	fs.writeFileSync(hookShPath, HOOK_GEMINI_SH_CONTENT, { mode: 0o755 });
}

export function registerGeminiCliHook(): void {
	const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
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

	if (!Array.isArray(hooks.BeforeAgent)) {
		hooks.BeforeAgent = [];
	}

	// Check if reviewa hook is already registered
	const alreadyRegistered = hooks.BeforeAgent.some((entry: unknown) => {
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

	hooks.BeforeAgent.push({
		hooks: [
			{
				type: 'command',
				command: `bash ${path.join(os.homedir(), '.reviewa', 'v1', 'hook_gemini.sh')}`,
				timeout: 10000,
			},
		],
	});

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
