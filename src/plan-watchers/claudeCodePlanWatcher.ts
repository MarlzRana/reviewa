import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PLAN_METADATA_DIR } from '../types';
import { registerClaudePlanHook, unregisterClaudePlanHook } from '../hookManager';
import { PlanMetadata, readPlanMetadataFile, isRelevantPlanMetadata } from '../planUtils';

const NUDGE_KEY = 'claudePlanCopyNudgeCount';
const NUDGE_LIMIT = 10;

async function openPlanFile(metadata: PlanMetadata, globalState: vscode.Memento): Promise<void> {
	if (!vscode.workspace.getConfiguration('reviewa').get('autoOpenOnPlanCreation', true)) {
		return;
	}
	if (!fs.existsSync(metadata.abs_path)) {
		return;
	}
	const uri = vscode.Uri.file(metadata.abs_path);
	await vscode.window.showTextDocument(uri, { preview: false });

	const count = globalState.get<number>(NUDGE_KEY, 0);
	if (count < NUDGE_LIMIT) {
		globalState.update(NUDGE_KEY, count + 1);
		vscode.window.showWarningMessage(
			'Claude Code cannot inject comments on plan approve/reject - only on your next prompt. Use the copy buttons in the editor title menu bar to manually copy comments before your next message.'
		);
	}
}

export function activateClaudePlanWatcher(
	globalState: vscode.Memento,
	onPlanDetected?: (metadata: PlanMetadata, metadataPath: string) => void,
	onMetadataDeleted?: (metadataPath: string) => void,
): fs.FSWatcher | undefined {
	registerClaudePlanHook();

	fs.mkdirSync(PLAN_METADATA_DIR, { recursive: true });

	try {
		return fs.watch(PLAN_METADATA_DIR, (_eventType, filename) => {
			if (!filename?.endsWith('.json')) {
				return;
			}

			const metadataPath = path.join(PLAN_METADATA_DIR, filename);
			const metadata = readPlanMetadataFile(PLAN_METADATA_DIR, filename);
			if (metadata && isRelevantPlanMetadata(metadata)) {
				onPlanDetected?.(metadata, metadataPath);
				openPlanFile(metadata, globalState);
			} else if (!metadata && !fs.existsSync(metadataPath)) {
				onMetadataDeleted?.(metadataPath);
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
