import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { REVIEWA_DIR, CLAUDE_HOOKS_DIR } from './types';

export function hasClaudeCode(): boolean {
	try {
		execSync('which claude', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

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

		const consumer = comment.intended_consumer;
		if (consumer && consumer !== 'claude_code') {
			continue;
		}

		const matchPath = comment.logical_abs_path || comment.abs_path;
		if (!matchPath || !matchPath.startsWith(cwd)) {
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
		const displayPath = comment.abs_path.startsWith(cwd) ? path.relative(cwd, comment.abs_path) : comment.abs_path;
		const formatted = formatLineContent(comment);
		parts.push('In \\\`' + displayPath + '\\\` at line ' + comment.line_number + ':\\n\\\`\\\`\\\`\\n' + formatted + '\\n\\\`\\\`\\\`\\n' + comment.content);
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

const PLAN_HOOK_JS_CONTENT = `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CLAUDE_PLANS_PATTERN = /[\\/]\\.claude[\\/]plans[\\/][^\\/]+\\.md$/;
const METADATA_DIR = path.join(require('os').homedir(), '.reviewa', 'v1', 'claude', 'plan-metadata');

async function main() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	const input = JSON.parse(Buffer.concat(chunks).toString());
	const filePath = input.tool_input?.file_path || '';

	if (!CLAUDE_PLANS_PATTERN.test(filePath)) {
		process.exit(0);
	}

	const basename = path.basename(filePath);
	const planName = basename.replace(/\\.md$/, '');
	fs.mkdirSync(METADATA_DIR, { recursive: true });
	fs.writeFileSync(
		path.join(METADATA_DIR, planName + '.json'),
		JSON.stringify({ cwd: input.cwd, abs_path: filePath, created_at: new Date().toISOString() })
	);
}

main().catch(() => process.exit(0));
`;

const PLAN_HOOK_SH_CONTENT = `#!/bin/bash
exec node "$HOME/.reviewa/v1/claude/hooks/post_tool_use_plan_hook.js"
`;

export function installClaudeCodePlanHookScript(): void {
	fs.mkdirSync(CLAUDE_HOOKS_DIR, { recursive: true });

	const hookJsPath = path.join(CLAUDE_HOOKS_DIR, 'post_tool_use_plan_hook.js');
	fs.writeFileSync(hookJsPath, PLAN_HOOK_JS_CONTENT, { mode: 0o755 });

	const hookShPath = path.join(CLAUDE_HOOKS_DIR, 'post_tool_use_plan_hook.sh');
	fs.writeFileSync(hookShPath, PLAN_HOOK_SH_CONTENT, { mode: 0o755 });
}

function isReviewaPlanHookEntry(entry: unknown): boolean {
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
}

export function registerClaudeCodePlanHook(): void {
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

	// Reviewa previously registered under PreToolUse — remove any leftover entries
	if (Array.isArray(hooks.PreToolUse)) {
		const filtered = hooks.PreToolUse.filter(entry => !isReviewaPlanHookEntry(entry));
		if (filtered.length !== hooks.PreToolUse.length) {
			if (filtered.length === 0) {
				delete hooks.PreToolUse;
			} else {
				hooks.PreToolUse = filtered;
			}
			fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
		}
	}

	if (!Array.isArray(hooks.PostToolUse)) {
		hooks.PostToolUse = [];
	}

	if (hooks.PostToolUse.some(isReviewaPlanHookEntry)) {
		return;
	}

	hooks.PostToolUse.push({
		matcher: 'Write',
		hooks: [
			{
				type: 'command',
				command: `bash ${path.join(CLAUDE_HOOKS_DIR, 'post_tool_use_plan_hook.sh')}`,
				timeout: 10,
			},
		],
	});

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function unregisterClaudeCodePlanHook(): void {
	const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
	} catch {
		return;
	}

	if (!settings.hooks || typeof settings.hooks !== 'object') {
		return;
	}

	const hooks = settings.hooks as Record<string, unknown[]>;

	if (!Array.isArray(hooks.PostToolUse)) {
		return;
	}

	hooks.PostToolUse = hooks.PostToolUse.filter(entry => !isReviewaPlanHookEntry(entry));

	if (hooks.PostToolUse.length === 0) {
		delete hooks.PostToolUse;
	}

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function installClaudeCodeHookScript(): void {
	const hookJsPath = path.join(REVIEWA_DIR, 'hook.js');
	fs.writeFileSync(hookJsPath, HOOK_JS_CONTENT, { mode: 0o755 });

	const hookShPath = path.join(REVIEWA_DIR, 'hook.sh');
	fs.writeFileSync(hookShPath, HOOK_SH_CONTENT, { mode: 0o755 });
}

export function registerClaudeCodeHook(): void {
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
