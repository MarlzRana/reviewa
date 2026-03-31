import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_PLANS_DIR, PLAN_METADATA_DIR } from '../types';
import { registerClaudePlanHook, unregisterClaudePlanHook } from '../hookManager';

interface PlanMetadata {
	cwd: string;
	created_at: string;
}

function readPlanMetadata(planName: string): PlanMetadata | null {
	try {
		const metaPath = path.join(PLAN_METADATA_DIR, `${planName}.json`);
		return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
	} catch {
		return null;
	}
}

function isRelevantPlan(planName: string): boolean {
	const metadata = readPlanMetadata(planName);
	if (!metadata?.cwd) {
		return false;
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceFolder) {
		return false;
	}

	const normalizedCwd = metadata.cwd.endsWith('/') ? metadata.cwd : metadata.cwd + '/';
	const normalizedWorkspace = workspaceFolder.endsWith('/') ? workspaceFolder : workspaceFolder + '/';
	return normalizedCwd.startsWith(normalizedWorkspace);
}

async function openPlanFile(planName: string): Promise<void> {
	const filePath = path.join(CLAUDE_PLANS_DIR, `${planName}.md`);
	if (!fs.existsSync(filePath)) {
		return;
	}
	const uri = vscode.Uri.file(filePath);
	await vscode.window.showTextDocument(uri, { preview: false });
}

export function activateClaudePlanWatcher(): fs.FSWatcher | undefined {
	registerClaudePlanHook();

	fs.mkdirSync(CLAUDE_PLANS_DIR, { recursive: true });
	fs.mkdirSync(PLAN_METADATA_DIR, { recursive: true });

	try {
		return fs.watch(CLAUDE_PLANS_DIR, (_eventType, filename) => {
			if (!filename?.endsWith('.md')) {
				return;
			}

			const planName = filename.replace(/\.md$/, '');
			if (isRelevantPlan(planName)) {
				openPlanFile(planName);
			}
		});
	} catch {
		return undefined;
	}
}

export function deactivateClaudePlanWatcher(watcher: fs.FSWatcher | undefined): void {
	if (watcher) {
		watcher.close();
	}
	unregisterClaudePlanHook();
}
