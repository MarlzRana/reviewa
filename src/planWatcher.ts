import * as vscode from 'vscode';
import { activateClaudePlanWatcher, deactivateClaudePlanWatcher } from './plan-watchers/claudeCodePlanWatcher';
import { activateGeminiPlanWatcher, deactivateGeminiPlanWatcher } from './plan-watchers/geminiCliPlanWatcher';
import { PlanStore } from './planStore';

export function createPlanWatcher(context: vscode.ExtensionContext, planStore: PlanStore): void {
	const claudeWatcher = activateClaudePlanWatcher(
		context.globalState,
		(metadata, metadataPath) => {
			planStore.add(planStore.toEntry(metadata, 'claude', true, metadataPath));
		},
		metadataPath => planStore.remove(metadataPath),
	);

	const geminiWatcher = activateGeminiPlanWatcher(
		(metadata, metadataPath) => {
			planStore.add(planStore.toEntry(metadata, 'gemini', true, metadataPath));
		},
		metadataPath => planStore.remove(metadataPath),
	);

	context.subscriptions.push({
		dispose: () => {
			deactivateClaudePlanWatcher(claudeWatcher);
			deactivateGeminiPlanWatcher(geminiWatcher);
		},
	});
}
