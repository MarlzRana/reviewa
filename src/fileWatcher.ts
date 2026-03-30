import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMMENTS_DIR } from './types';
import { CommentStore } from './commentStore';

export function createFileWatcher(
	context: vscode.ExtensionContext,
	store: CommentStore,
): void {
	let watcher: fs.FSWatcher;

	try {
		watcher = fs.watch(COMMENTS_DIR, (eventType, filename) => {
			if (eventType !== 'rename' || !filename?.endsWith('.json')) {
				return;
			}

			const filePath = path.join(COMMENTS_DIR, filename);
			if (fs.existsSync(filePath)) {
				return; // File was created or renamed in, not deleted
			}

			const uuid = filename.replace('.json', '');
			if (store.consumeSuppression(uuid)) {
				return; // Deletion was initiated by the UI, not a hook
			}
			const tracked = store.get(uuid);
			if (!tracked) {
				return;
			}

			tracked.thread.comments = tracked.thread.comments.map(c => ({
				...c,
				label: 'Processed',
				contextValue: 'processed',
			}));
			const hasPending = tracked.thread.comments.some(c => c.label === 'Pending');
			tracked.thread.label = hasPending ? 'Pending comments' : 'All comments processed';
			if (!hasPending) {
				const autoCollapse = vscode.workspace.getConfiguration('reviewa').get<boolean>('autoCollapseOnCodingAgentConsumption', false);
				if (autoCollapse) {
					tracked.thread.state = vscode.CommentThreadState.Resolved;
					tracked.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
				}
			}
			tracked.data = { ...tracked.data, status: 'processed' };
			store.notifyPendingCountChanged();
		});
	} catch {
		// Directory may not exist yet at watch time; it will be created on first comment
		return;
	}

	context.subscriptions.push({ dispose: () => watcher.close() });
}
