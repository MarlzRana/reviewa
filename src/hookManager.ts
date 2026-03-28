import * as fs from 'fs';
import { REVIEWA_DIR } from './types';
import { installClaudeHookScript, registerClaudeHook } from './claudeHookManager';
import { installCodexHookScript, registerCodexHook } from './codexHookManager';

export function installHookScripts(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });
	installClaudeHookScript();
	installCodexHookScript();
}

export function registerHooks(): void {
	registerClaudeHook();
	registerCodexHook();
}
