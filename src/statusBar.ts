import * as vscode from 'vscode';
import { CommentStore } from './commentStore';

export function createStatusBarItem(
	context: vscode.ExtensionContext,
	store: CommentStore,
): void {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	item.command = 'workbench.action.focusCommentsPanel';
	context.subscriptions.push(item);

	let hasEverHadComment = false;

	function update() {
		const pending = store.getPendingCount();

		if (pending > 0) {
			hasEverHadComment = true;
			item.text = `$(comment-discussion) ${pending}`;
			item.tooltip = `${pending} pending comment thread${pending === 1 ? '' : 's'}`;
			item.show();
		} else if (hasEverHadComment) {
			const processed = store.getProcessedCount();
			item.text = `$(comment-discussion)`;
			item.tooltip = processed > 0 ? `${processed} processed comment thread${processed === 1 ? '' : 's'}` : '';
			item.show();
		} else {
			item.hide();
		}
	}

	context.subscriptions.push(store.onDidChangePendingCount(update));
	update();
}
