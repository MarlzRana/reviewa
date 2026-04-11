import * as fs from 'fs';
import { REVIEWA_DIR } from './types';
import {
  hasClaudeCode,
  installClaudeCodeHookScript,
  installClaudeCodePlanHookScript,
  registerClaudeCodeHook,
  registerClaudeCodePlanHook,
} from './hook-managers/claude-code/claudeCodeHookManager';
import {
  hasCodex,
  installCodexHookScript,
  registerCodexHook,
} from './hook-managers/codex/codexHookManager';
import {
  hasGeminiCli,
  installGeminiCliHookScript,
  installGeminiCliPlanHookScript,
  registerGeminiCliHook,
  registerGeminiCliPlanHook,
} from './hook-managers/gemini-cli/geminiCliHookManager';

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

export function registerGeminiPlanHook(): void {
  if (hasGeminiCli()) {
    registerGeminiCliPlanHook();
  }
}
