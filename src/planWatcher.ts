import * as vscode from 'vscode';
import * as fs from 'fs';
import { activateClaudePlanWatcher, deactivateClaudePlanWatcher } from './plan-watchers/claudeCodePlanWatcher';
import { activateGeminiPlanWatcher, deactivateGeminiPlanWatcher } from './plan-watchers/geminiCliPlanWatcher';
import { PlanStore } from './planStore';

interface PlanSupportConfig {
	claudeCode: boolean;
	geminiCli: boolean;
}

export function createPlanWatcher(context: vscode.ExtensionContext, planStore: PlanStore): void {
	let claudeWatcher: fs.FSWatcher | undefined;
	let claudeActive = false;
	let geminiWatcher: fs.FSWatcher | undefined;
	let geminiActive = false;

	function activateClaude(): void {
		if (claudeActive) {
			deactivateClaude();
		}
		claudeWatcher = activateClaudePlanWatcher(
			context.globalState,
			(metadata, metadataPath) => {
				planStore.add(planStore.toEntry(metadata, 'claude', true, metadataPath));
			},
			metadataPath => planStore.remove(metadataPath),
		);
		claudeActive = true;
	}

	function deactivateClaude(): void {
		if (claudeActive) {
			deactivateClaudePlanWatcher(claudeWatcher);
			claudeWatcher = undefined;
			claudeActive = false;
		}
	}

	function activateGemini(): void {
		if (geminiActive) {
			deactivateGemini();
		}
		geminiWatcher = activateGeminiPlanWatcher(
			(metadata, metadataPath) => {
				planStore.add(planStore.toEntry(metadata, 'gemini', true, metadataPath));
			},
			metadataPath => planStore.remove(metadataPath),
		);
		geminiActive = true;
	}

	function deactivateGemini(): void {
		if (geminiActive) {
			deactivateGeminiPlanWatcher(geminiWatcher);
			geminiWatcher = undefined;
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
