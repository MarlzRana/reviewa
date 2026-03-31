import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GEMINI_PLAN_METADATA_DIR } from '../types';
import { registerGeminiPlanHook, unregisterGeminiPlanHook } from '../hookManager';

interface GeminiPlanMetadata {
	cwd: string;
	abs_path: string;
	created_at: string;
}

function readGeminiPlanMetadata(filename: string): GeminiPlanMetadata | null {
	try {
		const metaPath = path.join(GEMINI_PLAN_METADATA_DIR, filename);
		return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
	} catch {
		return null;
	}
}

function isRelevantGeminiPlan(filename: string): boolean {
	const metadata = readGeminiPlanMetadata(filename);
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

async function openGeminiPlanFile(metadata: GeminiPlanMetadata): Promise<void> {
	if (!fs.existsSync(metadata.abs_path)) {
		return;
	}
	const uri = vscode.Uri.file(metadata.abs_path);
	await vscode.window.showTextDocument(uri, { preview: false });
}

export function activateGeminiPlanWatcher(): fs.FSWatcher | undefined {
	registerGeminiPlanHook();

	fs.mkdirSync(GEMINI_PLAN_METADATA_DIR, { recursive: true });

	try {
		return fs.watch(GEMINI_PLAN_METADATA_DIR, (_eventType, filename) => {
			if (!filename?.endsWith('.json')) {
				return;
			}

			if (isRelevantGeminiPlan(filename)) {
				const metadata = readGeminiPlanMetadata(filename);
				if (metadata) {
					openGeminiPlanFile(metadata);
				}
			}
		});
	} catch {
		return undefined;
	}
}

export function deactivateGeminiPlanWatcher(watcher: fs.FSWatcher | undefined): void {
	if (watcher) {
		watcher.close();
	}
	unregisterGeminiPlanHook();
}
