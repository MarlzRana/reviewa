import * as fs from 'fs';
import { REVIEWA_DIR } from './types';
import { hasClaudeCode, installClaudeCodeHookScript, registerClaudeCodeHook } from './claudeCodeHookManager';
import { hasCodex, installCodexHookScript, registerCodexHook } from './codexHookManager';
import { hasGeminiCli, installGeminiCliHookScript, registerGeminiCliHook } from './geminiCliHookManager';

export function installHookScripts(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });
	installClaudeCodeHookScript();
	installCodexHookScript();
	installGeminiCliHookScript();
}

export function registerHooks(): void {
	if (hasClaudeCode()) {
		registerClaudeCodeHook();
	}
	if (hasCodex()) {
		registerCodexHook();
	}
	if (hasGeminiCli()) {
		registerGeminiCliHook();
	}
}
