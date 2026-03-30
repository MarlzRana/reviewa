import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_PLANS_DIR, PLAN_METADATA_DIR, GEMINI_PLAN_METADATA_DIR } from './types';
import { registerClaudePlanHook, unregisterClaudePlanHook, registerGeminiPlanHook, unregisterGeminiPlanHook } from './hookManager';

interface PlanSupportConfig {
	claudeCode: boolean;
	geminiCli: boolean;
}

interface PlanMetadata {
	cwd: string;
	created_at: string;
}

interface GeminiPlanMetadata {
	cwd: string;
	abs_path: string;
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

export function createPlanWatcher(context: vscode.ExtensionContext): void {
	let claudeWatcher: fs.FSWatcher | undefined;
	let claudeActive = false;
	let geminiWatcher: fs.FSWatcher | undefined;
	let geminiActive = false;

	function activateClaude(): void {
		if (claudeActive) {
			deactivateClaude();
		}

		registerClaudePlanHook();

		fs.mkdirSync(CLAUDE_PLANS_DIR, { recursive: true });
		fs.mkdirSync(PLAN_METADATA_DIR, { recursive: true });

		try {
			claudeWatcher = fs.watch(CLAUDE_PLANS_DIR, (_eventType, filename) => {
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

		claudeActive = true;
	}

	function deactivateClaude(): void {
		if (claudeWatcher) {
			claudeWatcher.close();
			claudeWatcher = undefined;
		}
		if (claudeActive) {
			unregisterClaudePlanHook();
			claudeActive = false;
		}
	}

	function activateGemini(): void {
		if (geminiActive) {
			deactivateGemini();
		}

		registerGeminiPlanHook();

		fs.mkdirSync(GEMINI_PLAN_METADATA_DIR, { recursive: true });

		try {
			geminiWatcher = fs.watch(GEMINI_PLAN_METADATA_DIR, (_eventType, filename) => {
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
			return;
		}

		geminiActive = true;
	}

	function deactivateGemini(): void {
		if (geminiWatcher) {
			geminiWatcher.close();
			geminiWatcher = undefined;
		}
		if (geminiActive) {
			unregisterGeminiPlanHook();
			geminiActive = false;
		}
	}

	const config = vscode.workspace.getConfiguration('reviewa').get<PlanSupportConfig>('planSupport');
	if (config?.claudeCode) {
		activateClaude();
	}
	if (config?.geminiCli) {
		activateGemini();
	}

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('reviewa.planSupport')) {
				const newConfig = vscode.workspace.getConfiguration('reviewa').get<PlanSupportConfig>('planSupport');
				if (newConfig?.claudeCode && !claudeActive) {
					activateClaude();
				} else if (!newConfig?.claudeCode && claudeActive) {
					deactivateClaude();
				}
				if (newConfig?.geminiCli && !geminiActive) {
					activateGemini();
				} else if (!newConfig?.geminiCli && geminiActive) {
					deactivateGemini();
				}
			}
		})
	);

	context.subscriptions.push({ dispose: () => { deactivateClaude(); deactivateGemini(); } });
}
