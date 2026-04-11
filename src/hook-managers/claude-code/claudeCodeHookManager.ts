import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { REVIEWA_DIR, CLAUDE_HOOKS_DIR, CodingCliTool } from '../../types';
import { copyHookScript } from '../scriptUtils';

export function hasClaudeCode(): boolean {
  try {
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function installClaudeCodePlanHookScript(): void {
  fs.mkdirSync(CLAUDE_HOOKS_DIR, { recursive: true });

  copyHookScript(CodingCliTool.ClaudeCode, 'post_tool_use_plan_hook.js', path.join(CLAUDE_HOOKS_DIR, 'post_tool_use_plan_hook.js'));
  copyHookScript(CodingCliTool.ClaudeCode, 'post_tool_use_plan_hook.sh', path.join(CLAUDE_HOOKS_DIR, 'post_tool_use_plan_hook.sh'));
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
    const filtered = hooks.PreToolUse.filter(
      (entry) => !isReviewaPlanHookEntry(entry),
    );
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

  hooks.PostToolUse = hooks.PostToolUse.filter(
    (entry) => !isReviewaPlanHookEntry(entry),
  );

  if (hooks.PostToolUse.length === 0) {
    delete hooks.PostToolUse;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function installClaudeCodeHookScript(): void {
  copyHookScript(CodingCliTool.ClaudeCode, 'hook.js', path.join(REVIEWA_DIR, 'hook.js'));
  copyHookScript(CodingCliTool.ClaudeCode, 'hook.sh', path.join(REVIEWA_DIR, 'hook.sh'));
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
