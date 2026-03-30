import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

// Mock fs and child_process before importing modules under test
vi.mock('fs');
vi.mock('child_process');

import * as fs from 'fs';
import { execSync } from 'child_process';

const mockedFs = vi.mocked(fs);
const mockedExecSync = vi.mocked(execSync);

// Import modules under test
import { hasClaudeCode, installClaudeCodeHookScript, installClaudeCodePlanHookScript, registerClaudeCodeHook, registerClaudeCodePlanHook, unregisterClaudeCodePlanHook } from '../../claudeCodeHookManager';
import { hasCodex, installCodexHookScript, registerCodexHook } from '../../codexHookManager';
import { hasGeminiCli, installGeminiCliHookScript, registerGeminiCliHook } from '../../geminiCliHookManager';
import { installHookScripts, registerHooks, registerPlanHook, unregisterPlanHook } from '../../hookManager';
import { REVIEWA_DIR, CLAUDE_HOOKS_DIR } from '../../types';

// Import vscode mock to access showWarningMessage
import * as vscode from 'vscode';

const HOME = os.homedir();

beforeEach(() => {
	vi.clearAllMocks();
	// Default: mkdirSync does nothing
	mockedFs.mkdirSync.mockReturnValue(undefined as unknown as string);
	mockedFs.writeFileSync.mockReturnValue(undefined);
});

// ─── CLI Detection ────────────────────────────────────────────────

describe('CLI Detection', () => {
	describe('hasClaudeCode', () => {
		it('returns true when claude CLI is found', () => {
			mockedExecSync.mockReturnValue(Buffer.from('/usr/local/bin/claude'));
			expect(hasClaudeCode()).toBe(true);
			expect(mockedExecSync).toHaveBeenCalledWith('which claude', { stdio: 'ignore' });
		});

		it('returns false when claude CLI is not found', () => {
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
			expect(hasClaudeCode()).toBe(false);
		});
	});

	describe('hasCodex', () => {
		it('returns true when codex CLI is found', () => {
			mockedExecSync.mockReturnValue(Buffer.from('/usr/local/bin/codex'));
			expect(hasCodex()).toBe(true);
			expect(mockedExecSync).toHaveBeenCalledWith('which codex', { stdio: 'ignore' });
		});

		it('returns false when codex CLI is not found', () => {
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
			expect(hasCodex()).toBe(false);
		});
	});

	describe('hasGeminiCli', () => {
		it('returns true when gemini CLI is found', () => {
			mockedExecSync.mockReturnValue(Buffer.from('/usr/local/bin/gemini'));
			expect(hasGeminiCli()).toBe(true);
			expect(mockedExecSync).toHaveBeenCalledWith('which gemini', { stdio: 'ignore' });
		});

		it('returns false when gemini CLI is not found', () => {
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
			expect(hasGeminiCli()).toBe(false);
		});
	});
});

// ─── Script Installation ──────────────────────────────────────────

describe('Script Installation', () => {
	describe('installClaudeCodeHookScript', () => {
		it('writes hook.js and hook.sh with correct permissions', () => {
			installClaudeCodeHookScript();

			const hookJsPath = path.join(REVIEWA_DIR, 'hook.js');
			const hookShPath = path.join(REVIEWA_DIR, 'hook.sh');

			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookJsPath, expect.stringContaining('#!/usr/bin/env node'), { mode: 0o755 });
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookShPath, expect.stringContaining('#!/bin/bash'), { mode: 0o755 });
		});

		it('hook.js content includes comment processing logic', () => {
			installClaudeCodeHookScript();
			const call = mockedFs.writeFileSync.mock.calls.find(c => String(c[0]).endsWith('hook.js'));
			expect(call).toBeDefined();
			const content = String(call![1]);
			expect(content).toContain('UserPromptSubmit');
			expect(content).toContain('COMMENTS_DIR');
		});
	});

	describe('installClaudeCodePlanHookScript', () => {
		it('creates CLAUDE_HOOKS_DIR and writes plan hook files', () => {
			installClaudeCodePlanHookScript();

			expect(mockedFs.mkdirSync).toHaveBeenCalledWith(CLAUDE_HOOKS_DIR, { recursive: true });

			const hookJsPath = path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.js');
			const hookShPath = path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh');

			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookJsPath, expect.stringContaining('#!/usr/bin/env node'), { mode: 0o755 });
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookShPath, expect.stringContaining('#!/bin/bash'), { mode: 0o755 });
		});
	});

	describe('installCodexHookScript', () => {
		it('writes hook.py with correct permissions', () => {
			installCodexHookScript();

			const hookPyPath = path.join(REVIEWA_DIR, 'hook.py');
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookPyPath, expect.stringContaining('#!/usr/bin/env python3'), { mode: 0o755 });
		});
	});

	describe('installGeminiCliHookScript', () => {
		it('writes hook_gemini.js and hook_gemini.sh with correct permissions', () => {
			installGeminiCliHookScript();

			const hookJsPath = path.join(REVIEWA_DIR, 'hook_gemini.js');
			const hookShPath = path.join(REVIEWA_DIR, 'hook_gemini.sh');

			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookJsPath, expect.stringContaining('#!/usr/bin/env node'), { mode: 0o755 });
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(hookShPath, expect.stringContaining('#!/bin/bash'), { mode: 0o755 });
		});

		it('hook_gemini.js content uses BeforeAgent event', () => {
			installGeminiCliHookScript();
			const call = mockedFs.writeFileSync.mock.calls.find(c => String(c[0]).endsWith('hook_gemini.js'));
			expect(call).toBeDefined();
			const content = String(call![1]);
			expect(content).toContain('BeforeAgent');
		});
	});
});

// ─── Claude Code Hook Registration ───────────────────────────────

describe('registerClaudeCodeHook', () => {
	const settingsPath = path.join(HOME, '.claude', 'settings.json');

	it('creates settings.json from scratch if file does not exist', () => {
		mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

		registerClaudeCodeHook();

		expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.join(HOME, '.claude'), { recursive: true });
		expect(mockedFs.writeFileSync).toHaveBeenCalledWith(settingsPath, expect.any(String));

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.UserPromptSubmit).toHaveLength(1);
		expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toContain('reviewa');
		expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toContain('hook.sh');
	});

	it('preserves existing hooks in settings.json', () => {
		const existingSettings = {
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: 'command', command: 'other-tool' }] }
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

		registerClaudeCodeHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.UserPromptSubmit).toHaveLength(2);
		expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toBe('other-tool');
		expect(written.hooks.UserPromptSubmit[1].hooks[0].command).toContain('reviewa');
	});

	it('is idempotent - does not add duplicate if already registered', () => {
		const existingSettings = {
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: 'command', command: `bash ${path.join(HOME, '.reviewa', 'v1', 'hook.sh')}` }] }
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

		registerClaudeCodeHook();

		// writeFileSync should NOT have been called since hook already exists
		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});

	it('handles settings with hooks object but no UserPromptSubmit array', () => {
		const existingSettings = { hooks: { PreToolUse: [] } };
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

		registerClaudeCodeHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.UserPromptSubmit).toHaveLength(1);
		expect(written.hooks.PreToolUse).toEqual([]);
	});
});

// ─── Claude Code Plan Hook Registration ──────────────────────────

describe('registerClaudeCodePlanHook', () => {
	const settingsPath = path.join(HOME, '.claude', 'settings.json');

	it('adds PreToolUse hook with Write matcher', () => {
		mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

		registerClaudeCodePlanHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.PreToolUse).toHaveLength(1);
		expect(written.hooks.PreToolUse[0].matcher).toBe('Write');
		expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('reviewa');
		expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('pre_tool_use_plan_hook.sh');
	});

	it('is idempotent - does not add duplicate', () => {
		const existing = {
			hooks: {
				PreToolUse: [{
					matcher: 'Write',
					hooks: [{ type: 'command', command: `bash ${path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh')}` }]
				}]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

		registerClaudeCodePlanHook();

		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});
});

describe('unregisterClaudeCodePlanHook', () => {
	const settingsPath = path.join(HOME, '.claude', 'settings.json');

	it('removes reviewa entries from PreToolUse', () => {
		const existing = {
			hooks: {
				PreToolUse: [
					{ hooks: [{ type: 'command', command: 'other-tool' }] },
					{ matcher: 'Write', hooks: [{ type: 'command', command: `bash ${path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh')}` }] },
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

		unregisterClaudeCodePlanHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.PreToolUse).toHaveLength(1);
		expect(written.hooks.PreToolUse[0].hooks[0].command).toBe('other-tool');
	});

	it('deletes PreToolUse array if it becomes empty', () => {
		const existing = {
			hooks: {
				PreToolUse: [
					{ matcher: 'Write', hooks: [{ type: 'command', command: `bash ${path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh')}` }] },
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

		unregisterClaudeCodePlanHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.PreToolUse).toBeUndefined();
	});

	it('returns early if settings file does not exist', () => {
		mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

		unregisterClaudeCodePlanHook();

		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});

	it('returns early if no hooks object in settings', () => {
		mockedFs.readFileSync.mockReturnValue(JSON.stringify({}));

		unregisterClaudeCodePlanHook();

		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});

	it('returns early if no PreToolUse array', () => {
		mockedFs.readFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));

		unregisterClaudeCodePlanHook();

		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});
});

// ─── Codex Registration ──────────────────────────────────────────

describe('registerCodexHook', () => {
	const hooksPath = path.join(HOME, '.codex', 'hooks.json');
	const configPath = path.join(HOME, '.codex', 'config.toml');

	beforeEach(() => {
		// Default: config.toml doesn't exist (ensureCodexHooksEnabled will create it)
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				throw new Error('ENOENT');
			}
			if (filePath === hooksPath) {
				throw new Error('ENOENT');
			}
			throw new Error('ENOENT');
		});
	});

	it('creates config.toml with codex_hooks = true if it does not exist', () => {
		registerCodexHook();

		// First writeFileSync call should be config.toml creation
		const configCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === configPath);
		expect(configCalls.length).toBeGreaterThanOrEqual(1);
		expect(String(configCalls[0][1])).toContain('codex_hooks = true');
	});

	it('writes hook to hooks.json with UserPromptSubmit', () => {
		registerCodexHook();

		const hooksCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === hooksPath);
		expect(hooksCalls).toHaveLength(1);
		const written = JSON.parse(String(hooksCalls[0][1]));
		expect(written.hooks.UserPromptSubmit).toHaveLength(1);
		expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toContain('hook.py');
		expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toContain('python3');
	});

	it('is idempotent for hooks.json', () => {
		const existingHooks = {
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: 'command', command: `python3 ${path.join(HOME, '.reviewa', 'v1', 'hook.py')}` }] }
				]
			}
		};
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				throw new Error('ENOENT');
			}
			if (filePath === hooksPath) {
				return JSON.stringify(existingHooks);
			}
			throw new Error('ENOENT');
		});

		registerCodexHook();

		// hooks.json should NOT be written since hook already exists
		const hooksCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === hooksPath);
		expect(hooksCalls).toHaveLength(0);
	});

	it('shows warning if codex_hooks is set to false', () => {
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				return '[features]\ncodex_hooks = false\n';
			}
			if (filePath === hooksPath) {
				throw new Error('ENOENT');
			}
			throw new Error('ENOENT');
		});

		registerCodexHook();

		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			expect.stringContaining('codex_hooks is set to false')
		);
	});

	it('appends [features] section if missing from existing config.toml', () => {
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				return '[other]\nsome_key = "value"\n';
			}
			if (filePath === hooksPath) {
				throw new Error('ENOENT');
			}
			throw new Error('ENOENT');
		});

		registerCodexHook();

		const configCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === configPath);
		expect(configCalls.length).toBeGreaterThanOrEqual(1);
		const content = String(configCalls[0][1]);
		expect(content).toContain('[features]\ncodex_hooks = true');
	});

	it('inserts codex_hooks after [features] header if key is missing', () => {
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				return '[features]\nother_flag = true\n';
			}
			if (filePath === hooksPath) {
				throw new Error('ENOENT');
			}
			throw new Error('ENOENT');
		});

		registerCodexHook();

		const configCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === configPath);
		expect(configCalls.length).toBeGreaterThanOrEqual(1);
		const content = String(configCalls[0][1]);
		expect(content).toContain('codex_hooks = true');
	});

	it('does not modify config.toml if codex_hooks = true already set', () => {
		mockedFs.readFileSync.mockImplementation((p: unknown) => {
			const filePath = String(p);
			if (filePath === configPath) {
				return '[features]\ncodex_hooks = true\n';
			}
			if (filePath === hooksPath) {
				throw new Error('ENOENT');
			}
			throw new Error('ENOENT');
		});

		registerCodexHook();

		const configCalls = mockedFs.writeFileSync.mock.calls.filter(c => String(c[0]) === configPath);
		expect(configCalls).toHaveLength(0);
	});
});

// ─── Gemini CLI Registration ─────────────────────────────────────

describe('registerGeminiCliHook', () => {
	const settingsPath = path.join(HOME, '.gemini', 'settings.json');

	it('creates settings.json from scratch with BeforeAgent hook', () => {
		mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

		registerGeminiCliHook();

		expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.join(HOME, '.gemini'), { recursive: true });

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.BeforeAgent).toHaveLength(1);
		expect(written.hooks.BeforeAgent[0].hooks[0].command).toContain('reviewa');
		expect(written.hooks.BeforeAgent[0].hooks[0].command).toContain('hook_gemini.sh');
		expect(written.hooks.BeforeAgent[0].hooks[0].timeout).toBe(10000);
	});

	it('is idempotent', () => {
		const existing = {
			hooks: {
				BeforeAgent: [
					{ hooks: [{ type: 'command', command: `bash ${path.join(HOME, '.reviewa', 'v1', 'hook_gemini.sh')}` }] }
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

		registerGeminiCliHook();

		expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
	});

	it('preserves existing hooks', () => {
		const existing = {
			hooks: {
				BeforeAgent: [
					{ hooks: [{ type: 'command', command: 'other-tool' }] }
				]
			}
		};
		mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

		registerGeminiCliHook();

		const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
		expect(written.hooks.BeforeAgent).toHaveLength(2);
	});
});

// ─── Orchestrator (hookManager.ts) ───────────────────────────────

describe('hookManager orchestrator', () => {
	describe('installHookScripts', () => {
		it('creates REVIEWA_DIR and calls all install functions', () => {
			installHookScripts();

			expect(mockedFs.mkdirSync).toHaveBeenCalledWith(REVIEWA_DIR, { recursive: true });
			// Claude hook.js + hook.sh
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(REVIEWA_DIR, 'hook.js'), expect.any(String), { mode: 0o755 }
			);
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(REVIEWA_DIR, 'hook.sh'), expect.any(String), { mode: 0o755 }
			);
			// Plan hook files
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.js'), expect.any(String), { mode: 0o755 }
			);
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh'), expect.any(String), { mode: 0o755 }
			);
			// Codex hook.py
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(REVIEWA_DIR, 'hook.py'), expect.any(String), { mode: 0o755 }
			);
			// Gemini hook_gemini.js + hook_gemini.sh
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(REVIEWA_DIR, 'hook_gemini.js'), expect.any(String), { mode: 0o755 }
			);
			expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
				path.join(REVIEWA_DIR, 'hook_gemini.sh'), expect.any(String), { mode: 0o755 }
			);
		});
	});

	describe('registerHooks', () => {
		it('registers hooks only for detected CLIs', () => {
			// All CLIs present
			mockedExecSync.mockReturnValue(Buffer.from('/usr/local/bin/something'));
			mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

			registerHooks();

			// Should have written 3 config files (claude settings.json, codex config.toml + hooks.json, gemini settings.json)
			const writeCalls = mockedFs.writeFileSync.mock.calls.map(c => String(c[0]));
			expect(writeCalls).toContain(path.join(HOME, '.claude', 'settings.json'));
			expect(writeCalls).toContain(path.join(HOME, '.codex', 'hooks.json'));
			expect(writeCalls).toContain(path.join(HOME, '.gemini', 'settings.json'));
		});

		it('skips registration for missing CLIs', () => {
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
			mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

			registerHooks();

			// No config files should be written
			expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
		});

		it('registers only available CLIs', () => {
			let callCount = 0;
			mockedExecSync.mockImplementation((cmd: unknown) => {
				const cmdStr = String(cmd);
				if (cmdStr === 'which claude') {
					return Buffer.from('/usr/local/bin/claude');
				}
				throw new Error('not found');
			});
			mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

			registerHooks();

			const writeCalls = mockedFs.writeFileSync.mock.calls.map(c => String(c[0]));
			expect(writeCalls).toContain(path.join(HOME, '.claude', 'settings.json'));
			expect(writeCalls).not.toContain(path.join(HOME, '.codex', 'hooks.json'));
			expect(writeCalls).not.toContain(path.join(HOME, '.gemini', 'settings.json'));
		});
	});

	describe('registerPlanHook', () => {
		it('registers plan hook if Claude Code is detected', () => {
			mockedExecSync.mockReturnValue(Buffer.from('/usr/local/bin/claude'));
			mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

			registerPlanHook();

			const writeCalls = mockedFs.writeFileSync.mock.calls;
			const settingsCall = writeCalls.find(c => String(c[0]).includes('settings.json'));
			expect(settingsCall).toBeDefined();
			const written = JSON.parse(String(settingsCall![1]));
			expect(written.hooks.PreToolUse).toBeDefined();
		});

		it('does not register plan hook if Claude Code is not detected', () => {
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });

			registerPlanHook();

			expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
		});
	});

	describe('unregisterPlanHook', () => {
		it('calls unregister unconditionally (no CLI detection)', () => {
			// Even if execSync would throw, unregister should still run
			mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
			const existing = {
				hooks: {
					PreToolUse: [
						{ matcher: 'Write', hooks: [{ type: 'command', command: `bash ${path.join(CLAUDE_HOOKS_DIR, 'pre_tool_use_plan_hook.sh')}` }] },
					]
				}
			};
			mockedFs.readFileSync.mockReturnValue(JSON.stringify(existing));

			unregisterPlanHook();

			expect(mockedFs.writeFileSync).toHaveBeenCalled();
			const written = JSON.parse(String(mockedFs.writeFileSync.mock.calls[0][1]));
			expect(written.hooks.PreToolUse).toBeUndefined();
		});
	});
});
