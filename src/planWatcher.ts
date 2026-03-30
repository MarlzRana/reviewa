import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_PLANS_DIR, PLAN_METADATA_DIR } from './types';
import { registerPlanHook, unregisterPlanHook } from './hookManager';

interface PlanSupportConfig {
	claudeCode: boolean;
}

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

export function createPlanWatcher(context: vscode.ExtensionContext): void {
	let watcher: fs.FSWatcher | undefined;
	let planSupportActive = false;

	function activate(): void {
		if (planSupportActive) {
			deactivate();
		}

		registerPlanHook();

		fs.mkdirSync(CLAUDE_PLANS_DIR, { recursive: true });
		fs.mkdirSync(PLAN_METADATA_DIR, { recursive: true });

		try {
			watcher = fs.watch(CLAUDE_PLANS_DIR, (_eventType, filename) => {
				if (!filename?.endsWith('.md')) {
					return;
				}

				const planName = filename.replace(/\.md$/, '');
				if (isRelevantPlan(planName)) {
					openPlanFile(planName);
				}
			});
		} catch {
			return;
		}

		planSupportActive = true;
	}

	function deactivate(): void {
		if (watcher) {
			watcher.close();
			watcher = undefined;
		}
		if (planSupportActive) {
			unregisterPlanHook();
			planSupportActive = false;
		}
	}

	const config = vscode.workspace.getConfiguration('reviewa').get<PlanSupportConfig>('planSupport');
	if (config?.claudeCode) {
		activate();
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('reviewa.planSupport')) {
				const newConfig = vscode.workspace.getConfiguration('reviewa').get<PlanSupportConfig>('planSupport');
				if (newConfig?.claudeCode) {
					activate();
				} else {
					deactivate();
				}
			}
		})
	);

	context.subscriptions.push({ dispose: deactivate });
}
