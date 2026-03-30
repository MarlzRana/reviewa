import * as fs from 'fs';
import { REVIEWA_DIR } from './types';
import { hasClaudeCode, installClaudeCodeHookScript, installClaudeCodePlanHookScript, registerClaudeCodeHook, registerClaudeCodePlanHook, unregisterClaudeCodePlanHook } from './claudeCodeHookManager';
import { hasCodex, installCodexHookScript, registerCodexHook } from './codexHookManager';
import { hasGeminiCli, installGeminiCliHookScript, registerGeminiCliHook } from './geminiCliHookManager';

export function installHookScripts(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });
	installClaudeCodeHookScript();
	installClaudeCodePlanHookScript();
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

export function registerPlanHook(): void {
	if (hasClaudeCode()) {
		registerClaudeCodePlanHook();
	}
}

export function unregisterPlanHook(): void {
	unregisterClaudeCodePlanHook();
}
