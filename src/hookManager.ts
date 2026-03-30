import * as fs from 'fs';
import { REVIEWA_DIR } from './types';
import { hasClaudeCode, installClaudeCodeHookScript, installClaudeCodePlanHookScript, registerClaudeCodeHook, registerClaudeCodePlanHook, unregisterClaudeCodePlanHook } from './claudeCodeHookManager';
import { hasCodex, installCodexHookScript, registerCodexHook } from './codexHookManager';
import { hasGeminiCli, installGeminiCliHookScript, installGeminiCliPlanHookScript, registerGeminiCliHook, registerGeminiCliPlanHook, unregisterGeminiCliPlanHook } from './geminiCliHookManager';

export function installHookScripts(): void {
	fs.mkdirSync(REVIEWA_DIR, { recursive: true });
	installClaudeCodeHookScript();
	installClaudeCodePlanHookScript();
	installCodexHookScript();
	installGeminiCliHookScript();
	installGeminiCliPlanHookScript();
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

export function registerClaudePlanHook(): void {
	if (hasClaudeCode()) {
		registerClaudeCodePlanHook();
	}
}

export function unregisterClaudePlanHook(): void {
	unregisterClaudeCodePlanHook();
}

export function registerGeminiPlanHook(): void {
	if (hasGeminiCli()) {
		registerGeminiCliPlanHook();
	}
}

export function unregisterGeminiPlanHook(): void {
	unregisterGeminiCliPlanHook();
}
