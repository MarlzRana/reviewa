import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { GEMINI_HOOKS_DIR, CodingCliTool } from '../../types';
import { copyHookScript } from '../scriptUtils';

export function hasGeminiCli(): boolean {
  try {
    execSync('which gemini', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function installGeminiCliHookScript(): void {
  fs.mkdirSync(GEMINI_HOOKS_DIR, { recursive: true });

  copyHookScript(CodingCliTool.GeminiCli, 'before_model_insert_comments.js', path.join(GEMINI_HOOKS_DIR, 'before_model_insert_comments.js'));
  copyHookScript(CodingCliTool.GeminiCli, 'before_model_insert_comments.sh', path.join(GEMINI_HOOKS_DIR, 'before_model_insert_comments.sh'));
}

function isReviewaHookEntry(entry: unknown): boolean {
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

  // Reviewa previously registered under BeforeAgent — remove any leftover entries
  if (Array.isArray(hooks.BeforeAgent)) {
    const filtered = hooks.BeforeAgent.filter(
      (entry) => !isReviewaHookEntry(entry),
    );
    if (filtered.length !== hooks.BeforeAgent.length) {
      if (filtered.length === 0) {
        delete hooks.BeforeAgent;
      } else {
        hooks.BeforeAgent = filtered;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
  }

  if (!Array.isArray(hooks.BeforeModel)) {
    hooks.BeforeModel = [];
  }

  if (hooks.BeforeModel.some(isReviewaHookEntry)) {
    return;
  }

  hooks.BeforeModel.push({
    hooks: [
      {
        type: 'command',
        command: `bash ${path.join(os.homedir(), '.reviewa', 'v1', 'gemini-cli', 'hooks', 'before_model_insert_comments.sh')}`,
        timeout: 10000,
      },
    ],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function installGeminiCliPlanHookScript(): void {
  fs.mkdirSync(GEMINI_HOOKS_DIR, { recursive: true });

  copyHookScript(CodingCliTool.GeminiCli, 'after_tool_plan_hook.js', path.join(GEMINI_HOOKS_DIR, 'after_tool_plan_hook.js'));
  copyHookScript(CodingCliTool.GeminiCli, 'after_tool_plan_hook.sh', path.join(GEMINI_HOOKS_DIR, 'after_tool_plan_hook.sh'));
}

export function registerGeminiCliPlanHook(): void {
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

  if (!Array.isArray(hooks.AfterTool)) {
    hooks.AfterTool = [];
  }

  if (hooks.AfterTool.some(isReviewaHookEntry)) {
    return;
  }

  hooks.AfterTool.push({
    matcher: '(write_file|replace)',
    hooks: [
      {
        type: 'command',
        command: `bash ${path.join(os.homedir(), '.reviewa', 'v1', 'gemini-cli', 'hooks', 'after_tool_plan_hook.sh')}`,
        timeout: 10000,
      },
    ],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function unregisterGeminiCliPlanHook(): void {
  const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');

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

  if (!Array.isArray(hooks.AfterTool)) {
    return;
  }

  hooks.AfterTool = hooks.AfterTool.filter(
    (entry) => !isReviewaHookEntry(entry),
  );

  if (hooks.AfterTool.length === 0) {
    delete hooks.AfterTool;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
