import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PLAN_METADATA_DIR } from '../types';
import { registerClaudePlanHook, unregisterClaudePlanHook } from '../hookManager';

interface PlanMetadata {
	cwd: string;
	abs_path: string;
	created_at: string;
}

const NUDGE_KEY = 'claudePlanCopyNudgeCount';
const NUDGE_LIMIT = 20;

function readPlanMetadata(filename: string): PlanMetadata | null {
	try {
		const metaPath = path.join(PLAN_METADATA_DIR, filename);
		return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
	} catch {
		return null;
	}
}

function isRelevantPlan(filename: string): boolean {
	const metadata = readPlanMetadata(filename);
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

async function openPlanFile(metadata: PlanMetadata, globalState: vscode.Memento): Promise<void> {
	if (!fs.existsSync(metadata.abs_path)) {
		return;
	}
	const uri = vscode.Uri.file(metadata.abs_path);
	await vscode.window.showTextDocument(uri, { preview: false });

	const count = globalState.get<number>(NUDGE_KEY, 0);
	if (count < NUDGE_LIMIT) {
		globalState.update(NUDGE_KEY, count + 1);
		vscode.window.showWarningMessage(
			'Claude Code cannot inject comments on plan approve/reject - only on your next prompt. Use the copy buttons in the editor title bar to manually copy comments before your next message.'
		);
	}
}

export function activateClaudePlanWatcher(globalState: vscode.Memento): fs.FSWatcher | undefined {
	registerClaudePlanHook();

	fs.mkdirSync(PLAN_METADATA_DIR, { recursive: true });

	try {
		return fs.watch(PLAN_METADATA_DIR, (_eventType, filename) => {
			if (!filename?.endsWith('.json')) {
				return;
			}

			if (isRelevantPlan(filename)) {
				const metadata = readPlanMetadata(filename);
				if (metadata) {
					openPlanFile(metadata, globalState);
				}
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
