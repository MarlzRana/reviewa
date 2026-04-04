import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GEMINI_PLAN_METADATA_DIR } from '../types';
import { registerGeminiPlanHook, unregisterGeminiPlanHook } from '../hookManager';
import { PlanMetadata, readPlanMetadataFile, isRelevantPlanMetadata } from '../planUtils';

async function openGeminiPlanFile(metadata: PlanMetadata): Promise<void> {
	if (!fs.existsSync(metadata.abs_path)) {
		return;
	}
	const uri = vscode.Uri.file(metadata.abs_path);
	await vscode.window.showTextDocument(uri, { preview: false });
}

export function activateGeminiPlanWatcher(
	onPlanDetected?: (metadata: PlanMetadata, metadataPath: string) => void,
	onMetadataDeleted?: (metadataPath: string) => void,
): fs.FSWatcher | undefined {
	registerGeminiPlanHook();

	fs.mkdirSync(GEMINI_PLAN_METADATA_DIR, { recursive: true });

	try {
		return fs.watch(GEMINI_PLAN_METADATA_DIR, (_eventType, filename) => {
			if (!filename?.endsWith('.json')) {
				return;
			}

			const metadataPath = path.join(GEMINI_PLAN_METADATA_DIR, filename);
			const metadata = readPlanMetadataFile(GEMINI_PLAN_METADATA_DIR, filename);
			if (metadata && isRelevantPlanMetadata(metadata)) {
				onPlanDetected?.(metadata, metadataPath);
				openGeminiPlanFile(metadata);
			} else if (!metadata && !fs.existsSync(metadataPath)) {
				onMetadataDeleted?.(metadataPath);
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
