import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { REVIEWA_DIR } from './types';

export function hasCodex(): boolean {
	try {
		execSync('which codex', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

const HOOK_PY_CONTENT = `#!/usr/bin/env python3
import json
import os
import sys

COMMENTS_DIR = os.path.join(os.path.expanduser("~"), ".reviewa", "v1", "comments")


def format_line_content(comment):
    side = comment.get("side", "")
    prefix = "+" if side == "addition" else "-" if side == "removal" else ""
    return prefix + comment.get("line_content", "")


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)

    cwd = data.get("cwd", "")
    if not cwd or not os.path.isdir(COMMENTS_DIR):
        sys.exit(0)

    files = [f for f in os.listdir(COMMENTS_DIR) if f.endswith(".json")]
    if not files:
        sys.exit(0)

    matched = []
    for filename in files:
        filepath = os.path.join(COMMENTS_DIR, filename)
        try:
            with open(filepath, "r") as fh:
                comment = json.load(fh)
        except Exception:
            continue

        consumer = comment.get("intended_consumer")
        if consumer is not None and consumer != "codex":
            continue

        abs_path = comment.get("abs_path", "")
        if not abs_path or not abs_path.startswith(cwd):
            continue

        matched.append((comment, filepath))

    if not matched:
        sys.exit(0)

    matched.sort(key=lambda x: x[0].get("created_at", ""))

    parts = []
    for comment, _ in matched:
        rel_path = os.path.relpath(comment["abs_path"], cwd)
        formatted = format_line_content(comment)
        parts.append(
            "In \\\`" + rel_path + "\\\` at line " + str(comment["line_number"]) + ":\\n\\\`\\\`\\\`\\n"
            + formatted + "\\n\\\`\\\`\\\`\\n" + comment["content"]
        )

    additional_context = "\\n\\n".join(parts)

    for _, filepath in matched:
        try:
            os.unlink(filepath)
        except Exception:
            pass

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": additional_context,
        }
    }
    sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
`;

export function installCodexHookScript(): void {
	const hookPyPath = path.join(REVIEWA_DIR, 'hook.py');
	fs.writeFileSync(hookPyPath, HOOK_PY_CONTENT, { mode: 0o755 });
}

function ensureCodexHooksEnabled(): void {
	const configPath = path.join(os.homedir(), '.codex', 'config.toml');
	const configDir = path.dirname(configPath);

	fs.mkdirSync(configDir, { recursive: true });

	let content = '';
	try {
		content = fs.readFileSync(configPath, 'utf-8');
	} catch {
		// File doesn't exist — create with features section
		fs.writeFileSync(configPath, '[features]\ncodex_hooks = true\n');
		return;
	}

	// Find [features] section
	const featuresIdx = content.search(/^\[features\]/m);
	if (featuresIdx === -1) {
		// No [features] section — append it
		content = content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n';
		fs.writeFileSync(configPath, content);
		return;
	}

	// Extract the [features] section content (up to next section or end)
	const afterFeatures = content.slice(featuresIdx);
	const nextSectionMatch = afterFeatures.slice(1).search(/^\[/m);
	const featuresSection = nextSectionMatch === -1
		? afterFeatures
		: afterFeatures.slice(0, nextSectionMatch + 1);

	// Check for codex_hooks within the features section
	const hooksMatch = featuresSection.match(/^\s*codex_hooks\s*=\s*(true|false)/m);
	if (!hooksMatch) {
		// codex_hooks not defined — insert after [features] header
		content = content.replace(/^\[features\]/m, '[features]\ncodex_hooks = true');
		fs.writeFileSync(configPath, content);
		return;
	}

	if (hooksMatch[1] === 'false') {
		vscode.window.showWarningMessage(
			'Reviewa: codex_hooks is set to false in ~/.codex/config.toml. Codex hook integration will not work until this is set to true.'
		);
	}
}

export function registerCodexHook(): void {
	ensureCodexHooksEnabled();

	const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
	const hooksDir = path.dirname(hooksPath);

	fs.mkdirSync(hooksDir, { recursive: true });

	let config: Record<string, unknown> = {};
	try {
		config = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
	} catch {
		// File doesn't exist or is invalid — start fresh
	}

	if (!config.hooks || typeof config.hooks !== 'object') {
		config.hooks = {};
	}

	const hooks = config.hooks as Record<string, unknown[]>;

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
				command: `python3 ${path.join(os.homedir(), '.reviewa', 'v1', 'hook.py')}`,
				timeout: 10,
			},
		],
	});

	fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
}
